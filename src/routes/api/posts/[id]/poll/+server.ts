import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { pollVotes, posts } from '$lib/server/db/schema.js';
import { canAccessCommunity, getActor, getCommunityBan, recordInteraction } from '$lib/server/social.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to vote in polls.' }, { status: 401 });
	if (actor.isBanned) return json({ error: 'This account is suspended.' }, { status: 403 });
	const payload = await event.request.json().catch(() => null);
	const optionId = String(payload?.optionId ?? '');
	const postId = event.params.id;
	const [post] = await db.select({ id: posts.id, communityId: posts.communityId, poll: posts.poll, isRemoved: posts.isRemoved }).from(posts).where(eq(posts.id, postId)).limit(1);
	if (!post || post.isRemoved || !post.poll) return json({ error: 'Poll not found.' }, { status: 404 });
	if (post.communityId && !await canAccessCommunity({ id: actor.id, isOwner: actor.isOwner, isAdmin: actor.isAdmin }, post.communityId)) return json({ error: 'This post belongs to a private community.' }, { status: 403 });
	if (post.communityId && await getCommunityBan(actor.id, post.communityId)) return json({ error: 'You are banned from this community and cannot vote here.' }, { status: 403 });
	if (!post.poll.options.some((option) => option.id === optionId)) return json({ error: 'That poll option does not exist.' }, { status: 400 });
	if (post.poll.endsAt && new Date(post.poll.endsAt).getTime() < Date.now()) return json({ error: 'This poll has ended.' }, { status: 410 });
	await db.insert(pollVotes).values({ userId: actor.id, postId, optionId }).onConflictDoUpdate({
		target: [pollVotes.userId, pollVotes.postId], set: { optionId, createdAt: new Date() }
	});
	const allVotes = await db.select({ optionId: pollVotes.optionId }).from(pollVotes).where(eq(pollVotes.postId, postId));
	const updatedPoll = {
		...post.poll,
		options: post.poll.options.map((option) => ({ ...option, votes: allVotes.filter((vote) => vote.optionId === option.id).length }))
	};
	await db.update(posts).set({ poll: updatedPoll }).where(eq(posts.id, postId));
	await recordInteraction({ userId: actor.id, targetId: postId, actionType: 'poll-vote' });
	return json({ ok: true, poll: updatedPoll, totalVotes: allVotes.length });
};
