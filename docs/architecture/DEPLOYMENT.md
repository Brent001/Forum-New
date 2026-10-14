# Netlify frontend + Vercel Express API deployment

This setup uses Netlify for the SvelteKit site and Vercel for the independent Express API. You may reverse those choices, but don't deploy a database, API secret or Backblaze credentials into browser-visible variables.

## 1. Database access and asymmetric signing keys

Use one managed PostgreSQL database reachable from both services. For production, use a provider's pooled connection URL where recommended and set a conservative API connection pool (`API_DB_POOL_MAX=2` to `5` for a function deployment). SvelteKit already keeps its own DB pool small. Avoid opening too many PostgreSQL connections across function instances.

Keep Better Auth's existing `BETTER_AUTH_SECRET`. For the frontend-to-API trust bridge, use an RSA key pair so the API cannot mint frontend access tokens:

- `API_TOKEN_PRIVATE_KEY` — RSA private key, only in Netlify's server environment.
- `API_TOKEN_PUBLIC_KEY` — matching public key, in the Vercel API environment.

Generate a fresh RSA-3072 key pair with Node.js (the command prints both PEM values; do not save the output in the repository):

```powershell
node -e "const c=require('node:crypto');const k=c.generateKeyPairSync('rsa',{modulusLength:3072,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});console.log('PRIVATE KEY (Netlify only):\n'+k.privateKey);console.log('PUBLIC KEY (Vercel):\n'+k.publicKey);"
```

Paste the private PEM into Netlify as `API_TOKEN_PRIVATE_KEY` and the public PEM into Vercel as `API_TOKEN_PUBLIC_KEY`. Multi-line PEM values are supported by both environments; if the provider stores escaped newlines, the application converts `\\n` sequences to line breaks. Rotate both sides together when replacing keys.

Do not prefix `API_TOKEN_PRIVATE_KEY`, `API_TOKEN_PUBLIC_KEY`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `B2_APP_KEY`, `TENOR_API_KEY`, `GIPHY_API_KEY`, or `REDIS_URL` with `PUBLIC_`.

## 2. Netlify (SvelteKit app — currently hybrid, not frontend-only yet)

- Set Base directory to `nexus-next` (the directory containing the SvelteKit `package.json`).
- Build command: `npm run build`.
- Configure the SvelteKit Netlify adapter if Netlify does not select it automatically. SSR routes are functions; don't use a static SPA catch-all redirect that overrides SvelteKit routes.
- Environment variables: `PUBLIC_SITE_URL=https://YOUR-SITE.netlify.app`, `ORIGIN=https://YOUR-SITE.netlify.app`, `DATABASE_URL=...`, `BETTER_AUTH_SECRET=...`, `API_TOKEN_PRIVATE_KEY=...`, `PUBLIC_API_BASE_URL=https://YOUR-API.vercel.app`, plus existing B2 settings and other providers. `DATABASE_URL` is still required here today because legacy SvelteKit routes, Better Auth and upload authorization have not yet migrated to Express. Do not remove it until that migration is complete. Use `deploy/netlify-current-hybrid.env.example`.
- Redeploy after changing build-time/public environment values.
- Set custom domains and Better Auth's trusted origins to your real site origins.

Netlify's SvelteKit deployment guide: https://docs.netlify.com/build/frameworks/framework-setup-guides/sveltekit/

## 3. Vercel (Express API)

Create a separate Vercel project from the same repository and set its Root Directory to `nexus-next/api`.

- Framework/runtime: Node.js 22 / Express. Vercel supports `src/index.ts` as the Express entry point; it exports the same app configured in `src/app.ts`. `src/server.ts` is the persistent local/Node-host entry point. Keep only one Vercel Express entry point to avoid ambiguous function routing.
- Environment variables: `DATABASE_URL=...`, `API_TOKEN_PUBLIC_KEY` (matching the Netlify private key), `ALLOWED_ORIGINS=https://YOUR-SITE.netlify.app,https://your-custom-domain`, `REDIS_URL=...`, `API_DB_POOL_MAX=2`, `TRUST_PROXY_HOPS=1`, and `NODE_ENV=production`. Use `deploy/vercel-api.env.example`.
- `ALLOWED_ORIGINS` must be an exact comma-separated origin allowlist with scheme, no trailing slash, no wildcard.
- Test `https://YOUR-API.vercel.app/api/v1/health` after deployment.
- Configure a managed Redis service for rate limiting across instances. With no Redis, the API logs that per-process rate limits do not coordinate and must be treated as development-only protection.

Vercel Express documentation: https://vercel.com/docs/frameworks/backend/express

## 4. Migrations and seed

Run `npm run db:push` from the frontend/project root in a development environment, inspect the generated changes, and create/apply a reviewed SQL migration to production. Do not casually run schema push against production during concurrent deploys.

After tables exist, seed the shared pixel board once by running `npm run seed:place` in the `api` package with production DB credentials in a protected admin shell. This is idempotent.

## 5. Hosting and scale limits

Vercel's Express integration wraps the API as a Function. Vercel announced WebSocket support in public beta in June 2026 ([changelog](https://vercel.com/changelog/websocket-support-is-now-in-public-beta)); availability and limitations can change, so verify the current platform docs and test connection duration, reconnect behavior, and scale before relying on it for a large collaborative canvas. The current Place UI remains polling-based (three-second delta requests), which is intentionally a simple baseline. For a high-volume canvas, live chat, notifications, or event delivery, consider a dedicated realtime gateway or managed realtime provider with Redis pub/sub/streams, replayable cursors, reconnect/backoff, per-user limits, and the same auth/permission checks. Do not treat a WebSocket connection as the source of truth; PostgreSQL remains authoritative. See `SCALING.md`.


## Future frontend-only Netlify target

`deploy/netlify-target-frontend-only.env.example` documents the desired end state only. **It is not deployable with the current source.** A full route migration is still needed for authentication/session handling, setup/owner actions, posts/comments/votes, DMs, media signing, profiles, search, notifications, moderation, karma and verification. Once all those flows use the Express API and integration tests pass, remove the Netlify database and private backend secrets. Until then, Netlify is a SvelteKit server application with a frontend and legacy backend routes.
