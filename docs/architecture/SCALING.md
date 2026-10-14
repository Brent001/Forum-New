# Scale-up roadmap for Nexus

## What is included now

- Versioned Express API and a single place for request validation, security headers, CORS, structured request logging, safe error responses and route rate limits.
- Short-lived RS256 tokens signed by the Netlify-side private key after Better Auth verifies the user session. The Vercel API holds only the public verification key. The API looks up the live account status instead of trusting token-supplied roles.
- PostgreSQL remains the source of truth for permissions and critical writes; pixel placement uses a transaction and an advisory lock per user/canvas to enforce cooldown under concurrent requests.
- Cursor-like pixel delta reads by monotonic history ID, rather than polling and downloading the entire grid every time.
- Indexed event and resource queries, bounded list limits, and idempotent LFG membership operations.
- Redis-compatible shared API rate-limit store when `REDIS_URL` is configured.

## Production scale requirements still to add

1. **Shared rate limiting is mandatory for a public multi-instance deployment.** Set `REDIS_URL`; the Express `MemoryStore` fallback is per process and can be bypassed across horizontally scaled function instances.
2. **Realtime gateway.** The current Place UI polls deltas. For production-grade fan-out, consider a dedicated Node/WebSocket service or managed realtime provider with Redis pub/sub/streams, replay cursors, reconnect/backoff, bounded room subscriptions and server-side authorization. Vercel announced WebSocket support in public beta in June 2026 ([platform changelog](https://vercel.com/changelog/websocket-support-is-now-in-public-beta)), but verify current availability and limits before making it the core of a viral canvas. Do not use an in-process map as cross-instance state, and do not treat connected sockets as the source of truth.
3. **Queue and workers.** Add BullMQ/Redis or a managed queue for video transcoding, thumbnail generation, media scanning, search indexing, outbound email, recommendation refresh and moderation automation. Jobs should be idempotent, retried with exponential backoff, observable, and dead-lettered after a bounded retry count.
4. **Media pipeline.** Browser uploads directly to Backblaze B2 with presigned URLs. In production, enforce upload limits/mime sniffing, quarantine new objects, malware scan where appropriate, transcode video into playback-ready HLS/MP4 renditions, generate posters, then publish metadata only when the pipeline succeeds. Do not proxy large video bodies through Express or serverless function memory.
5. **PostgreSQL connection pooling.** Use a managed pooler compatible with the selected PostgreSQL provider. Set per-function `max` conservatively and watch active/idle connections. Use migrations, not unreviewed concurrent schema pushes, in production.
6. **Feed query/caching.** Cursor pagination, appropriate compound indexes and `EXPLAIN (ANALYZE, BUFFERS)` should precede denormalization. Use Redis for ephemeral cache, not as the authority for roles, bans, membership or private access. Invalidate cached cards with events/outbox rather than trusting long TTLs.
7. **Outbox/event pipeline.** Write critical domain changes and an outbox event in one PostgreSQL transaction; asynchronously dispatch to Redis, search, feed aggregates and notifications. This avoids losing downstream updates after a successful transaction.
8. **Observability.** Use request IDs, Pino JSON logs, error-rate/latency histograms, database pool metrics, queue depth, upload failure rates and SLO alerts. Redact authorization headers and never log DM ciphertext keys or private messages.
9. **Abuse controls.** Use shared rate limits, duplicate content controls, anti-spam scoring and a report review process. Place rate/cooldown values belong on the server. Consider daily per-user pixel caps/temporary account restrictions for coordinated abuse.
10. **Security baseline.** Exact CORS origins, HTTPS, secrets stored in host secret managers, input schemas, owner/moderator authorization tests, private-community checks on every API path, dependencies audited and security-reviewed before launch. The NIST CSF 2.0 and Philippine Data Privacy Act readiness docs are planning references, not certification.

## Current Place trade-off

The place canvas stores the latest color for each coordinate in `pixel_cells` and every placement in `pixel_history`. The API polls deltas in batches of 2,000 and the browser refreshes every three seconds. That is a practical prototype for low/moderate activity, not equivalent to Reddit's event distribution or abuse systems. To handle a viral canvas, introduce partitioning/archive policies for placement history, a Redis pub/sub or stream, connection fan-out and reconnect cursors. Evaluate write contention and index bloat with real traffic before setting board size or cooldown policies.
