import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { comments, notifications, posts, userInteractions } from '$lib/server/db/schema.js';
import { canAccessCommunity, getActor, getCommunityBan } from '$lib/server/social.js';


function isAllowedGifHost(host: string) {
  return host === 'i.giphy.com' || host === 'media.giphy.com' || /^media\d+\.giphy\.com$/.test(host) || host === 'media.tenor.com' || host === 'c.tenor.com';
}

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to reply.' }, { status: 401 });
	if (actor.isBanned) return json({ error: 'This account is suspended.' }, { status: 403 });
	const payload = await event.request.json().catch(() => null);
	const content = String(payload?.content ?? '').trim();
	const gifUrl = String(payload?.gifUrl ?? '').trim();
	const postId = event.params.id;
	const parentId = String(payload?.parentId ?? '').trim() || null;
	if ((!content && !gifUrl) || content.length > 5000) return json({ error: 'Write a reply or attach a GIF. Replies may contain up to 5,000 characters.' }, { status: 400 });
	if (gifUrl) {
		try {
			const parsed = new URL(gifUrl);
			const allowedHosts = new Set(['media.giphy.com', 'i.giphy.com', 'media.tenor.com', 'c.tenor.com']);
			if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !isAllowedGifHost(parsed.hostname.toLowerCase()) || !/\.gif$/i.test(parsed.pathname)) throw new Error('invalid gif url');
		} catch { return json({ error: 'Choose a direct GIF URL from GIPHY or Tenor (https://media.giphy.com/...gif or https://media.tenor.com/...gif).' }, { status: 400 }); }
	}
	const [post] = await db.select({ id: posts.id, authorId: posts.authorId, communityId: posts.communityId, isRemoved: posts.isRemoved, isLocked: posts.isLocked }).from(posts).where(eq(posts.id, postId)).limit(1);
	if (!post || post.isRemoved) return json({ error: 'Post not found.' }, { status: 404 });
	if (post.communityId && !await canAccessCommunity({ id: actor.id, isOwner: actor.isOwner, isAdmin: actor.isAdmin }, post.communityId)) return json({ error: 'This post belongs to a private community.' }, { status: 403 });
	if (post.communityId) { const ban = await getCommunityBan(actor.id, post.communityId); if (ban) return json({ error: ban.reason || 'You are banned from this community.' }, { status: 403 }); }
	if (post.isLocked) return json({ error: 'This discussion has been locked by a moderator.' }, { status: 423 });

	const id = crypto.randomUUID();
	let path = id;
	if (parentId) {
		const [parent] = await db.select({ id: comments.id, path: comments.path }).from(comments).where(and(eq(comments.id, parentId), eq(comments.postId, postId), eq(comments.isRemoved, false))).limit(1);
		if (!parent) return json({ error: 'The reply you are responding to no longer exists.' }, { status: 404 });
		path = `${parent.path}.${id}`;
	}
	// Keep the reply, aggregate counter, ranking signal, and notification atomic.
	await db.transaction(async (tx) => {
		await tx.insert(comments).values({ id, postId, authorId: actor.id, parentId, content, gifUrl: gifUrl || null, path, createdAt: new Date(), updatedAt: new Date() });
		await tx.update(posts).set({ commentCount: sql`${posts.commentCount} + 1`, updatedAt: new Date() }).where(eq(posts.id, postId));
		await tx.insert(userInteractions).values({ id: crypto.randomUUID(), userId: actor.id, targetId: postId, targetType: 'post', actionType: 'reply', value: 1 });
		if (post.authorId !== actor.id) {
			await tx.insert(notifications).values({
				id: crypto.randomUUID(), userId: post.authorId, type: 'reply',
				message: `${actor.displayName || actor.username || 'Someone'} replied to your post.`,
				url: `/post/${postId}`, isRead: false
			});
		}
	});
	return json({ ok: true, id, gifUrl: gifUrl || null }, { status: 201 });
};
