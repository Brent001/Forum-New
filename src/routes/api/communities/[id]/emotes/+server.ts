import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { communityEmotes, communityMemberships, communityModerators, communities, mediaAssets } from '$lib/server/db/schema.js';
import { canAccessCommunity, getActor } from '$lib/server/social.js';
import { getPrivateB2Config } from '$lib/server/b2-config.js';
import { getB2ConfigForObjectKey, isObjectInPublicBucket, verifyB2BucketAccess } from '$lib/storage/b2.js';

export const GET: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  const communityId = event.params.id;
  if (!await canAccessCommunity(actor ? { id: actor.id, isOwner: actor.isOwner, isAdmin: actor.isAdmin } : null, communityId)) return json({ error: 'Community not found.' }, { status: 404 });
  const emotes = await db.select({ id: communityEmotes.id, code: communityEmotes.code, imageAssetId: communityEmotes.imageAssetId, imageUrl: communityEmotes.imageUrl, isAnimated: communityEmotes.isAnimated, createdAt: communityEmotes.createdAt })
    .from(communityEmotes).where(eq(communityEmotes.communityId, communityId)).orderBy(communityEmotes.code).limit(250);
  return json({ emotes });
};

export const POST: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to manage emotes.' }, { status: 401 });
  if (actor.isBanned) return json({ error: 'Account is suspended.' }, { status: 403 });
  const communityId = event.params.id;
  const body = await event.request.json().catch(() => null);
  const code = String(body?.code ?? '').trim().toLowerCase().replace(/^:+|:+$/g, '');
  const assetId = String(body?.imageAssetId ?? '');
  if (!/^[a-z0-9_]{2,24}$/.test(code)) return json({ error: 'Emote codes must use 2–24 lowercase letters, numbers, or underscores.' }, { status: 400 });
  const [community] = await db.select({ id: communities.id, createdBy: communities.createdBy }).from(communities).where(eq(communities.id, communityId)).limit(1);
  if (!community) return json({ error: 'Community not found.' }, { status: 404 });
  const [moderator] = await db.select({ userId: communityModerators.userId }).from(communityModerators).where(and(eq(communityModerators.communityId, communityId), eq(communityModerators.userId, actor.id))).limit(1);
  if (!actor.isOwner && !actor.isAdmin && community.createdBy !== actor.id && !moderator) return json({ error: 'Only the community creator or a moderator can add exclusive emotes.' }, { status: 403 });
  const [emoteCount] = await db.select({ count: sql<number>`count(*)` }).from(communityEmotes).where(eq(communityEmotes.communityId, communityId));
  if (Number(emoteCount?.count ?? 0) >= 100) return json({ error: 'This community has reached the 100-emote limit. Remove an old emote before adding another.' }, { status: 409 });
  const [asset] = await db.select({ id: mediaAssets.id, ownerId: mediaAssets.ownerId, mediaKind: mediaAssets.mediaKind, sizeBytes: mediaAssets.sizeBytes, objectKey: mediaAssets.objectKey, isDeleted: mediaAssets.isDeleted, referenceId: mediaAssets.referenceId, contentType: mediaAssets.contentType })
    .from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
  if (!asset || asset.ownerId !== actor.id || asset.mediaKind !== 'image' || asset.isDeleted || asset.referenceId || asset.sizeBytes > 1024 * 1024) return json({ error: 'Upload an unused image under 1 MB that belongs to your account.' }, { status: 400 });
  try { const b2 = getPrivateB2Config(); await verifyB2BucketAccess(getB2ConfigForObjectKey(b2, asset.objectKey)); if (isObjectInPublicBucket(b2, asset.objectKey)) return json({ error: 'Community emotes must use private storage so they cannot leak if the community becomes private. Re-upload the emote with the current community tools.' }, { status: 409 }); }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not verify emote storage.' }, { status: 503 }); }
  const id = crypto.randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(communityEmotes).values({ id, communityId, code, imageAssetId: asset.id, imageUrl: `/api/media/${asset.id}`, isAnimated: asset.contentType === 'image/gif', uploadedBy: actor.id, createdAt: new Date() });
      await tx.update(mediaAssets).set({ referenceType: 'community-emote', referenceId: id, visibility: 'public' }).where(and(eq(mediaAssets.id, asset.id), eq(mediaAssets.ownerId, actor.id)));
    });
  } catch {
    return json({ error: 'That emote code already exists in this community.' }, { status: 409 });
  }
  return json({ ok: true, emote: { id, code, imageAssetId: asset.id, imageUrl: `/api/media/${asset.id}`, isAnimated: asset.contentType === 'image/gif' } }, { status: 201 });
};

export const DELETE: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to manage emotes.' }, { status: 401 });
  const emoteId = event.url.searchParams.get('emoteId') ?? '';
  const [emote] = await db.select({ id: communityEmotes.id, communityId: communityEmotes.communityId, uploadedBy: communityEmotes.uploadedBy, imageAssetId: communityEmotes.imageAssetId }).from(communityEmotes).where(eq(communityEmotes.id, emoteId)).limit(1);
  if (!emote) return json({ error: 'Emote not found.' }, { status: 404 });
  const [moderator] = await db.select({ userId: communityModerators.userId }).from(communityModerators).where(and(eq(communityModerators.communityId, emote.communityId), eq(communityModerators.userId, actor.id))).limit(1);
  const [community] = await db.select({ createdBy: communities.createdBy }).from(communities).where(eq(communities.id, emote.communityId)).limit(1);
  if (!actor.isOwner && !actor.isAdmin && community?.createdBy !== actor.id && !moderator) return json({ error: 'Only the community creator or a moderator can remove emotes.' }, { status: 403 });
  await db.transaction(async (tx) => {
    await tx.delete(communityEmotes).where(eq(communityEmotes.id, emoteId));
    if (emote.imageAssetId) await tx.update(mediaAssets).set({ referenceType: null, referenceId: null, visibility: 'private' }).where(eq(mediaAssets.id, emote.imageAssetId));
  });
  return json({ ok: true });
};
