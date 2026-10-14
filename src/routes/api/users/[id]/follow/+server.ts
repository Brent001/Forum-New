import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { follows, notifications, users } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to follow people.' }, { status: 401 });
	const targetId = event.params.id;
	if (!targetId || targetId === actor.id) return json({ error: 'You cannot follow yourself.' }, { status: 400 });
	const [target] = await db.select({ id: users.id, username: users.username, displayName: users.displayName }).from(users).where(and(eq(users.id, targetId), eq(users.isBanned, false))).limit(1);
	if (!target) return json({ error: 'Account not found.' }, { status: 404 });
	const whereFollow = and(eq(follows.followerId, actor.id), eq(follows.followingId, targetId));
	const [existing] = await db.select().from(follows).where(whereFollow).limit(1);
	if (existing) {
		await db.delete(follows).where(whereFollow);
		return json({ ok: true, following: false });
	}
	await db.insert(follows).values({ followerId: actor.id, followingId: targetId });
	await db.insert(notifications).values({
		id: crypto.randomUUID(), userId: targetId, type: 'follow',
		message: `${actor.displayName || actor.username || 'Someone'} followed you.`,
		url: `/u/${encodeURIComponent(actor.username || actor.id)}`
	});
	return json({ ok: true, following: true });
};
