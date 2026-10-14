import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { getActor } from '$lib/server/social.js';
import { db } from '$lib/server/db/index.js';
import { mediaAssets } from '$lib/server/db/schema.js';
import { getPrivateB2Config } from '$lib/server/b2-config.js';
import { getB2ConfigForObjectKey, normalizeEndpoint, verifyB2BucketAccess, type B2Config } from '$lib/storage/b2.js';

const LIMITS: Record<string, number> = { image: 15, video: 250, audio: 40 };
const ALLOWED_TYPES = new Set(['image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/ogg','audio/wav','audio/mp4','audio/webm']);

export const POST: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to finish upload.' }, { status: 401 });
  if (actor.isBanned) return json({ error: actor.banReason || 'This account is suspended.' }, { status: 403 });
  const body = await event.request.json().catch(() => null);
  const key = String(body?.objectKey ?? '');
  const originalName = String(body?.filename ?? 'upload').replace(/[\\/\u0000-\u001f]/g, '').slice(0, 180) || 'upload';
  const visibility = body?.visibility === 'private' ? 'private' : 'public';
  const validOwnerKey = ['media', 'media-public', 'media-private'].some((prefix) => key.startsWith(`${prefix}/${actor.id}/`));
  if (!validOwnerKey || key.includes('..') || key.includes('\\') || key.includes('\u0000')) return json({ error: 'Invalid upload key.' }, { status: 400 });
  let config: B2Config;
  try {
    config = getB2ConfigForObjectKey(getPrivateB2Config(), key);
    await verifyB2BucketAccess(config);
  } catch (err) {
    console.error('[media complete config]', err);
    return json({ error: err instanceof Error ? err.message : 'Media storage is not configured.' }, { status: 503 });
  }
  if (visibility === 'private' && config.bucketAccess === 'public') return json({ error: 'Private media cannot be stored in a public Backblaze bucket. Configure a private bucket for this asset.' }, { status: 400 });
  const [existing] = await db.select({ id: mediaAssets.id, mediaKind: mediaAssets.mediaKind }).from(mediaAssets).where(and(eq(mediaAssets.objectKey, key), eq(mediaAssets.ownerId, actor.id))).limit(1);
  if (existing) return json({ ok: true, assetId: existing.id, mediaKind: existing.mediaKind, url: `/api/media/${existing.id}` });
  try {
    const client = new S3Client({ region: config.region, endpoint: normalizeEndpoint(config.endpoint), credentials: { accessKeyId: config.keyId, secretAccessKey: config.appKey }, forcePathStyle: true });
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: key }));
    const contentType = String(head.ContentType ?? '').toLowerCase().split(';')[0].trim();
    const sizeBytes = Number(head.ContentLength ?? 0);
    const mediaKind = contentType.startsWith('image/') ? 'image' : contentType.startsWith('video/') ? 'video' : contentType.startsWith('audio/') ? 'audio' : '';
    if (!ALLOWED_TYPES.has(contentType) || !mediaKind || sizeBytes < 1 || sizeBytes > LIMITS[mediaKind] * 1024 * 1024) {
      return json({ error: 'The uploaded file failed media type or size validation.' }, { status: 415 });
    }
    const id = crypto.randomUUID();
    await db.insert(mediaAssets).values({ id, ownerId: actor.id, objectKey: key, originalName, contentType, mediaKind, visibility, sizeBytes, createdAt: new Date() });
    return json({ ok: true, assetId: id, mediaKind, url: `/api/media/${id}`, sizeBytes }, { status: 201 });
  } catch (err) {
    console.error('[media complete]', err);
    return json({ error: 'The uploaded object could not be verified. Check your Backblaze bucket permissions, access mode, and CORS settings.' }, { status: 400 });
  }
};
