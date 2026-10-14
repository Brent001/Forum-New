import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { bookmarks, posts } from '$lib/server/db/schema.js';
import { canAccessCommunity, getActor, recordInteraction } from '$lib/server/social.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to save posts.' }, { status: 401 });
	const postId = event.params.id;
	const [existing] = await db.select().from(bookmarks).where(and(eq(bookmarks.userId, actor.id), eq(bookmarks.postId, postId))).limit(1);
	if (existing) {
		await db.delete(bookmarks).where(and(eq(bookmarks.userId, actor.id), eq(bookmarks.postId, postId)));
		return json({ ok: true, bookmarked: false });
	}
	const [post] = await db.select({ id: posts.id, communityId: posts.communityId, isRemoved: posts.isRemoved }).from(posts).where(eq(posts.id, postId)).limit(1);
	if (!post || post.isRemoved) return json({ error: 'Post not found.' }, { status: 404 });
	if (post.communityId && !await canAccessCommunity({ id: actor.id, isOwner: actor.isOwner, isAdmin: actor.isAdmin }, post.communityId)) return json({ error: 'This post belongs to a private community.' }, { status: 403 });
	await db.insert(bookmarks).values({ userId: actor.id, postId });
	await recordInteraction({ userId: actor.id, targetId: postId, actionType: 'bookmark' });
	return json({ ok: true, bookmarked: true });
};
