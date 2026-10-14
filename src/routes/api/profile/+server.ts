import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { mediaAssets, users } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';
import { getPrivateB2Config } from '$lib/server/b2-config.js';
import { getB2ConfigForObjectKey, isObjectInPublicBucket, verifyB2BucketAccess } from '$lib/storage/b2.js';

export const PATCH: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to edit your profile.' }, { status: 401 });
	const body = await event.request.json().catch(() => null);
	const displayName = String(body?.displayName ?? '').trim();
	const bio = String(body?.bio ?? '').trim();
	const avatarUrl = String(body?.avatarUrl ?? '').trim();
	const bannerUrl = String(body?.bannerUrl ?? '').trim();
	const profileVisibility = String(body?.profileVisibility ?? 'public');
	const dmPolicy = String(body?.dmPolicy ?? 'everyone');
	const discoverable = body?.discoverable !== false;
	if (avatarUrl.startsWith('/api/media/') && avatarUrl === bannerUrl) return json({ error: 'Use a different uploaded image for your profile photo and banner.' }, { status: 400 });
	const preferredFeed = String(body?.preferredFeed ?? 'for-you');
	const allowedFeeds = ['for-you', 'following', 'latest', 'new', 'trending', 'rising', 'best', 'top', 'hot'];
	const mutedKeywords = Array.isArray(body?.mutedKeywords) ? body.mutedKeywords.map((item: unknown) => String(item).trim().toLowerCase()).filter((item: string) => item.length > 0).slice(0, 50) : [];
	const isNsfwEnabled = Boolean(body?.isNsfwEnabled);
	if (displayName.length < 2 || displayName.length > 60) return json({ error: 'Display names must be 2–60 characters.' }, { status: 400 });
	if (bio.length > 280) return json({ error: 'Your bio must be 280 characters or fewer.' }, { status: 400 });
	for (const [label, value, referenceType] of [['Avatar', avatarUrl, 'avatar'], ['Banner', bannerUrl, 'banner']] as const) {
		if (!value) continue;
		if (value.startsWith('/api/media/')) {
			const assetId = value.slice('/api/media/'.length);
			const [asset] = await db.select({ id: mediaAssets.id, ownerId: mediaAssets.ownerId, mediaKind: mediaAssets.mediaKind, objectKey: mediaAssets.objectKey, isDeleted: mediaAssets.isDeleted, referenceId: mediaAssets.referenceId, referenceType: mediaAssets.referenceType }).from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
			const attachedElsewhere = asset?.referenceId && !(asset.referenceId === actor.id && asset.referenceType === referenceType);
			if (!asset || asset.ownerId !== actor.id || asset.mediaKind !== 'image' || asset.isDeleted || attachedElsewhere) return json({ error: `${label} upload is invalid, already used elsewhere, or does not belong to your account.` }, { status: 400 });
		} else {
			try { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); }
			catch { return json({ error: `${label} URL must be a valid http or https URL.` }, { status: 400 }); }
		}
	}
	if (!['public', 'private'].includes(profileVisibility)) return json({ error: 'Choose a valid profile visibility.' }, { status: 400 });
	if (profileVisibility === 'private' && [avatarUrl, bannerUrl].some((value) => value.startsWith('/api/media/'))) {
		try {
			const b2 = getPrivateB2Config();
			for (const value of [avatarUrl, bannerUrl]) {
				if (!value.startsWith('/api/media/')) continue;
				const assetId = value.slice('/api/media/'.length).split(/[?#]/)[0];
				const [asset] = await db.select({ objectKey: mediaAssets.objectKey }).from(mediaAssets).where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.ownerId, actor.id))).limit(1);
				if (asset) {
					const storageConfig = getB2ConfigForObjectKey(b2, asset.objectKey);
					await verifyB2BucketAccess(storageConfig);
					if (isObjectInPublicBucket(b2, asset.objectKey)) return json({ error: 'This profile photo or banner is stored in a public bucket. Upload a replacement while Private profile is selected, then save again.' }, { status: 409 });
				}
			}
		} catch (error) {
			return json({ error: error instanceof Error ? error.message : 'Could not verify profile media storage.' }, { status: 503 });
		}
	}
	if (!['everyone', 'following', 'none'].includes(dmPolicy)) return json({ error: 'Choose a valid direct-message policy.' }, { status: 400 });
	if (!allowedFeeds.includes(preferredFeed)) return json({ error: 'Choose a valid default feed.' }, { status: 400 });
	await db.transaction(async (tx) => {
		await tx.update(users).set({ displayName, bio: bio || null, avatarUrl: avatarUrl || null, bannerUrl: bannerUrl || null, preferredFeed, mutedKeywords, isNsfwEnabled, profileVisibility, dmPolicy, discoverable, updatedAt: new Date() }).where(eq(users.id, actor.id));
		if (avatarUrl.startsWith('/api/media/')) await tx.update(mediaAssets).set({ referenceType: 'avatar', referenceId: actor.id, visibility: profileVisibility }).where(and(eq(mediaAssets.id, avatarUrl.slice('/api/media/'.length)), eq(mediaAssets.ownerId, actor.id), or(isNull(mediaAssets.referenceId), and(eq(mediaAssets.referenceId, actor.id), eq(mediaAssets.referenceType, 'avatar')))));
		if (bannerUrl.startsWith('/api/media/')) await tx.update(mediaAssets).set({ referenceType: 'banner', referenceId: actor.id, visibility: profileVisibility }).where(and(eq(mediaAssets.id, bannerUrl.slice('/api/media/'.length)), eq(mediaAssets.ownerId, actor.id), or(isNull(mediaAssets.referenceId), and(eq(mediaAssets.referenceId, actor.id), eq(mediaAssets.referenceType, 'banner')))));
	});
	return json({ ok: true });
};
