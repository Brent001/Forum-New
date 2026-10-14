# Backblaze B2 public and private bucket support

Nexus supports Backblaze B2 S3-compatible storage with either a private or public primary bucket. Private is the default. Optional secondary bucket settings let one Nexus instance route public and private assets to separate buckets while keeping all credentials server-side.

## Recommended configuration for a private bucket (the default)

```dotenv
B2_KEY_ID=...
B2_APP_KEY=...
B2_BUCKET_NAME=your-private-bucket
B2_REGION=us-west-004
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_BUCKET_ACCESS=private
B2_MEDIA_DELIVERY=proxy
B2_PUBLIC_URL=
B2_PUBLIC_BUCKET_NAME=
B2_PRIVATE_BUCKET_NAME=
```

With only a private bucket configured, every asset is stored privately. Public posts and profile/community images are viewable through Nexus because `/api/media/:id` checks the applicable post/profile/community permissions, then proxies photos/GIFs from B2 through the site URL. Publicly viewable assets get cross-origin image headers so external embeds work; private/community-only images remain same-origin and uncacheable. You do not need a public bucket for images to display. Video/audio and files larger than 15 MiB are redirected to a one-hour presigned B2 URL, because Netlify streaming responses are capped at 20 MB. Set `B2_MEDIA_DELIVERY=redirect` to bypass the proxy for all media.

## Single public bucket

```dotenv
B2_BUCKET_NAME=your-public-bucket
B2_BUCKET_ACCESS=public
B2_PUBLIC_URL=
B2_PRIVATE_BUCKET_NAME=
```

The app builds public object URLs automatically for supported Backblaze S3 endpoints. Set `B2_PUBLIC_URL=https://cdn.example.com` (without a query string or token) if you have a public CDN/custom media base.

**A public B2 bucket cannot keep individual objects private.** Nexus therefore refuses uploads that require private storage when no private bucket is available. This includes private-profile media, media attached to community-bound posts (because a community can later become private), community artwork, and community emotes. Global public-post media can use the public bucket. Configure `B2_PRIVATE_BUCKET_NAME` to retain those features.

## Mixed public/private storage

A secondary bucket uses the same `B2_REGION`, `B2_ENDPOINT`, `B2_KEY_ID`, and `B2_APP_KEY`. Ensure the S3-compatible application key is allowed to access every configured bucket. If the key is restricted to buckets, use an application key scoped to all required buckets (including a multi-bucket key where appropriate). The code verifies visibility with `GetBucketAcl`, so grant the `readBuckets` capability in addition to `readFiles` and `writeFiles`. Restricted keys also need `listAllBucketNames` for the SDK's bucket check. The exact key capability set is summarized below.

### Private primary, public secondary

```dotenv
B2_BUCKET_NAME=your-private-bucket
B2_BUCKET_ACCESS=private
B2_PUBLIC_BUCKET_NAME=your-public-bucket
B2_PUBLIC_URL=https://your-public-bucket.s3.us-west-004.backblazeb2.com
```

Public global-post media and assets explicitly marked public can be placed in the public secondary. Community-bound media, community artwork/emotes, and explicitly private assets remain in private storage.

### Public primary, private secondary

```dotenv
B2_BUCKET_NAME=your-public-bucket
B2_BUCKET_ACCESS=public
B2_PRIVATE_BUCKET_NAME=your-private-bucket
B2_PUBLIC_URL=https://your-public-bucket.s3.us-west-004.backblazeb2.com
```

Public assets use the primary bucket. Private-profile media, community-bound post media, community artwork, emotes, and other private assets are sent to the private secondary bucket.

The media object-key prefix identifies its bucket without requiring a schema migration: `media/` is the primary bucket, `media-public/` the secondary public bucket, and `media-private/` the secondary private bucket. Keep these bucket names and key prefixes stable for existing media; if you rename or remove a secondary bucket from environment configuration, older media using that prefix cannot be resolved until configuration is restored or the media is migrated.

## Important privacy rules

- `B2_BUCKET_ACCESS` must match the access setting of the primary bucket in the Backblaze console. It is configuration, not a command that changes bucket ACLs. Startup/upload checks read the bucket ACL, so a restricted application key needs `readBuckets`; bucket-restricted S3 keys also need `listAllBucketNames` for `HeadBucket` checks.
- Don't change an existing private bucket to public if it contains private media. Create a separate public bucket and configure it as `B2_PUBLIC_BUCKET_NAME` instead. Public-read access is bucket-wide; B2 doesn't support private/public object ACLs within a bucket.
- Nexus's bucket selection is based on an asset's privacy context. Media attached to a community is kept in private storage to protect it if the community later becomes private.
- If the owner tries to make a community private while its linked media is still in a public bucket, Nexus blocks the change rather than silently leaking that media.
- If a profile uses media stored in a public bucket, the profile cannot be made private until the avatar/banner is replaced with a privately stored asset.
- `B2_APP_KEY`, key IDs, bucket credentials, and signed PUT URLs must never be placed in `PUBLIC_` or `VITE_` environment variables. Use only server-side `B2_*` variables. If a Backblaze application key was ever bundled as `VITE_BACKBLAZE_APPLICATION_KEY`, rotate it in Backblaze and replace it with `B2_APP_KEY`.
- Configure CORS rules for each bucket used by the exact Netlify/local origins in the browser uploader, allowing `PUT` and the `Content-Type` header.
- For a bucket-restricted app key, grant `readFiles` and `writeFiles` for media delivery and uploads/deletes by name, plus `readBuckets` for ACL verification and `listAllBucketNames` for `HeadBucket` checks. Add `deleteFiles` only if your workflow needs deleting specific file versions. Do not grant key-management or bucket-creation capabilities to the application key.

## Delivery behavior

- Private-bucket photos/GIFs (default `B2_MEDIA_DELIVERY=proxy`): Nexus checks account/post/community/profile permissions, then streams image bytes through `/api/media/:id`. On the Nexus site, the browser sees a same-origin URL, so read CORS is not needed for rendering. Public assets also send cross-origin resource/CORS headers for embeds on other websites; private assets do not. Private/community-only images use `Cache-Control: private, no-store`; images confirmed anonymous-accessible use a short 30-second cache. No public B2 bucket is needed for public posts to display.
- Video/audio and assets larger than 15 MiB: the route redirects to a one-hour signed B2 `GetObject` URL. This avoids Netlify's 20 MB streaming-response cap and lets the browser request byte ranges directly from B2 for efficient seeking. Treat the signed URL as a bearer link: anyone who obtains it may access that file until it expires. A future long-lived media gateway or CDN with authorization would remove this tradeoff.
- `B2_MEDIA_DELIVERY=redirect`: all private-bucket media uses the same one-hour presigned URL strategy, reducing application-server bandwidth but exposing a temporary bearer URL to the browser.
- Public-bucket object: Nexus applies app access checks, then redirects to the stable public URL. The underlying object remains publicly readable by anyone who knows its URL; do not store sensitive/private content there.
- Uploads still use presigned S3-compatible `PUT` URLs directly to B2. Configure CORS on the private bucket in Backblaze Console → bucket → CORS Rules for your exact Netlify and development origins, `PUT` and the required headers. CORS permits browser cross-origin requests; it does **not** make a private bucket or its objects public. An example rule is in `docs/backblaze-private-bucket-cors.example.json`.

## References

- [Backblaze S3-Compatible API](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api)
- [Backblaze S3-compatible application-key capabilities](https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys)
- [Map IAM policies and S3 ACLs to B2 access controls](https://www.backblaze.com/docs/cloud-storage-map-iam-policies-and-s3-acls-to-backblaze-b2-access-controls)
- [Backblaze B2 S3 endpoint format](https://www.backblaze.com/docs/en/cloud-storage-call-the-s3-compatible-api)
