# API migration plan

The current code intentionally uses a strangler migration: new features are implemented in the Express service while existing routes remain in SvelteKit, avoiding a risky big-bang rewrite.

## Currently served by Express (`/api/v1`)

- `GET /health`, `GET /capabilities`
- `GET /events?community=<slug>&limit=...`
- `POST /communities/:slug/events`
- `PUT /events/:id/rsvp`, `DELETE /events/:id/rsvp`, `PATCH /events/:id/cancel`
- `GET/POST /communities/:slug/lfg`
- `POST/DELETE /lfg/:id/join`, `PATCH /lfg/:id/close`
- `GET/POST /communities/:slug/resources`, `DELETE /resources/:id`
- `GET /place/:slug`, `GET /place/:slug/updates?after=<history-id>`, `POST /place/:slug/pixels`

The frontend uses a signed short-lived token from the Better Auth-guarded `GET /api/access-token` route. Do not expose the token signing secret or fall back to trusting arbitrary `x-user-id` headers.

## Keep in SvelteKit for now

Auth/session lifecycle, setup/owner routes, posts/comments/votes/polls, moderation, user privacy, encrypted DMs, uploads/presigning, profile changes, search, notifications, karma/verification. These depend on existing frontend server actions, Better Auth's server session model and the current data types. Move each domain into Express only after adding API-level tests and migrating clients end-to-end.

## Migration order suggested

1. Events, game LFG, academic resources and Place (done in this release).
2. Read-only community discovery and search behind `/api/v1`.
3. Posts and comments with idempotency keys, cursor pagination and transaction tests.
4. Votes/polls/bookmarks/follows with audit/karma logic preserved and concurrency tests.
5. Moderation, roles and privacy requests after policy tests and audit-log parity.
6. Auth can remain Better Auth with server-issued access tokens or move to an identity provider only as a separate security project.

Each migration step should define request/response schemas, authorization tests, rate limits, metrics and rollback steps before replacing the old route.
