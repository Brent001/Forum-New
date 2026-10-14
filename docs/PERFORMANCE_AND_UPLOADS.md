# Uploads, responsiveness, and client architecture

## Upload path

Images, profile/community artwork, and video/audio files are transferred directly from the browser to the configured Backblaze B2 bucket using a short-lived signed PUT URL. Private is the default and recommended mode; public buckets are supported for assets that may be globally readable. When a private primary bucket is used without a public secondary bucket, even public posts remain in private storage and are delivered through Nexus’s access-checked short-lived signed download URLs. The upload helper uses XMLHttpRequest upload events because Fetch does not currently expose portable upload-byte progress. It verifies the object with the server after transfer; the server checks the stored content type and size before creating a media-assets record. Files are transferred with a concurrency cap of three and one aggregate byte-progress value. The video limit remains 250 MB, images 15 MB, audio 40 MB, and emotes 1 MB.

## Background publishing

“Continue in background” moves the selected `File` objects and post payload into a module-level client-side task manager. The shared task center remains mounted across SvelteKit client-side navigation, shows per-task progress and result/error state, supports retry, retains the IDs for media files that completed successfully, and retries only the remaining files after a partial failure. The browser warns before a user closes or reloads the tab while an upload is active. Background post requests carry an idempotency key, so retrying after a lost network response returns the already-created post instead of duplicating it. This is **not** a server-side job and does not survive tab closure, browser restart, device changes, or a forced reload. Truly durable/resumable uploads need an IndexedDB/service-worker queue or server-side multipart session with recovery tokens and object cleanup; that is intentionally not implied by this implementation.

## Performance work

- Home feed hydration queries only vote/bookmark/poll rows for the 80 posts returned, plus follows/blocks/mutes for the authors actually in that feed. Community membership/moderator joins are scoped to feed community IDs.
- Community pages similarly scope vote/bookmark/follow data to the current 60 posts and their authors.
- Community list loading is run in parallel with actor resolution.
- Database indexes cover community-feed ordering, vote target lookups, memberships by community, reverse follow lookups, bookmarks by post, and unique post idempotency keys. Apply schema changes only after taking a database backup.
- Uploaded video players initialize near the viewport using IntersectionObserver, avoiding dozens of simultaneously initialized players. Artwork and cover images use lazy loading.
- Shared global toast notifications decouple interaction feedback from individual screens. The dropdown supports keyboard navigation, Escape, and better stacking.

## Validation before production

1. Run `npm ci`, `npm run check`, and `npm run build`.
2. Back up PostgreSQL, then review/apply the additional indexes with `npm run db:push` or the project's usual migration workflow.
3. Confirm the configured B2 bucket(s)' CORS policy allows the application's origin to `PUT` the required media types; keep signing credentials on the server. Private storage is the recommended default, while public buckets are supported only for media that may be globally readable.
4. Test a small upload, a maximum-size upload, multiple mixed media files, background navigation, cancellation by tab close, permissions for community artwork, and failed post publishing.
5. Consider adding resumable multipart upload and stale-object cleanup before relying on uploads through unreliable mobile connections.
