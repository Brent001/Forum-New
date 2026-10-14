import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { notifications } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to manage notifications.' }, { status: 401 });
	const body = await event.request.json().catch(() => null);
	if (body?.all === true) {
		await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, actor.id));
	} else if (typeof body?.id === 'string') {
		await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.userId, actor.id), eq(notifications.id, body.id)));
	} else {
		return json({ error: 'Choose a notification to mark as read.' }, { status: 400 });
	}
	return json({ ok: true });
};
