import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { communities, communityModerators, mediaAssets } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';
import { getPrivateB2Config } from '$lib/server/b2-config.js';
import { getB2ConfigForObjectKey, isObjectInPublicBucket, verifyB2BucketAccess } from '$lib/storage/b2.js';

export const PATCH: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to edit this community.' }, { status: 401 });
  if (actor.isBanned) return json({ error: 'Suspended accounts cannot change community settings.' }, { status: 403 });
  const id = event.params.id;
  const [community] = await db.select().from(communities).where(eq(communities.id, id)).limit(1);
  if (!community) return json({ error: 'Community not found.' }, { status: 404 });
  const [moderator] = await db.select({ userId: communityModerators.userId }).from(communityModerators)
    .where(and(eq(communityModerators.communityId, id), eq(communityModerators.userId, actor.id))).limit(1);
  const canEdit = actor.isOwner || actor.isAdmin || community.createdBy === actor.id || Boolean(moderator);
  if (!canEdit) return json({ error: 'Only the community owner or an assigned moderator can edit its profile.' }, { status: 403 });

  const body = await event.request.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'Invalid profile data.' }, { status: 400 });
  const name = String(body.name ?? community.name).trim();
  const description = String(body.description ?? community.description ?? '').trim();
  const category = String(body.category ?? community.category).trim().slice(0, 40) || 'General';
  const iconUrl = String(body.iconUrl ?? community.iconUrl ?? '').trim();
  const bannerUrl = String(body.bannerUrl ?? community.bannerUrl ?? '').trim();
  if (name.length < 3 || name.length > 60) return json({ error: 'Community names must be 3–60 characters.' }, { status: 400 });
  if (description.length > 500) return json({ error: 'Description must be 500 characters or fewer.' }, { status: 400 });

  for (const [label, value] of [['Community icon', iconUrl], ['Community banner', bannerUrl]] as const) {
    if (!value) continue;
    if (value.startsWith('/api/media/')) {
      const assetId = value.slice('/api/media/'.length).split(/[?#]/)[0];
      const [asset] = await db.select({ id: mediaAssets.id, ownerId: mediaAssets.ownerId, mediaKind: mediaAssets.mediaKind, objectKey: mediaAssets.objectKey, isDeleted: mediaAssets.isDeleted, referenceId: mediaAssets.referenceId, referenceType: mediaAssets.referenceType })
        .from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
      if (!asset || asset.mediaKind !== 'image' || asset.isDeleted || (asset.referenceId ? !(asset.referenceId === id && ['community-icon', 'community-banner'].includes(asset.referenceType ?? '')) : asset.ownerId !== actor.id)) return json({ error: `${label} must be an unused image uploaded by your account or already attached to this community.` }, { status: 400 });
      if (community.isPrivate) {
        try { const b2 = getPrivateB2Config(); const storageConfig = getB2ConfigForObjectKey(b2, asset.objectKey); await verifyB2BucketAccess(storageConfig); if (isObjectInPublicBucket(b2, asset.objectKey)) return json({ error: `${label} is stored in a public B2 bucket. Re-upload it to private storage before saving a private community.` }, { status: 409 }); }
        catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not verify community media storage.' }, { status: 503 }); }
      }
    } else {
      try { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); }
      catch { return json({ error: `${label} must be a valid http or https URL.` }, { status: 400 }); }
    }
  }

  const selectedAssetIds = new Set([iconUrl, bannerUrl].filter((value) => value.startsWith('/api/media/')).map((value) => value.slice('/api/media/'.length).split(/[?#]/)[0]));
  const previousAssetIds = [community.iconUrl, community.bannerUrl].filter((value): value is string => Boolean(value?.startsWith('/api/media/'))).map((value) => value.slice('/api/media/'.length).split(/[?#]/)[0]);
  await db.transaction(async (tx) => {
    for (const previousId of previousAssetIds) {
      if (!selectedAssetIds.has(previousId)) await tx.update(mediaAssets).set({ referenceType: null, referenceId: null, visibility: 'private' }).where(and(eq(mediaAssets.id, previousId), eq(mediaAssets.referenceId, id)));
    }
    await tx.update(communities).set({ name, description: description || null, category, iconUrl: iconUrl || null, bannerUrl: bannerUrl || null }).where(eq(communities.id, id));
    for (const [value, type] of [[iconUrl, 'community-icon'], [bannerUrl, 'community-banner']] as const) {
      if (value.startsWith('/api/media/')) await tx.update(mediaAssets).set({ referenceType: type, referenceId: id, visibility: 'public' }).where(and(eq(mediaAssets.id, value.slice('/api/media/'.length).split(/[?#]/)[0]), eq(mediaAssets.ownerId, actor.id)));
    }
  });
  return json({ ok: true, community: { id, name, description: description || null, category, iconUrl: iconUrl || null, bannerUrl: bannerUrl || null } });
};
