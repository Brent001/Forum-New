import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { posts, reports } from '$lib/server/db/schema.js';
import { canAccessCommunity, getActor, recordInteraction } from '$lib/server/social.js';

const reasons = new Set(['spam', 'harassment', 'hate', 'misinformation', 'illegal', 'sexual-content', 'self-harm', 'other']);

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to report content.' }, { status: 401 });
	const body = await event.request.json().catch(() => null);
	const reason = String(body?.reason ?? 'other');
	const details = String(body?.details ?? '').trim().slice(0, 1200) || null;
	const postId = event.params.id;
	if (!reasons.has(reason)) return json({ error: 'Choose a valid report reason.' }, { status: 400 });
	const [post] = await db.select({ id: posts.id, communityId: posts.communityId }).from(posts).where(eq(posts.id, postId)).limit(1);
	if (!post) return json({ error: 'Post not found.' }, { status: 404 });
	if (post.communityId && !await canAccessCommunity({ id: actor.id, isOwner: actor.isOwner, isAdmin: actor.isAdmin }, post.communityId)) return json({ error: 'This post belongs to a private community.' }, { status: 403 });
	const [duplicate] = await db.select({ id: reports.id }).from(reports)
		.where(and(eq(reports.targetType, 'post'), eq(reports.targetId, postId), eq(reports.reporterId, actor.id), eq(reports.status, 'open'))).limit(1);
	if (duplicate) return json({ ok: true, alreadyReported: true });
	await db.insert(reports).values({ id: crypto.randomUUID(), targetType: 'post', targetId: postId, reporterId: actor.id, reason, details });
	await recordInteraction({ userId: actor.id, targetId: postId, actionType: 'report', value: -1 });
	return json({ ok: true }, { status: 201 });
};
