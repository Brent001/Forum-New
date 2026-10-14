import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { comments, karmaEvents, posts, users, votes } from '$lib/server/db/schema.js';
import { canAccessCommunity, getActor, getCommunityBan } from '$lib/server/social.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to vote.' }, { status: 401 });
	if (actor.isBanned) return json({ error: 'This account is suspended.' }, { status: 403 });
	const payload = await event.request.json().catch(() => null);
	const value = Number(payload?.value);
	if (![ -1, 0, 1 ].includes(value)) return json({ error: 'Vote value must be -1, 0, or 1.' }, { status: 400 });
	const commentId = event.params.id;
	const [comment] = await db.select({ id: comments.id, authorId: comments.authorId, postId: comments.postId, score: comments.score, isRemoved: comments.isRemoved, communityId: posts.communityId, postRemoved: posts.isRemoved })
		.from(comments).innerJoin(posts, eq(comments.postId, posts.id)).where(eq(comments.id, commentId)).limit(1);
	if (!comment || comment.isRemoved || comment.postRemoved) return json({ error: 'Reply not found.' }, { status: 404 });
	if (comment.authorId === actor.id && value !== 0) return json({ error: 'You cannot vote on your own reply.' }, { status: 403 });
	if (comment.communityId && !await canAccessCommunity({ id: actor.id, isOwner: actor.isOwner, isAdmin: actor.isAdmin }, comment.communityId)) return json({ error: 'This reply belongs to a private community.' }, { status: 403 });
	if (comment.communityId && await getCommunityBan(actor.id, comment.communityId)) return json({ error: 'You are banned from this community and cannot vote here.' }, { status: 403 });

	let result = { value, score: 0 };
	await db.transaction(async (tx) => {
		const whereVote = and(eq(votes.userId, actor.id), eq(votes.targetId, commentId), eq(votes.targetType, 'comment'));
		const [existing] = await tx.select({ value: votes.value }).from(votes).where(whereVote).limit(1);
		const previousValue = existing?.value ?? 0;
		if (value === 0) await tx.delete(votes).where(whereVote);
		else await tx.insert(votes).values({ userId: actor.id, targetId: commentId, targetType: 'comment', value, createdAt: new Date() })
			.onConflictDoUpdate({ target: [votes.userId, votes.targetId, votes.targetType], set: { value, createdAt: new Date() } });
		const voteRows = await tx.select({ value: votes.value }).from(votes).where(and(eq(votes.targetId, commentId), eq(votes.targetType, 'comment')));
		const score = voteRows.reduce((sum, row) => sum + row.value, 0);
		await tx.update(comments).set({ score }).where(eq(comments.id, commentId));
		if (previousValue !== value) {
			const karmaDelta = comment.authorId === actor.id ? 0 : value - previousValue;
			await tx.insert(karmaEvents).values({ id: crypto.randomUUID(), actorId: actor.id, recipientId: comment.authorId, targetId: commentId, targetType: 'comment', previousValue, newValue: value, delta: karmaDelta, reason: comment.authorId === actor.id ? 'self-vote-no-reputation' : 'vote-change' });
			if (karmaDelta !== 0) await tx.update(users).set({ karma: sql`${users.karma} + ${karmaDelta}`, commentKarma: sql`${users.commentKarma} + ${karmaDelta}` }).where(eq(users.id, comment.authorId));
		}
		result = { value, score };
	});
	return json({ ok: true, ...result });
};
