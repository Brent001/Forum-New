import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { notifications } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const load: PageServerLoad = async (event) => {
	const actor = await getActor(event);
	if (!actor) throw redirect(302, '/login?callbackURL=%2Fnotifications');
	if (!db) return { notifications: [], unread: 0, viewer: { id: actor.id, name: actor.displayName ?? actor.username ?? 'Member' } };
	const rows = await db.select().from(notifications).where(eq(notifications.userId, actor.id)).orderBy(desc(notifications.createdAt)).limit(100);
	return { notifications: rows, unread: rows.filter((item) => !item.isRead).length, viewer: { id: actor.id, name: actor.displayName ?? actor.username ?? 'Member' } };
};
