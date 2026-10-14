# Nexus — community + social feed

A SvelteKit 2 / Svelte 5 / TypeScript app combining a discussion forum, interest communities and a social feed. It uses PostgreSQL through Drizzle ORM and Better Auth for sessions and email/password authentication.

## Features

- Personalized **For You**, **Following**, **Latest**, **Top**, **Trending**, **Best** and **Hot** feeds.
- Feed ranking informed by predicted-like/reply/share/bookmark/click/dwell/follow signals, freshness, follow graph, author diversity, new-author discovery and negative feedback. See [`docs/FEED_RANKING.md`](docs/FEED_RANKING.md) for the scope and limitations.
- Text and link posts, polls, voting, threaded comments, bookmarks, sharing, reports and notification inbox. Supported links can render as privacy-conscious, provider-specific embeds: YouTube, Twitch live/VOD/clips, Vimeo, Spotify, Apple Music, SoundCloud, Dailymotion, Mixcloud, Scratch projects and TurboWarp projects. Unrecognized or unsupported links remain ordinary external previews; arbitrary user-supplied iframe URLs are never rendered.
- Public/private communities, membership, discovery, post flairs, and Discord-style custom community emotes (animated GIFs supported). Community creators can appoint/revoke moderators; moderators can manage emotes, pin/lock/remove posts, restore removed posts from a queue, and issue timed or permanent community bans.
- Profiles, following, mute/block controls, muted keywords and opt-in sensitive-content preferences. Threaded replies support GIF attachments and community emotes; GIF search combines Tenor and GIPHY when configured (`TENOR_API_KEY` and/or `GIPHY_API_KEY`), keeps API keys server-side, and supports provider selection or automatic merged search.
- Owner Studio with high-level counts, report review, remove/restore/pin/lock controls, user suspension/roles/verification, community feature/privacy controls, configurable registration/feed/post-rate settings and an audit log.
- Reddit-inspired responsive forum UI: full-width desktop layout, compact top search bar, left community navigation, Best/Hot/New/Top sorting, vote rail, comments/share/save actions, and a familiar right-hand community sidebar. Mobile gets a purpose-built five-item bottom navigation and a slide-out sidebar. Reusable custom dropdowns and icons use `@lucide/svelte`, with no hand-authored inline SVGs or native `<select>` elements in Svelte screens.
- Post composer with explicit Post, Images & Video, Link, and Poll tabs; Backblaze B2 attachments are uploaded before publishing and image/video/audio media is rendered in feed cards.

## Requirements

- Node.js 20+ (Node 22 recommended)
- PostgreSQL database
- A `DATABASE_URL` connection string
- A `BETTER_AUTH_SECRET` with at least 32 random characters and `PUBLIC_SITE_URL`

Copy `.env.example` to `.env.local` (or configure environment variables in your host). Do not commit production secrets. A managed PostgreSQL provider may require SSL; the database client enables SSL for non-local URLs.

## Install and run

```bash
npm install
npm run db:push
npm run dev
```

Open the local URL printed by Vite. On the first visit, complete the setup wizard to create the site settings and owner account. The schema has been extended in this version, so run `npm run db:push` before opening a previously initialized database. Review the generated SQL/change plan and back up any database with real data before applying schema changes.

To verify the project:

```bash
npm run check
npm run build
```

## Owner Studio

The first account created by the setup wizard is marked `isOwner = true` with role `owner`. Sign in with that account and open **Owner Studio** from the navigation or visit `/admin`. The application denies `/admin` and `/api/admin` access unless the signed-in database user is the owner. Admin/moderator roles exist for role management, but this build intentionally keeps global site controls owner-only.

Registration toggles are enforced at the Better Auth email sign-up endpoint. With invite-only enabled, public sign-up is blocked; an invitation issuance/claim workflow is not yet included.

## Consistency and security model

Nexus follows a **BASE-inspired approach for read-heavy social features** (ranking, trending, derived counters, recommendations and eventual feed refreshes), while PostgreSQL remains the authoritative relational store. BASE is an availability/consistency model, not a privacy or legal compliance standard; ACID transactions are not finance-only and remain appropriate for permissions, moderation, membership, bans, poll uniqueness, privacy requests, and other critical writes. See [`docs/CONSISTENCY_MODEL.md`](docs/CONSISTENCY_MODEL.md) for the boundary and scale-up architecture, and [`docs/COMMUNITY_MODERATION_AND_EMOTES.md`](docs/COMMUNITY_MODERATION_AND_EMOTES.md) for community tools, ban behavior and GIF provider configuration.

Compliance work is documented against the Philippine Data Privacy Act of 2012 and the NIST Cybersecurity Framework 2.0, but the codebase is **not legally certified or independently security-audited**. Replace operator/DPO placeholders and complete a Philippine legal/privacy review before public launch.
See [`docs/PH_PRIVACY_NIST_CSF2_READINESS.md`](docs/PH_PRIVACY_NIST_CSF2_READINESS.md) for a practical Philippine privacy and CSF 2.0 readiness checklist, authoritative references, and controls that still require operational work.

## Ranking transparency

The For You ranking is **X-inspired, not X's exact production algorithm**. X's public codebase includes transformer training/inference, retrieval, model checkpoints and serving infrastructure that this site does not bundle. This implementation follows the published multi-action weighted scoring and diversity/recency design using the records available locally. Read [`docs/FEED_RANKING.md`](docs/FEED_RANKING.md) and the upstream [xai-org/x-algorithm](https://github.com/xai-org/x-algorithm) repository.

## Notes

- Database tables and columns are managed by Drizzle. This feature pass includes `comments.gif_url`, `communities.created_by`, and `community_bans`; run `npm run db:push` in development, then review a migration workflow before production rollout. Existing communities may have a null `created_by` because older data did not record the creator; the site owner can assign their first moderator from the community tools.
- Media upload endpoints and UI support configured Backblaze B2 for photos, video, audio, profile images, banners and community emotes. Large-scale transcoding, malware scanning, real-time delivery and moderation review of media remain deployment/production hardening items.
- Use HTTPS, secure database credentials, regular backups, rate limits at the edge and a production-capable SvelteKit adapter before publishing a public production instance.

## Recent update: verification and reputation

See [`docs/KARMA_AND_VERIFICATION.md`](docs/KARMA_AND_VERIFICATION.md) for the owner-reviewed verified badge workflow, post/comment karma calculation, vote-change accounting, migration steps, and limitations. After applying the database schema, the site owner can run the one-time karma reconciliation from Owner Studio.


## External video, audio and interactive embeds

`ExternalEmbed.svelte` and `src/lib/utils/external-embeds.ts` safely convert an allowlist of provider URLs into canonical iframe URLs. The allowlist accepts YouTube watch/shorts/live/embed links, Twitch channel/VOD/clip URLs, Vimeo videos including unlisted `h` links, Spotify tracks/albums/playlists/artists/podcasts, Apple Music, SoundCloud, Dailymotion, Mixcloud, Scratch project pages and TurboWarp project pages. Unsupported URLs keep the regular external-link preview.

Twitch requires the current site hostname in its `parent` parameter. The component gets that from the browser hostname and uses `PUBLIC_SITE_URL` as the SSR fallback; configure the real public domain in production. Twitch documents a 400×300 minimum player size, so on narrow mobile feeds the embedded player may require horizontal scrolling. Player embeds run on their providers’ domains and may send the provider the viewer’s IP address and basic connection metadata when loaded. Private/unshared projects, disabled embeds, regional restrictions, and provider outages can still prevent playback. Scratch and TurboWarp embeds are sandboxed to a limited set of interactive capabilities; no arbitrary embed markup or third-party iframe host is trusted.

Official implementation references: [Twitch embed documentation](https://dev.twitch.tv/docs/embed/everything/), [Vimeo Player embed options](https://developer.vimeo.com/player/sdk/embed), [Spotify embeds](https://developer.spotify.com/documentation/embeds), [TurboWarp embedding](https://docs.turbowarp.org/embedding).

## ArtPlayer video experience

Uploaded video attachments in feed cards use the customized `ArtVideoPlayer.svelte` component built on ArtPlayer 5.4.0. It provides responsive 16:9 playback, playback-speed settings, aspect-ratio options, picture-in-picture, web fullscreen, keyboard controls, and a Nexus dark theme with Reddit-orange progress accents. The native HTML video element remains as a fallback if ArtPlayer cannot initialize.

Run `npm install` after pulling this update so the `artplayer` dependency is installed. YouTube embeds remain privacy-enhanced iframe embeds; ArtPlayer is used for uploaded/hosted media rather than attempting to bypass third-party platform players.


## Separate Express API (Netlify + Vercel)

This release adds an independent Express API under `api/` for community events/RSVPs, gaming LFG, academic resource libraries, and the collaborative pixel canvas. The existing SvelteKit frontend can deploy on Netlify; the Express API can deploy as a separate Vercel project with `nexus-next/api` as its root. See [`docs/architecture/DEPLOYMENT.md`](docs/architecture/DEPLOYMENT.md) before deploying.

This is a staged separation, not a claim that every legacy backend route has already moved: Better Auth/session routes, posts/comments/votes, DMs, upload signing, moderation, verification, karma, and much of the profile/search functionality still run in SvelteKit. Keep `DATABASE_URL`, `BETTER_AUTH_SECRET`, B2 credentials and `API_TOKEN_PRIVATE_KEY` in the Netlify server environment until these routes are migrated. The new API uses a five-minute signed token issued server-side after Better Auth session validation and rechecks current account restrictions against PostgreSQL. Use `deploy/netlify-current-hybrid.env.example` and `deploy/vercel-api.env.example` for host configuration. The frontend-only env template is future-state documentation and will break current routes if used before migration.

### Local API development

Run the frontend in one terminal (`npm run dev`) and the Express API in another (`cd api`, copy `.env.example` to `.env`, then `npm install` and `npm run dev`). Configure `PUBLIC_API_BASE_URL=http://localhost:4000` for the frontend and `ALLOWED_ORIGINS=http://localhost:5173` for the API. Run `npm run db:push` from the project root before first use, then `npm run seed:place` inside `api` to initialize the shared canvas.

### Specialized communities

Community types can enable events, gaming LFG (Looking for Group), or an academic resource library. `/place` is an early collaborative pixel-canvas implementation with server-controlled colors, bounds and per-account cooldown plus cursor-based delta polling. It is a prototype rather than a high-scale substitute for the complete Reddit r/place infrastructure; see [`docs/architecture/SCALING.md`](docs/architecture/SCALING.md).

## Backblaze B2 bucket visibility

Nexus defaults to a private Backblaze B2 bucket and supports public buckets or optional mixed storage. See [`docs/BACKBLAZE_PUBLIC_PRIVATE_BUCKETS.md`](docs/BACKBLAZE_PUBLIC_PRIVATE_BUCKETS.md) for configuration examples, media-routing behavior, and privacy limitations. Never set B2 credentials in `VITE_*` variables.

For Backblaze B2 public/private bucket routing, see `docs/BACKBLAZE_PUBLIC_PRIVATE_BUCKETS.md`. Private bucket storage is the default; you do not need a public bucket for Nexus to serve public posts.

## Environment templates (important)

Use `deploy/netlify-current-hybrid.env.example` for Netlify and `deploy/vercel-api.env.example` for the independent Express API. These reflect the current staged migration accurately. **Do not remove `DATABASE_URL` from Netlify yet**: several SvelteKit server routes and Better Auth still connect to PostgreSQL. `deploy/netlify-target-frontend-only.env.example` is documentation for the future end state only and is not deployable with the current code. Never put real secrets in a ZIP or commit a real `.env` file. See `deploy/ENVIRONMENT_SPLIT.md`.

### Private Backblaze bucket media display

Keep `B2_BUCKET_ACCESS=private` and set `B2_MEDIA_DELIVERY=proxy` (the default). `/api/media/:id` validates post/profile/community access and proxies photos/GIFs through the app origin, so `<img>` tags use a normal app URL without browser-to-B2 read CORS. Publicly viewable media also gets cross-origin image headers to support external embeds; private media does not. Video/audio and assets larger than 15 MiB redirect to a one-hour signed B2 URL to avoid Netlify's 20 MB streamed-response limit and keep large playback traffic off the site function. This does not make the B2 bucket public. Browser direct-to-B2 uploads still need bucket CORS; see `docs/backblaze-private-bucket-cors.example.json`.

If you set `B2_MEDIA_DELIVERY=redirect`, all private-bucket media will use signed B2 URLs. These are bearer links, so anyone who obtains one can access that object until the one-hour expiration.
