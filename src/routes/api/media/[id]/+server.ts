import { error, redirect, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { mediaAssets, posts, users, communityEmotes } from '$lib/server/db/schema.js';
import { canAccessCommunity, canAccessPost, getActor } from '$lib/server/social.js';
import { getPrivateB2Config } from '$lib/server/b2-config.js';
import {
  getB2ConfigForObjectKey,
  getPublicObjectUrl,
  getSignedDownloadUrl,
  getB2ObjectStream,
  headB2Object,
  verifyB2BucketAccess
} from '$lib/storage/b2.js';

const MAX_MEDIA_PROXY_BYTES = 15 * 1024 * 1024; // Leave headroom below Netlify's 20 MB streamed-response cap.
const SIGNED_MEDIA_URL_TTL_SECONDS = 60 * 60; // Supports normal long-form playback; this URL is a bearer link until expiry.

const SAFE_INLINE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/webm'
]);

function safeContentType(value: string | null | undefined) {
  const normalized = String(value ?? '').toLowerCase().split(';')[0].trim();
  return SAFE_INLINE_TYPES.has(normalized) ? normalized : 'application/octet-stream';
}

type ParsedRange = { start: number; end: number; header: string };
function parseRangeHeader(value: string | null, size: number): ParsedRange | null | false {
  if (!value) return null;
  // B2 and browsers support byte ranges; deliberately accept one range only.
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || size < 1 || (!match[1] && !match[2])) return false;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return false;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return false;
    end = Math.min(end, size - 1);
  }
  if (start < 0 || start >= size || end < start) return false;
  return { start, end, header: `bytes=${start}-${end}` };
}

async function resolveAuthorizedMedia(event: RequestEvent) {
  if (!db) throw error(503, 'Database is not configured.');
  const [asset] = await db.select().from(mediaAssets)
    .where(and(eq(mediaAssets.id, event.params.id), eq(mediaAssets.isDeleted, false))).limit(1);
  if (!asset) throw error(404, 'Media not found.');

  const actor = await getActor(event);
  if (asset.visibility === 'private' && actor?.id !== asset.ownerId && !actor?.isOwner) {
    throw error(404, 'Media not found.');
  }

  let publicToEveryone = false;
  const accessActor = actor ? { id: actor.id, isOwner: actor.isOwner, isAdmin: actor.isAdmin } : null;

  if (asset.referenceType === 'post' && asset.referenceId) {
    const [post] = await db.select({
      id: posts.id,
      authorId: posts.authorId,
      isRemoved: posts.isRemoved,
      communityId: posts.communityId,
      shadowBanned: users.isShadowBanned,
      authorBanned: users.isBanned
    }).from(posts).leftJoin(users, eq(posts.authorId, users.id)).where(eq(posts.id, asset.referenceId)).limit(1);
    if (!post || post.isRemoved || post.authorBanned || (post.shadowBanned && actor?.id !== post.authorId && !actor?.isOwner)) {
      throw error(404, 'Media not found.');
    }
    if (!await canAccessPost(accessActor, post.id)) throw error(404, 'Media not found.');
    publicToEveryone = !post.shadowBanned && await canAccessPost(null, post.id);
  } else if (asset.referenceType === 'avatar' || asset.referenceType === 'banner') {
    const [profile] = await db.select({
      avatarUrl: users.avatarUrl,
      bannerUrl: users.bannerUrl,
      profileVisibility: users.profileVisibility,
      isBanned: users.isBanned
    }).from(users).where(eq(users.id, asset.ownerId)).limit(1);
    const activeUrl = asset.referenceType === 'avatar' ? profile?.avatarUrl : profile?.bannerUrl;
    if (!profile || profile.isBanned || activeUrl !== `/api/media/${asset.id}` ||
      (profile.profileVisibility === 'private' && actor?.id !== asset.ownerId && !actor?.isOwner)) {
      throw error(404, 'Media not found.');
    }
    publicToEveryone = profile.profileVisibility !== 'private';
  } else if ((asset.referenceType === 'community-icon' || asset.referenceType === 'community-banner') && asset.referenceId) {
    if (!await canAccessCommunity(accessActor, asset.referenceId)) throw error(404, 'Media not found.');
    publicToEveryone = await canAccessCommunity(null, asset.referenceId);
  } else if (asset.referenceType === 'community-emote' && asset.referenceId) {
    const [emote] = await db.select({ communityId: communityEmotes.communityId })
      .from(communityEmotes).where(eq(communityEmotes.id, asset.referenceId)).limit(1);
    if (!emote || !await canAccessCommunity(accessActor, emote.communityId)) throw error(404, 'Media not found.');
    publicToEveryone = await canAccessCommunity(null, emote.communityId);
  } else if (asset.ownerId !== actor?.id && !actor?.isOwner) {
    // Unattached uploads are owner-only; guessing an object ID never makes it public.
    throw error(404, 'Media not found.');
  }

  if (asset.visibility === 'private') publicToEveryone = false;
  return { asset, publicToEveryone };
}

function baseMediaHeaders(asset: { contentType: string; sizeBytes: number; originalName: string }, publicToEveryone: boolean) {
  const headers = new Headers();
  headers.set('Content-Type', safeContentType(asset.contentType));
  headers.set('X-Content-Type-Options', 'nosniff');
  // Public posts/profile/community artwork can be embedded by other sites;
  // protected assets stay same-origin and receive no cross-origin read grant.
  headers.set('Cross-Origin-Resource-Policy', publicToEveryone ? 'cross-origin' : 'same-origin');
  if (publicToEveryone) headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Accept-Ranges', 'bytes');
  // Only media confirmed public to anonymous viewers may be cached publicly.
  // Private/community-only content is never cached by browsers or shared caches.
  headers.set('Cache-Control', publicToEveryone
    ? 'public, max-age=30, s-maxage=30'
    : 'private, no-store');
  headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(asset.originalName || 'media')}`);
  return headers;
}

function isHttpError(cause: unknown): cause is { status: number } {
  return typeof cause === 'object' && cause !== null && 'status' in cause && typeof (cause as { status?: unknown }).status === 'number';
}

function isNotFoundFromStorage(cause: unknown) {
  if (!cause || typeof cause !== 'object') return false;
  const value = cause as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return value.name === 'NoSuchKey' || value.name === 'NotFound' || value.Code === 'NoSuchKey' || value.$metadata?.httpStatusCode === 404;
}

function isInvalidRangeFromStorage(cause: unknown) {
  if (!cause || typeof cause !== 'object') return false;
  const value = cause as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return value.name === 'InvalidRange' || value.Code === 'InvalidRange' || value.$metadata?.httpStatusCode === 416;
}

export const GET: RequestHandler = async (event) => {
  const { asset, publicToEveryone } = await resolveAuthorizedMedia(event);

  try {
    const storageConfig = getB2ConfigForObjectKey(getPrivateB2Config(), asset.objectKey);
    await verifyB2BucketAccess(storageConfig);

    // Public B2 objects can be served directly. For a private-only bucket, the
    // default proxy returns bytes from this same-origin route, not an external
    // signed URL. Set B2_MEDIA_DELIVERY=redirect to opt back into B2 presigned URLs.
    if (storageConfig.bucketAccess === 'public') {
      // Never send a protected/community-only asset to a public bucket URL.
      if (asset.visibility === 'private' || !publicToEveryone) throw error(404, 'Media not found.');
      throw redirect(302, getPublicObjectUrl(storageConfig, asset.objectKey));
    }
    // Netlify streaming responses are capped at 20 MB. Images/GIFs (upload
    // limit 15 MB) use the same-origin proxy to render normally with a private
    // bucket. Videos/audio are streamed directly from B2 using a short-lived
    // signed URL so long files and media seeking don't pass through Netlify.
    const useDirectB2Delivery = storageConfig.mediaDelivery === 'redirect' ||
      asset.mediaKind === 'video' || asset.mediaKind === 'audio' || asset.sizeBytes > MAX_MEDIA_PROXY_BYTES;
    if (useDirectB2Delivery) {
      throw redirect(302, await getSignedDownloadUrl(storageConfig, asset.objectKey, SIGNED_MEDIA_URL_TTL_SECONDS));
    }

    const requestedRange = parseRangeHeader(event.request.headers.get('range'), asset.sizeBytes);
    if (requestedRange === false) {
      return new Response(null, {
        status: 416,
        headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${asset.sizeBytes}`, 'Cache-Control': 'private, no-store' }
      });
    }

    const object = await getB2ObjectStream(storageConfig, asset.objectKey, requestedRange?.header, event.request.signal);
    if (requestedRange && !object.contentRange) {
      try { await object.body?.cancel(); } catch { /* ignore stream cleanup failures */ }
      throw error(502, 'Storage provider did not honor the requested byte range.');
    }
    if (!object.body) throw error(502, 'Storage provider returned an empty media stream.');

    const headers = baseMediaHeaders(asset, publicToEveryone);
    headers.set('Content-Type', safeContentType(asset.contentType));
    headers.set('Accept-Ranges', object.acceptRanges || 'bytes');
    if (object.contentLength !== undefined) headers.set('Content-Length', String(object.contentLength));
    else if (requestedRange) headers.set('Content-Length', String(requestedRange.end - requestedRange.start + 1));
    else headers.set('Content-Length', String(asset.sizeBytes));
    if (object.contentRange) headers.set('Content-Range', object.contentRange);
    if (object.etag) headers.set('ETag', object.etag);
    if (object.lastModified) headers.set('Last-Modified', object.lastModified.toUTCString());
    return new Response(object.body, { status: requestedRange ? 206 : 200, headers });
  } catch (cause) {
    if (isHttpError(cause)) throw cause;
    if (isNotFoundFromStorage(cause)) throw error(404, 'Media not found.');
    if (isInvalidRangeFromStorage(cause)) {
      return new Response(null, { status: 416, headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${asset.sizeBytes}`, 'Cache-Control': 'private, no-store' } });
    }
    console.error('[media proxy]', cause);
    throw error(503, 'Media storage is temporarily unavailable.');
  }
};

export const HEAD: RequestHandler = async (event) => {
  const { asset, publicToEveryone } = await resolveAuthorizedMedia(event);
  try {
    const storageConfig = getB2ConfigForObjectKey(getPrivateB2Config(), asset.objectKey);
    await verifyB2BucketAccess(storageConfig);
    if (storageConfig.bucketAccess === 'public' && (asset.visibility === 'private' || !publicToEveryone)) {
      // Never expose a direct public URL from a public bucket for protected content.
      throw error(404, 'Media not found.');
    }
    // HEAD is served locally rather than redirecting to a GET-signed URL, since
    // a presigned GetObject URL is not a valid signature for a HEAD request.
    const meta = await headB2Object(storageConfig, asset.objectKey, event.request.signal);
    const headers = baseMediaHeaders(asset, publicToEveryone);
    headers.set('Content-Type', safeContentType(asset.contentType));
    headers.set('Accept-Ranges', meta.acceptRanges || 'bytes');
    headers.set('Content-Length', String(meta.contentLength ?? asset.sizeBytes));
    if (meta.etag) headers.set('ETag', meta.etag);
    if (meta.lastModified) headers.set('Last-Modified', meta.lastModified.toUTCString());
    return new Response(null, { status: 200, headers });
  } catch (cause) {
    if (isHttpError(cause)) throw cause;
    if (isNotFoundFromStorage(cause)) throw error(404, 'Media not found.');
    console.error('[media proxy HEAD]', cause);
    throw error(503, 'Media storage is temporarily unavailable.');
  }
};
