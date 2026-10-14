# Nexus deployment environment files

This repository is still in a **staged backend migration**. The environment examples intentionally reflect what runs today rather than pretending the Netlify app is already static/frontend-only.

## Use now

- `netlify-current-hybrid.env.example`: configure this in Netlify for the current SvelteKit app. It includes `DATABASE_URL`, Better Auth, B2 and the private RS256 signing key because legacy server routes still run in SvelteKit.
- `vercel-api.env.example`: configure this in the separate Vercel project whose Root Directory is `nexus-next/api`. It has its own `DATABASE_URL`, the matching RS256 public key, exact `ALLOWED_ORIGINS`, Redis, and a small function database pool.
- Root `.env.example`: same role as the current Netlify hybrid template for local development.
- `api/.env.example`: same role as the Vercel API template for local API development.

## Do not use yet

`netlify-target-frontend-only.env.example` is a target-state reference only. Do not use it in production until every legacy SvelteKit server route and database access has been moved behind Express and tested. If `DATABASE_URL` is removed from Netlify now, many current features will fail.

## Secret placement

- Netlify current hybrid: `DATABASE_URL`, `BETTER_AUTH_SECRET`, Backblaze B2 server credentials, OAuth secrets, GIF API keys, and `API_TOKEN_PRIVATE_KEY`.
- Vercel API: `DATABASE_URL`, matching `API_TOKEN_PUBLIC_KEY`, and `REDIS_URL`. Only add B2 credentials to Vercel if/when media authorization is explicitly migrated there.
- The RSA private key and public key must be a matching pair. Generate a fresh pair as described in `../docs/architecture/DEPLOYMENT.md`. Never commit real `.env` files or place secrets in `PUBLIC_`/`VITE_` variables.

## Current architecture boundary

Express currently owns events/RSVPs, gaming LFG, academic resource libraries, and Place. Better Auth lifecycle and the original post/comment/vote/moderation/DM/upload/profile/search routes still live in SvelteKit and use the Netlify database connection. See `../docs/architecture/API_MIGRATION.md` for the migration roadmap.
