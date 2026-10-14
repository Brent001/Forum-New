import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth.js';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { startScoreUpdater } from '$lib/server/algorithm/updater.js';
import { db } from '$lib/server/db/index.js';
import { users } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

if (!building) void startScoreUpdater();

function withSecurityHeaders(response: Response, isProduction: boolean) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-site');
  if (isProduction) headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const handleBetterAuth: Handle = async ({ event, resolve }) => {
  if (auth) {
    const session = await auth.api.getSession({ headers: event.request.headers });
    if (session) {
      event.locals.session = session.session;
      event.locals.user = session.user;
    }
  }

  const method = event.request.method.toUpperCase();
  const writes = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const path = event.url.pathname;
  const restrictedAllowlist = path.startsWith('/api/auth/') || path === '/api/support' || path === '/api/privacy-requests';
  if (writes && path.startsWith('/api/') && !restrictedAllowlist && event.locals.user?.id && db) {
    const [account] = await db.select({ isOwner: users.isOwner, isBanned: users.isBanned, banUntil: users.banUntil, banReason: users.banReason })
      .from(users).where(eq(users.id, event.locals.user.id)).limit(1);
    const tempBanActive = Boolean(account?.banUntil && account.banUntil.getTime() > Date.now());
    if (account && !account.isOwner && (account.isBanned || tempBanActive)) {
      const response = json({ error: account.banReason || 'This account is temporarily restricted from posting or interacting. Contact support to appeal.' }, { status: 403 });
      return withSecurityHeaders(response, event.url.protocol === 'https:');
    }
  }

  const response = auth
    ? await svelteKitHandler({ event, resolve, auth, building })
    : await resolve(event);
  return withSecurityHeaders(response, event.url.protocol === 'https:');
};

export const handle = handleBetterAuth;
