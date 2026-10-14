# Nexus service architecture

Nexus is moving from an all-in-one SvelteKit app toward a service-oriented deployment. This release introduces a separately deployable Express API for newer domain features; it **does not yet migrate every legacy SvelteKit API route**. The older pages, uploads, Better Auth integration and moderation routes remain in SvelteKit until migrated module by module.

## Runtime map

```text
Browser
  |-- Netlify: SvelteKit web UI + current Better Auth session
  |       |-- legacy /api/* routes (still in SvelteKit)
  |       `-- /api/access-token -> signed 5-minute API token
  |
  `-- Vercel: Express API /api/v1/*
          |-- verifies RS256 token using the API-only public key and reloads account status from PostgreSQL
          |-- events / RSVP
          |-- gaming LFG
          |-- academic resources
          `-- pixel canvas + delta polling
                   |
                   +-- shared PostgreSQL (authoritative writes)
                   +-- Redis (shared API rate limits; recommended required for public production)
                   +-- Backblaze B2 (media is still uploaded directly through existing presigned flow)
```

The client only receives a short-lived signed access token after Better Auth has authenticated the browser session. It is kept in memory by `feature-api.ts`, not localStorage. The Express API validates the signature, issuer, audience and expiry, then reloads the current user and checks active account restrictions. Do not trust a client-submitted user ID or role.

## New domain features

- `standard`: general forum community.
- `gaming`: adds the `Looking for group` area, expiring party sessions, game/platform/region/activity tags, voice requirement, party capacity and join/leave state.
- `academic`: adds a resource library for articles, papers, books, videos, datasets, lecture notes, tools, optional DOI, citation string and visibility.
- `creative`: a typed community for creator-oriented tools and future modules.
- Community events: online, in-person or hybrid events; per-community visibility; capacity; RSVP going/interested; cancellation.
- Nexus Place: sparse pixel state + append-only placement history, configurable palette, server-enforced per-user cooldown, coordinate/color validation, and delta polling. It is inspired by collaborative pixel canvases, but is not a direct Reddit implementation.

## Database model

The app and API use the same PostgreSQL database. Drizzle's `src/lib/server/db/schema.ts` is the schema source of truth. Run `npm run db:push` in development, review changes, and create a reviewed migration for production; avoid concurrent schema mutations from multiple deployments.

New schema tables: `community_events`, `community_event_rsvps`, `gaming_lfg_sessions`, `gaming_lfg_members`, `academic_resources`, `pixel_canvases`, `pixel_cells`, `pixel_history`. Communities gain `community_type` and JSON `community_settings`.

## Development

Terminal 1 (from `nexus-next`):

```bash
npm install
npm run db:push
npm run dev
```

Terminal 2:

```bash
cd api
cp .env.example .env
npm install
npm run dev
```

Set `API_TOKEN_PRIVATE_KEY` only in the frontend server environment and the matching `API_TOKEN_PUBLIC_KEY` in the API environment. The frontend signs short-lived tokens; the API only has the public key and cannot mint them. Generate a fresh RSA-3072 key pair and never commit either key. Set `PUBLIC_API_BASE_URL=http://localhost:4000` for the frontend and `ALLOWED_ORIGINS=http://localhost:5173` for the API.

Before running the pixel-canvas feature the first time:

```bash
cd api
npm run seed:place
```

## Migration boundary

New event/LFG/academic/place features use Express via `src/lib/client/feature-api.ts`. Existing posts, auth, DMs, uploads, moderation, verification, karma and older page loads still use the SvelteKit API/server modules. Do not remove those routes while migrating. See [API migration plan](./API_MIGRATION.md).
