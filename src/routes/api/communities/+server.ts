import { json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { communities, communityMemberships, mediaAssets } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to create a community.' }, { status: 401 });
	if (actor.isBanned) return json({ error: 'This account is suspended.' }, { status: 403 });
	const body = await event.request.json().catch(() => null);
	const name = String(body?.name ?? '').trim();
	const slug = String(body?.slug ?? '').trim().toLowerCase().replace(/^c\//, '').replace(/\s+/g, '-');
	const description = String(body?.description ?? '').trim().slice(0, 500);
	const category = String(body?.category ?? 'General').trim().slice(0, 40) || 'General';
	const requestedType = String(body?.communityType ?? 'standard');
	const communityType = ['standard', 'gaming', 'academic', 'creative'].includes(requestedType) ? requestedType : 'standard';
	const iconUrl = String(body?.iconUrl ?? '').trim();
	const bannerUrl = String(body?.bannerUrl ?? '').trim();
	if (name.length < 3 || name.length > 60) return json({ error: 'Community names must be 3–60 characters.' }, { status: 400 });
	if (!/^[a-z0-9][a-z0-9-]{1,29}$/.test(slug)) return json({ error: 'The community URL must be 2–30 characters using letters, numbers, and hyphens.' }, { status: 400 });
	for (const [label, value] of [['Community icon', iconUrl], ['Community banner', bannerUrl]] as const) {
		if (!value) continue;
		if (value.startsWith('/api/media/')) {
			const assetId = value.slice('/api/media/'.length).split(/[?#]/)[0];
			const [asset] = await db.select({ id: mediaAssets.id, ownerId: mediaAssets.ownerId, mediaKind: mediaAssets.mediaKind, isDeleted: mediaAssets.isDeleted, referenceId: mediaAssets.referenceId }).from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
			if (!asset || asset.ownerId !== actor.id || asset.mediaKind !== 'image' || asset.isDeleted || asset.referenceId) return json({ error: `${label} must be an unused image uploaded to your account.` }, { status: 400 });
		} else {
			try { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); }
			catch { return json({ error: `${label} must be a valid https or http image URL.` }, { status: 400 }); }
		}
	}
	const [existing] = await db.select({ id: communities.id }).from(communities).where(eq(communities.slug, slug)).limit(1);
	if (existing) return json({ error: 'That community URL is already taken.' }, { status: 409 });
	const id = crypto.randomUUID();
	try {
		await db.transaction(async (tx) => {
			await tx.insert(communities).values({ id, name, slug, createdBy: actor.id, description: description || null, category, communityType, iconUrl: iconUrl || null, bannerUrl: bannerUrl || null, memberCount: 1, rules: [] });
			await tx.insert(communityMemberships).values({ userId: actor.id, communityId: id });
			if (iconUrl.startsWith('/api/media/')) await tx.update(mediaAssets).set({ referenceType: 'community-icon', referenceId: id, visibility: 'public' }).where(eq(mediaAssets.id, iconUrl.slice('/api/media/'.length).split(/[?#]/)[0]));
			if (bannerUrl.startsWith('/api/media/')) await tx.update(mediaAssets).set({ referenceType: 'community-banner', referenceId: id, visibility: 'public' }).where(eq(mediaAssets.id, bannerUrl.slice('/api/media/'.length).split(/[?#]/)[0]));
		});
		return json({ ok: true, id, slug, redirectTo: `/c/${slug}` }, { status: 201 });
	} catch (error) {
		console.error('[create community]', error);
		return json({ error: 'Could not create this community. Try a different URL.' }, { status: 500 });
	}
};
