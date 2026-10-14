import { json, type RequestHandler } from '@sveltejs/kit';
import { getActor } from '$lib/server/social.js';
import { getPrivateB2Config } from '$lib/server/b2-config.js';
import { buildKey, getPresignedUploadUrl, resolveB2UploadTarget, verifyB2BucketAccess } from '$lib/storage/b2.js';
import { db } from '$lib/server/db/index.js';
import { communityMemberships, communityModerators, communities } from '$lib/server/db/schema.js';
import { and, eq } from 'drizzle-orm';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/webm']);
const LIMITS: Record<string, number> = { image: 15, video: 250, audio: 40 };

export const POST: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to upload media.' }, { status: 401 });
  if (actor.isBanned) return json({ error: actor.banReason || 'This account is suspended.' }, { status: 403 });
  const body = await event.request.json().catch(() => null);
  const filename = String(body?.filename ?? '').slice(0, 180);
  const contentType = String(body?.contentType ?? '').toLowerCase().split(';')[0].trim();
  const size = Number(body?.size);
  const purpose = String(body?.purpose ?? 'post');
  const communityId = String(body?.communityId ?? '');
  const visibility = body?.visibility === 'private' ? 'private' : 'public';
  const mediaKind = IMAGE_TYPES.has(contentType) ? 'image' : VIDEO_TYPES.has(contentType) ? 'video' : AUDIO_TYPES.has(contentType) ? 'audio' : '';
  if (!filename || /[\\/]/.test(filename) || !Number.isSafeInteger(size) || size < 1 || !mediaKind) return json({ error: 'Choose a supported image, video, or audio file.' }, { status: 400 });
  const maxBytes = purpose === 'emote' ? 1024 * 1024 : LIMITS[mediaKind] * 1024 * 1024;
  if (size > maxBytes) return json({ error: purpose === 'emote' ? 'Community emotes are limited to 1 MB.' : `${mediaKind} uploads are limited to ${LIMITS[mediaKind]} MB.` }, { status: 413 });
  if (['avatar', 'banner', 'emote', 'community-icon', 'community-banner'].includes(purpose) && mediaKind !== 'image') return json({ error: 'Profile photos, banners, and community emotes must be image files.' }, { status: 400 });
  if (!['post', 'avatar', 'banner', 'emote', 'community-icon', 'community-banner'].includes(purpose)) return json({ error: 'Invalid upload purpose.' }, { status: 400 });
  if (purpose === 'emote' && !communityId) return json({ error: 'A community is required for emote uploads.' }, { status: 400 });

  let community: { id: string; createdBy: string; isPrivate: boolean } | undefined;
  if (communityId) {
    const [row] = await db.select({ id: communities.id, createdBy: communities.createdBy, isPrivate: communities.isPrivate }).from(communities).where(eq(communities.id, communityId)).limit(1);
    if (!row) return json({ error: 'Community not found.' }, { status: 404 });
    community = row;
  }

  if (['emote', 'community-icon', 'community-banner'].includes(purpose) && community) {
    const [moderator] = await db.select({ userId: communityModerators.userId }).from(communityModerators).where(and(eq(communityModerators.communityId, community.id), eq(communityModerators.userId, actor.id))).limit(1);
    if (!actor.isOwner && !actor.isAdmin && community.createdBy !== actor.id && !moderator) return json({ error: 'Only the community creator or an assigned moderator can upload community assets.' }, { status: 403 });
  }
  if (purpose === 'post' && community?.isPrivate && !actor.isOwner && !actor.isAdmin && community.createdBy !== actor.id) {
    const [membership] = await db.select({ communityId: communityMemberships.communityId }).from(communityMemberships).where(and(eq(communityMemberships.communityId, community.id), eq(communityMemberships.userId, actor.id))).limit(1);
    const [moderator] = await db.select({ userId: communityModerators.userId }).from(communityModerators).where(and(eq(communityModerators.communityId, community.id), eq(communityModerators.userId, actor.id))).limit(1);
    if (!membership && !moderator) return json({ error: 'Join this private community before uploading post media.' }, { status: 403 });
  }

  try {
    const baseConfig = getPrivateB2Config();
    // Any asset uploaded for private profile visibility or a private community
    // must use a bucket whose ACL is private at the bucket level.
    const requiresPrivateStorage = visibility === 'private' || Boolean(community?.isPrivate) || (purpose === 'post' && Boolean(community)) || ['emote', 'community-icon', 'community-banner'].includes(purpose);
    const target = resolveB2UploadTarget(baseConfig, requiresPrivateStorage);
    await verifyB2BucketAccess(target.config);
    const key = buildKey(`${target.keyFolder}/${actor.id}`, filename);
    const uploadUrl = await getPresignedUploadUrl(target.config, key, contentType, LIMITS[mediaKind], size);
    return json({ uploadUrl, objectKey: key, contentType, size, mediaKind, expiresInSeconds: 900, requiredHeaders: { 'content-type': contentType }, storageAccess: target.config.bucketAccess }, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Storage configuration is invalid.';
    console.error('[media presign]', err);
    const isConfigError = /bucket|Backblaze|B2_|private storage|public storage/i.test(detail);
    return json({ error: isConfigError ? detail : 'Media storage is not configured or could not issue an upload URL.' }, { status: isConfigError ? 400 : 503 });
  }
};
