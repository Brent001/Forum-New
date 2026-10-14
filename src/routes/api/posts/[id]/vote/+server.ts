import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { karmaEvents, posts, users, votes } from '$lib/server/db/schema.js';
import { canAccessCommunity, getActor, getCommunityBan, recordInteraction } from '$lib/server/social.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to vote.' }, { status: 401 });
	if (actor.isBanned) return json({ error: 'This account is suspended.' }, { status: 403 });
	const payload = await event.request.json().catch(() => null);
	const value = Number(payload?.value);
	if (![ -1, 0, 1 ].includes(value)) return json({ error: 'Vote value must be -1, 0, or 1.' }, { status: 400 });
	const postId = event.params.id;
	const [post] = await db.select({ id: posts.id, authorId: posts.authorId, communityId: posts.communityId, isRemoved: posts.isRemoved }).from(posts).where(eq(posts.id, postId)).limit(1);
	if (!post || post.isRemoved) return json({ error: 'Post not found.' }, { status: 404 });
	if (post.authorId === actor.id && value !== 0) return json({ error: 'You cannot vote on your own post.' }, { status: 403 });
	if (post.communityId && !await canAccessCommunity({ id: actor.id, isOwner: actor.isOwner, isAdmin: actor.isAdmin }, post.communityId)) return json({ error: 'This post belongs to a private community.' }, { status: 403 });
	if (post.communityId && await getCommunityBan(actor.id, post.communityId)) return json({ error: 'You are banned from this community and cannot vote here.' }, { status: 403 });

	let result = { value, upvotes: 0, downvotes: 0, score: 0 };
	await db.transaction(async (tx) => {
		const whereVote = and(eq(votes.userId, actor.id), eq(votes.targetId, postId), eq(votes.targetType, 'post'));
		const [existing] = await tx.select({ value: votes.value }).from(votes).where(whereVote).limit(1);
		const previousValue = existing?.value ?? 0;
		if (value === 0) await tx.delete(votes).where(whereVote);
		else await tx.insert(votes).values({ userId: actor.id, targetId: postId, targetType: 'post', value, createdAt: new Date() })
			.onConflictDoUpdate({ target: [votes.userId, votes.targetId, votes.targetType], set: { value, createdAt: new Date() } });

		const voteRows = await tx.select({ value: votes.value }).from(votes).where(and(eq(votes.targetId, postId), eq(votes.targetType, 'post')));
		const upvotes = voteRows.filter((vote) => vote.value === 1).length;
		const downvotes = voteRows.filter((vote) => vote.value === -1).length;
		const score = upvotes - downvotes;
		await tx.update(posts).set({ upvoteCount: upvotes, downvoteCount: downvotes, score }).where(eq(posts.id, postId));

		if (previousValue !== value) {
			const karmaDelta = post.authorId === actor.id ? 0 : value - previousValue;
			await tx.insert(karmaEvents).values({ id: crypto.randomUUID(), actorId: actor.id, recipientId: post.authorId, targetId: postId, targetType: 'post', previousValue, newValue: value, delta: karmaDelta, reason: post.authorId === actor.id ? 'self-vote-no-reputation' : 'vote-change' });
			if (karmaDelta !== 0) await tx.update(users).set({ karma: sql`${users.karma} + ${karmaDelta}`, postKarma: sql`${users.postKarma} + ${karmaDelta}` }).where(eq(users.id, post.authorId));
		}
		result = { value, upvotes, downvotes, score };
	});
	if (value === 1) await recordInteraction({ userId: actor.id, targetId: postId, actionType: 'like' });
	if (value === -1) await recordInteraction({ userId: actor.id, targetId: postId, actionType: 'dislike', value: -1 });
	return json({ ok: true, ...result });
};
