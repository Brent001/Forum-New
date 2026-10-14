import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { userBlocks, userMutes, users } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to manage account controls.' }, { status: 401 });
	const targetId = event.params.id;
	if (!targetId || targetId === actor.id) return json({ error: 'You cannot mute or block yourself.' }, { status: 400 });
	const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
	if (!target) return json({ error: 'Account not found.' }, { status: 404 });
	const body = await event.request.json().catch(() => null);
	const action = String(body?.action ?? '');
	if (action === 'mute' || action === 'unmute') {
		const where = and(eq(userMutes.muterId, actor.id), eq(userMutes.mutedId, targetId));
		const [existing] = await db.select().from(userMutes).where(where).limit(1);
		if (action === 'unmute' || existing) await db.delete(userMutes).where(where);
		else await db.insert(userMutes).values({ muterId: actor.id, mutedId: targetId });
		return json({ ok: true, muted: action === 'mute' ? !existing : false });
	}
	if (action === 'block' || action === 'unblock') {
		const where = and(eq(userBlocks.blockerId, actor.id), eq(userBlocks.blockedId, targetId));
		const [existing] = await db.select().from(userBlocks).where(where).limit(1);
		if (action === 'unblock' || existing) await db.delete(userBlocks).where(where);
		else await db.insert(userBlocks).values({ blockerId: actor.id, blockedId: targetId });
		return json({ ok: true, blocked: action === 'block' ? !existing : false });
	}
	return json({ error: 'Unknown account control.' }, { status: 400 });
};
