import { json, type RequestHandler } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { moderationLogs, users, verificationRequests } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to request verification.' }, { status: 401 });
	if (actor.isBanned) return json({ error: 'Suspended accounts cannot request verification.' }, { status: 403 });
	if (actor.isVerified) return json({ error: 'Your account is already verified.' }, { status: 409 });
	const body = await event.request.json().catch(() => null);
	const reason = String(body?.reason ?? '').trim();
	const evidenceUrl = String(body?.evidenceUrl ?? '').trim();
	if (reason.length < 30 || reason.length > 1200) return json({ error: 'Explain why the account should be verified in 30–1,200 characters.' }, { status: 400 });
	if (evidenceUrl) {
		try { const url = new URL(evidenceUrl); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); }
		catch { return json({ error: 'The optional evidence link must be a valid HTTPS URL.' }, { status: 400 }); }
	}
	const [pending] = await db.select({ id: verificationRequests.id }).from(verificationRequests)
		.where(and(eq(verificationRequests.userId, actor.id), eq(verificationRequests.status, 'pending'))).limit(1);
	if (pending) return json({ error: 'You already have a verification request awaiting review.' }, { status: 409 });
	const id = crypto.randomUUID();
	await db.insert(verificationRequests).values({ id, userId: actor.id, reason, evidenceUrl: evidenceUrl || null, status: 'pending', createdAt: new Date() });
	return json({ ok: true, id, status: 'pending' }, { status: 201 });
};
