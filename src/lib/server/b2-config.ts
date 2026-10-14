import { env } from '$env/dynamic/private';
import { getB2ConfigFromEnv } from '$lib/storage/b2.js';

export function getPrivateB2Config() {
  return getB2ConfigFromEnv({
    B2_KEY_ID: env.B2_KEY_ID,
    B2_APP_KEY: env.B2_APP_KEY,
    B2_BUCKET_NAME: env.B2_BUCKET_NAME,
    B2_BUCKET_ID: env.B2_BUCKET_ID,
    B2_BUCKET_ACCESS: env.B2_BUCKET_ACCESS,
    B2_PUBLIC_BUCKET_NAME: env.B2_PUBLIC_BUCKET_NAME,
    B2_PRIVATE_BUCKET_NAME: env.B2_PRIVATE_BUCKET_NAME,
    B2_REGION: env.B2_REGION,
    B2_ENDPOINT: env.B2_ENDPOINT,
    B2_PUBLIC_URL: env.B2_PUBLIC_URL,
    B2_MEDIA_DELIVERY: env.B2_MEDIA_DELIVERY
  });
}
