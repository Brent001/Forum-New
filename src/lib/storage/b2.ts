import { S3Client, HeadBucketCommand, HeadObjectCommand, GetBucketAclCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';

export type B2BucketAccess = 'private' | 'public';
export type B2MediaDelivery = 'proxy' | 'redirect';
export type B2Config = {
  keyId: string;
  appKey: string;
  bucketName: string;
  bucketId?: string;
  endpoint: string;
  region?: string;
  /** Access level of bucketName. Must match the setting in the Backblaze console. */
  bucketAccess: B2BucketAccess;
  /** Optional additional public bucket; uses the same endpoint and application key. */
  publicBucketName?: string;
  /** Optional additional private bucket; uses the same endpoint and application key. */
  privateBucketName?: string;
  /** Public object base URL or CDN origin, used only with a public bucket. */
  publicUrl?: string;
  /** Private-object delivery strategy. Proxy keeps URLs same-origin; redirect sends clients to a short-lived B2 URL. */
  mediaDelivery?: B2MediaDelivery;
};

export type B2UploadTarget = { config: B2Config; keyFolder: string };
export const DEFAULT_B2_REGION = 'us-west-004';

function getRuntimeEnv(): Record<string, string | undefined> {
  if (typeof process !== 'undefined' && typeof process.env !== 'undefined') return process.env;
  if (typeof import.meta !== 'undefined' && typeof import.meta.env !== 'undefined') return import.meta.env as Record<string, string | undefined>;
  return {};
}

export function normalizeEndpoint(endpoint: string) {
  const trimmed = String(endpoint ?? '').trim();
  if (!trimmed) throw new Error('Backblaze B2 endpoint is required.');
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== 'https:') throw new Error('Backblaze B2 endpoints must use HTTPS.');
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch (error) {
    if (error instanceof Error && error.message.includes('must use HTTPS')) throw error;
    throw new Error(`Invalid Backblaze B2 endpoint: ${endpoint}`);
  }
}

export function getB2ConfigFromEnv(envSource: Record<string, string | undefined> = getRuntimeEnv()): B2Config {
  // Credentials intentionally come only from server-side B2_* variables.
  // VITE_* values are bundled into browser assets and must never hold an app key.
  const region = envSource.B2_REGION || envSource.VITE_BACKBLAZE_REGION || DEFAULT_B2_REGION;
  const endpoint = envSource.B2_ENDPOINT || envSource.VITE_BACKBLAZE_ENDPOINT || `https://s3.${region}.backblazeb2.com`;
  const rawAccess = (envSource.B2_BUCKET_ACCESS || 'private').trim().toLowerCase();
  if (rawAccess !== 'private' && rawAccess !== 'public') throw new Error('B2_BUCKET_ACCESS must be either "private" or "public".');
  const rawMediaDelivery = (envSource.B2_MEDIA_DELIVERY || 'proxy').trim().toLowerCase();
  if (rawMediaDelivery !== 'proxy' && rawMediaDelivery !== 'redirect') throw new Error('B2_MEDIA_DELIVERY must be either "proxy" or "redirect".');

  const config: B2Config = {
    keyId: envSource.B2_KEY_ID || '',
    appKey: envSource.B2_APP_KEY || '',
    bucketName: envSource.B2_BUCKET_NAME || '',
    bucketId: envSource.B2_BUCKET_ID || undefined,
    endpoint,
    region,
    bucketAccess: rawAccess,
    publicBucketName: envSource.B2_PUBLIC_BUCKET_NAME?.trim() || undefined,
    privateBucketName: envSource.B2_PRIVATE_BUCKET_NAME?.trim() || undefined,
    publicUrl: envSource.B2_PUBLIC_URL?.trim() || undefined,
    mediaDelivery: rawMediaDelivery
  };
  if (!config.keyId || !config.appKey || !config.bucketName) throw new Error('Missing Backblaze B2 configuration. Set B2_KEY_ID, B2_APP_KEY, and B2_BUCKET_NAME on the server.');
  if (config.bucketAccess === 'private' && config.publicBucketName === config.bucketName) throw new Error('B2_PUBLIC_BUCKET_NAME must differ from the private primary B2_BUCKET_NAME.');
  if (config.bucketAccess === 'public' && config.privateBucketName === config.bucketName) throw new Error('B2_PRIVATE_BUCKET_NAME must differ from the public primary B2_BUCKET_NAME.');
  if (config.publicBucketName && config.privateBucketName && config.publicBucketName === config.privateBucketName) throw new Error('B2_PUBLIC_BUCKET_NAME and B2_PRIVATE_BUCKET_NAME must be different buckets.');
  if (config.publicUrl) {
    try {
      const url = new URL(config.publicUrl);
      if (url.protocol !== 'https:' || url.search || url.hash) throw new Error();
      config.publicUrl = url.toString().replace(/\/+$/, '');
    } catch {
      throw new Error('B2_PUBLIC_URL must be a valid HTTPS base URL without query parameters.');
    }
  }
  return config;
}

function ensureB2Config(config: Partial<B2Config>): asserts config is B2Config {
  if (!config.keyId || !config.appKey || !config.bucketName || !config.endpoint || !config.bucketAccess) {
    throw new Error('Backblaze B2 configuration is incomplete.');
  }
}

const s3ClientCache = new Map<string, S3Client>();
function buildB2Client(config: B2Config) {
  ensureB2Config(config);
  const endpoint = normalizeEndpoint(config.endpoint);
  const region = config.region ?? DEFAULT_B2_REGION;
  // Reuse the SDK client in warm serverless instances so proxy streaming can
  // reuse HTTP connections instead of allocating a client for every image.
  // Backblaze key rotation should be followed by a deployment restart.
  const cacheKey = `${endpoint}|${region}|${config.keyId}`;
  const cached = s3ClientCache.get(cacheKey);
  if (cached) return cached;
  const client = new S3Client({ region, endpoint, credentials: { accessKeyId: config.keyId, secretAccessKey: config.appKey }, forcePathStyle: true });
  if (s3ClientCache.size >= 16) {
    const oldestKey = s3ClientCache.keys().next().value;
    if (oldestKey) s3ClientCache.delete(oldestKey);
  }
  s3ClientCache.set(cacheKey, client);
  return client;
}

function errorToString(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'object' && error !== null) {
    try { return JSON.stringify(error); } catch { return String(error); }
  }
  return String(error);
}

export async function testB2Connection(config: Partial<B2Config>): Promise<{ ok: boolean; error?: string }> {
  ensureB2Config(config);
  try {
    await buildB2Client(config).send(new HeadBucketCommand({ Bucket: config.bucketName }));
    // Check both connectivity and declared visibility, so a misconfigured
    // public/private mode fails during setup instead of at media delivery time.
    await verifyB2BucketAccess(config);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorToString(error) };
  }
}

const accessCheckCache = new Map<string, { access: B2BucketAccess; expiresAt: number }>();
/** Verify the declared bucket mode against Backblaze's actual bucket ACL. */
export async function verifyB2BucketAccess(config: B2Config): Promise<void> {
  ensureB2Config(config);
  const cacheKey = `${normalizeEndpoint(config.endpoint)}|${config.bucketName}|${config.keyId}`;
  const cached = accessCheckCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.access !== config.bucketAccess) throw new Error(`B2_BUCKET_ACCESS is set to ${config.bucketAccess}, but bucket ${config.bucketName} is ${cached.access}. Correct B2_BUCKET_ACCESS to match the Backblaze console.`);
    return;
  }
  const response = await buildB2Client(config).send(new GetBucketAclCommand({ Bucket: config.bucketName }));
  const publicRead = (response.Grants ?? []).some((grant) => {
    const grantee = grant.Grantee as ({ URI?: string; Type?: string } | undefined);
    const isEveryone = Boolean(grantee?.URI && /\/groups\/global\/AllUsers/i.test(grantee.URI));
    return isEveryone && (grant.Permission === 'READ' || grant.Permission === 'FULL_CONTROL');
  });
  const actual: B2BucketAccess = publicRead ? 'public' : 'private';
  accessCheckCache.set(cacheKey, { access: actual, expiresAt: Date.now() + 30_000 });
  if (actual !== config.bucketAccess) throw new Error(`B2_BUCKET_ACCESS is set to ${config.bucketAccess}, but bucket ${config.bucketName} is ${actual}. Correct B2_BUCKET_ACCESS to match the Backblaze console.`);
}

/**
 * Pick a storage bucket based on actual privacy needs. A private primary bucket
 * can safely store all media when no secondary public bucket is configured.
 * A public primary bucket must have a secondary private bucket for private media.
 * Prefixes record which bucket an object belongs to, avoiding a DB migration.
 */
export function resolveB2UploadTarget(config: B2Config, requiresPrivate: boolean): B2UploadTarget {
  ensureB2Config(config);
  if (requiresPrivate) {
    if (config.bucketAccess === 'private') return { config, keyFolder: 'media' };
    if (config.privateBucketName) return { config: { ...config, bucketName: config.privateBucketName, bucketAccess: 'private' }, keyFolder: 'media-private' };
    throw new Error('This upload needs private storage, but the configured Backblaze bucket is public. Set B2_BUCKET_ACCESS=private or configure a secondary B2_PRIVATE_BUCKET_NAME.');
  }
  if (config.bucketAccess === 'public') return { config, keyFolder: 'media' };
  if (config.publicBucketName) return { config: { ...config, bucketName: config.publicBucketName, bucketAccess: 'public' }, keyFolder: 'media-public' };
  // No public secondary? Keep assets in the private bucket and expose them via
  // the app's access-checked, time-limited signed download route.
  return { config, keyFolder: 'media' };
}

/** Resolve the actual bucket for old and new object keys. */
export function getB2ConfigForObjectKey(config: B2Config, key: string): B2Config {
  if (key.startsWith('media-public/')) {
    if (config.bucketAccess === 'public') return config;
    if (!config.publicBucketName) throw new Error('This media uses the additional public B2 bucket, but B2_PUBLIC_BUCKET_NAME is not configured.');
    return { ...config, bucketName: config.publicBucketName, bucketAccess: 'public' };
  }
  if (key.startsWith('media-private/')) {
    if (config.bucketAccess === 'private') return config;
    if (!config.privateBucketName) throw new Error('This media uses the additional private B2 bucket, but B2_PRIVATE_BUCKET_NAME is not configured.');
    return { ...config, bucketName: config.privateBucketName, bucketAccess: 'private' };
  }
  return config;
}

export function isObjectInPublicBucket(config: B2Config, key: string): boolean {
  return getB2ConfigForObjectKey(config, key).bucketAccess === 'public';
}

function encodeObjectKey(key: string) {
  return key.split('/').map((part) => encodeURIComponent(part)).join('/');
}

/** Build public read URL only for an object whose actual bucket is public. */
export function getPublicObjectUrl(config: B2Config, key: string): string {
  ensureB2Config(config);
  if (config.bucketAccess !== 'public') throw new Error('Cannot build a public URL for an object in a private bucket.');
  const encodedKey = encodeObjectKey(key);
  if (config.publicUrl) return `${config.publicUrl.replace(/\/+$/, '')}/${encodedKey}`;
  const endpoint = new URL(normalizeEndpoint(config.endpoint));
  if (!/backblazeb2\.com$/i.test(endpoint.hostname)) throw new Error('Set B2_PUBLIC_URL when using a custom B2 endpoint or CDN.');
  // Dot-containing bucket names should use path-style URLs to avoid TLS wildcard issues.
  if (config.bucketName.includes('.')) return `${endpoint.origin}/${encodeURIComponent(config.bucketName)}/${encodedKey}`;
  return `${endpoint.protocol}//${config.bucketName}.${endpoint.host}/${encodedKey}`;
}

export async function uploadFile(options: {
  config: B2Config;
  key: string;
  body: Buffer | Uint8Array | Blob | string;
  contentType: string;
  isPublic?: boolean;
}): Promise<string> {
  ensureB2Config(options.config);
  if (options.config.bucketAccess === 'public' && options.isPublic === false) {
    throw new Error('A public Backblaze bucket cannot keep individual objects private. Use a private bucket for private media.');
  }
  // Backblaze applies public/private access at the bucket level and does not
  // support object-level ACLs. Do not send ACL=public-read on PutObject.
  const upload = new Upload({ client: buildB2Client(options.config), params: { Bucket: options.config.bucketName, Key: options.key, Body: options.body, ContentType: options.contentType } });
  await upload.done();
  return options.config.bucketAccess === 'public' && options.isPublic !== false ? getPublicObjectUrl(options.config, options.key) : options.key;
}

export async function getSignedDownloadUrl(config: B2Config, key: string, expiresIn = 3600): Promise<string> {
  ensureB2Config(config);
  const command = new GetObjectCommand({ Bucket: config.bucketName, Key: key });
  return getSignedUrl(buildB2Client(config), command, { expiresIn });
}

export type B2ObjectRead = {
  body: ReadableStream<Uint8Array> | null;
  contentLength?: number;
  contentType?: string;
  contentRange?: string;
  etag?: string;
  lastModified?: Date;
  acceptRanges?: string;
};

/** Stream a private object from B2 through the application. Supports HTTP byte ranges for video/audio seeking. */
export async function getB2ObjectStream(config: B2Config, key: string, range?: string, signal?: AbortSignal): Promise<B2ObjectRead> {
  ensureB2Config(config);
  const response = await buildB2Client(config).send(new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    ...(range ? { Range: range } : {})
  }), signal ? { abortSignal: signal } : undefined);
  const body = response.Body ? response.Body.transformToWebStream() as ReadableStream<Uint8Array> : null;
  return {
    body,
    contentLength: response.ContentLength,
    contentType: response.ContentType,
    contentRange: response.ContentRange,
    etag: response.ETag,
    lastModified: response.LastModified,
    acceptRanges: response.AcceptRanges ?? 'bytes'
  };
}

/** Metadata-only read used for HTTP HEAD requests without downloading the media body. */
export async function headB2Object(config: B2Config, key: string, signal?: AbortSignal): Promise<{ contentLength?: number; contentType?: string; etag?: string; lastModified?: Date; acceptRanges: string }> {
  ensureB2Config(config);
  const response = await buildB2Client(config).send(new HeadObjectCommand({ Bucket: config.bucketName, Key: key }), signal ? { abortSignal: signal } : undefined);
  return { contentLength: response.ContentLength, contentType: response.ContentType, etag: response.ETag, lastModified: response.LastModified, acceptRanges: 'bytes' };
}

export async function getPresignedUploadUrl(config: B2Config, key: string, contentType: string, maxSizeMb = 50, expectedSizeBytes?: number): Promise<string> {
  ensureB2Config(config);
  if (expectedSizeBytes !== undefined && (!Number.isSafeInteger(expectedSizeBytes) || expectedSizeBytes < 1 || expectedSizeBytes > maxSizeMb * 1024 * 1024)) throw new Error('Upload size is outside the permitted limit.');
  const command = new PutObjectCommand({ Bucket: config.bucketName, Key: key, ContentType: contentType, ...(expectedSizeBytes ? { ContentLength: expectedSizeBytes } : {}) });
  return getSignedUrl(buildB2Client(config), command, { expiresIn: 900 });
}

export async function deleteFile(config: B2Config, key: string): Promise<void> {
  ensureB2Config(config);
  await buildB2Client(config).send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
}

export function buildKey(folder: string, filename: string) {
  const rawExtension = filename.split('.').pop()?.toLowerCase() ?? 'bin';
  const extension = /^[a-z0-9]{1,8}$/.test(rawExtension) ? rawExtension : 'bin';
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${folder}/${uuid}.${extension}`;
}
