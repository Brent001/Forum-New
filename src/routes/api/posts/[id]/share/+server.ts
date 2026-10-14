import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { posts, userInteractions } from '$lib/server/db/schema.js';
import { canAccessPost, getActor, recordInteraction } from '$lib/server/social.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to record a share.' }, { status: 401 });
	const postId = event.params.id;
	if (!await canAccessPost({ id: actor.id, isOwner: actor.isOwner, isAdmin: actor.isAdmin }, postId)) return json({ error: 'Post not found or inaccessible.' }, { status: 404 });
	const [recent] = await db.select({ id: userInteractions.id }).from(userInteractions).where(and(
		eq(userInteractions.userId, actor.id), eq(userInteractions.targetId, postId), eq(userInteractions.actionType, 'share'),
		gt(userInteractions.createdAt, new Date(Date.now() - 15 * 60 * 1000))
	)).limit(1);
	if (recent) return json({ ok: true, counted: false });
	await db.update(posts).set({ shareCount: sql`${posts.shareCount} + 1` }).where(eq(posts.id, postId));
	await recordInteraction({ userId: actor.id, targetId: postId, actionType: 'share' });
	return json({ ok: true, counted: true });
};
