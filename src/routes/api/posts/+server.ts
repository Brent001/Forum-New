import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { appSettings, communities, mediaAssets, posts, userInteractions } from '$lib/server/db/schema.js';
import { getActor, getCommunityBan, recordInteraction } from '$lib/server/social.js';
import { communityMemberships } from '$lib/server/db/schema.js';
import { getPrivateB2Config } from '$lib/server/b2-config.js';
import { getB2ConfigForObjectKey, isObjectInPublicBucket, verifyB2BucketAccess } from '$lib/storage/b2.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to publish a post.' }, { status: 401 });
	if (actor.isBanned) return json({ error: actor.banReason || 'This account is suspended.' }, { status: 403 });

	const payload = await event.request.json().catch(() => null);
	if (!payload || typeof payload !== 'object') return json({ error: 'Invalid request body.' }, { status: 400 });
	const clientRequestId = String(payload.clientRequestId ?? '').trim().slice(0, 100);
	if (clientRequestId && !/^[A-Za-z0-9_-]{16,100}$/.test(clientRequestId)) return json({ error: 'Invalid post request identifier.' }, { status: 400 });
	if (clientRequestId) {
		const [existing] = await db.select({ id: posts.id, authorId: posts.authorId }).from(posts).where(eq(posts.idempotencyKey, clientRequestId)).limit(1);
		if (existing) return existing.authorId === actor.id
			? json({ ok: true, id: existing.id, redirectTo: `/post/${existing.id}`, deduplicated: true }, { status: 200 })
			: json({ error: 'Post request identifier conflict.' }, { status: 409 });
	}
	const title = String(payload.title ?? '').trim();
	const body = String(payload.body ?? '').trim();
	const url = String(payload.url ?? '').trim();
	const postType = ['discussion', 'link', 'poll'].includes(String(payload.postType)) ? String(payload.postType) : 'discussion';
	const communitySlug = String(payload.communitySlug ?? '').trim().replace(/^c\//, '').replace(/^r\//, '').toLowerCase();
	const flair = String(payload.flair ?? '').trim().slice(0, 32) || null;

	if (title.length < 3 || title.length > 220) return json({ error: 'Titles must be between 3 and 220 characters.' }, { status: 400 });
	if (body.length > 12000) return json({ error: 'Post body is too long (maximum 12,000 characters).' }, { status: 400 });
	if (postType === 'link' && !url) return json({ error: 'Add a URL for a link post.' }, { status: 400 });
	if (url) {
		try {
			const parsed = new URL(url);
			if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
		} catch {
			return json({ error: 'Enter a valid http or https URL.' }, { status: 400 });
		}
	}

	const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
	const perHour = Math.max(1, Number(settings?.postRateLimitPerHour ?? 10));
	const since = new Date(Date.now() - 60 * 60 * 1000);
	const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(posts).where(and(eq(posts.authorId, actor.id), gt(posts.createdAt, since)));
	if (Number(countRow?.count ?? 0) >= perHour && !actor.isOwner && !actor.isAdmin) {
		return json({ error: `You have reached the limit of ${perHour} posts per hour.` }, { status: 429 });
	}

	let communityId: string | null = null;
	if (communitySlug) {
		const [community] = await db.select({ id: communities.id, isPrivate: communities.isPrivate, createdBy: communities.createdBy }).from(communities).where(eq(communities.slug, communitySlug)).limit(1);
		if (!community) return json({ error: 'That community does not exist.' }, { status: 404 });
		const communityBan = await getCommunityBan(actor.id, community.id);
		if (communityBan) return json({ error: communityBan.reason || 'You are banned from this community.' }, { status: 403 });
		if (community.isPrivate && !actor.isOwner && !actor.isAdmin && community.createdBy !== actor.id) {
			const [membership] = await db.select({ communityId: communityMemberships.communityId }).from(communityMemberships).where(and(eq(communityMemberships.userId, actor.id), eq(communityMemberships.communityId, community.id))).limit(1);
			if (!membership) return json({ error: 'Join this private community before posting.' }, { status: 403 });
		}
		communityId = community.id;
	}

	let poll: { options: Array<{ id: string; text: string; votes: number }>; endsAt?: string } | null = null;
	if (postType === 'poll') {
		const options = Array.isArray(payload.pollOptions)
			? payload.pollOptions.map((option: unknown) => String(option ?? '').trim()).filter((option: string) => option.length > 0).slice(0, 6)
			: [];
		if (options.length < 2) return json({ error: 'Polls need at least two non-empty options.' }, { status: 400 });
		if (options.some((option: string) => option.length > 100)) return json({ error: 'Poll options must be 100 characters or fewer.' }, { status: 400 });
		poll = { options: options.map((text: string) => ({ id: crypto.randomUUID(), text, votes: 0 })), endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() };
	}

	const requestedMediaIds = Array.isArray(payload.mediaAssetIds) ? [...new Set(payload.mediaAssetIds.map((value: unknown) => String(value)))].slice(0, 8) : [];
	const mediaRows = requestedMediaIds.length ? await db.select({ id: mediaAssets.id, mediaKind: mediaAssets.mediaKind, objectKey: mediaAssets.objectKey }).from(mediaAssets).where(and(inArray(mediaAssets.id, requestedMediaIds), eq(mediaAssets.ownerId, actor.id), eq(mediaAssets.isDeleted, false), isNull(mediaAssets.referenceId))) : [];
	if (mediaRows.length !== requestedMediaIds.length) return json({ error: 'One or more uploaded media files are invalid, already attached, or do not belong to your account.' }, { status: 400 });
	if (communityId && mediaRows.length) {
		try {
			const b2 = getPrivateB2Config();
			for (const asset of mediaRows) await verifyB2BucketAccess(getB2ConfigForObjectKey(b2, asset.objectKey));
			if (mediaRows.some((asset) => isObjectInPublicBucket(b2, asset.objectKey))) return json({ error: 'Media attached to a community must use private bucket storage so the community can safely become private later. Re-upload these files using the current community composer.' }, { status: 400 });
		} catch (error) {
			return json({ error: error instanceof Error ? error.message : 'Could not verify media storage.' }, { status: 503 });
		}
	}
	const media = mediaRows.map((asset) => ({ id: asset.id, kind: asset.mediaKind }));
	const id = crypto.randomUUID();
	try {
	await db.transaction(async (tx) => {
	await tx.insert(posts).values({
		id,
		idempotencyKey: clientRequestId || null,
		authorId: actor.id,
		communityId,
		title,
		body: body || null,
		url: url || null,
		postType,
		flair,
		poll,
		media,
		createdAt: new Date(),
		updatedAt: new Date()
	});
	if (requestedMediaIds.length) await tx.update(mediaAssets).set({ referenceType: 'post', referenceId: id, visibility: 'public' }).where(and(inArray(mediaAssets.id, requestedMediaIds), eq(mediaAssets.ownerId, actor.id), isNull(mediaAssets.referenceId)));
	await tx.insert(userInteractions).values({ id: crypto.randomUUID(), userId: actor.id, targetId: id, targetType: 'post', actionType: 'create', value: 1, createdAt: new Date() });
	});
	} catch (insertError) {
		// Another retry may have won the race. Return that result instead of making duplicate posts.
		if (clientRequestId) {
			const [existing] = await db.select({ id: posts.id, authorId: posts.authorId }).from(posts).where(eq(posts.idempotencyKey, clientRequestId)).limit(1);
			if (existing?.authorId === actor.id) return json({ ok: true, id: existing.id, redirectTo: `/post/${existing.id}`, deduplicated: true }, { status: 200 });
		}
		throw insertError;
	}
	return json({ ok: true, id, redirectTo: `/post/${id}` }, { status: 201 });
};
