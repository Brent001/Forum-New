import { json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth.js';
import { db } from '$lib/server/db/index.js';
import { appSettings, users } from '$lib/server/db/schema.js';

const handle: RequestHandler = async (event) => {
	if (!auth) return json({ message: 'Authentication is not configured.' }, { status: 503 });
	const pathname = new URL(event.request.url).pathname.replace(/\/+$/, '');
	let upstreamRequest = event.request;
	if (event.request.method === 'POST' && pathname.endsWith('/sign-up/email') && db) {
		const [settings] = await db.select({ allowRegistration: appSettings.allowRegistration, inviteOnly: appSettings.inviteOnly })
			.from(appSettings).where(eq(appSettings.id, 1)).limit(1);
		if (settings && (!settings.allowRegistration || settings.inviteOnly)) {
			return json({ message: settings.inviteOnly ? 'This community is invite-only. Contact the site owner for access.' : 'New registrations are currently closed.' }, { status: 403 });
		}
		// New accounts need a stable handle for profile links. Generate one from
		// the chosen display name/email and check for collisions server-side.
		const payload = await event.request.clone().json().catch(() => null) as Record<string, unknown> | null;
		if (payload) {
			const requested = String(payload.username ?? '').trim();
			const source = String(payload.name ?? payload.email ?? 'member').split('@')[0];
			const base = (requested || source).normalize('NFKD').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 22) || 'member';
			let username = base;
			let suffix = 1;
			while (true) {
				const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
				if (!existing) break;
				username = `${base.slice(0, 22)}${suffix++}`.slice(0, 30);
			}
			payload.username = username;
			const headers = new Headers(event.request.headers);
			headers.delete('content-length');
			headers.set('content-type', 'application/json');
			upstreamRequest = new Request(event.request.url, { method: 'POST', headers, body: JSON.stringify(payload), redirect: event.request.redirect });
		}
	}
	return auth.handler(upstreamRequest);
};

export const GET: RequestHandler = handle;
export const POST: RequestHandler = handle;
export const PUT: RequestHandler = handle;
export const PATCH: RequestHandler = handle;
export const DELETE: RequestHandler = handle;
export const OPTIONS: RequestHandler = handle;
export const HEAD: RequestHandler = handle;
