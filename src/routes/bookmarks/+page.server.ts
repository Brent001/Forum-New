import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { bookmarks, communities, posts, users, votes } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const load: PageServerLoad = async (event) => {
	if (!db) return { posts: [], viewer: null };
	const actor = await getActor(event);
	if (!actor) throw redirect(302, '/login?callbackURL=%2Fbookmarks');
	const rows = await db.select({
		id: posts.id, title: posts.title, body: posts.body, url: posts.url, createdAt: posts.createdAt,
		authorId: users.id, author: users.username, authorName: users.displayName, authorAvatar: users.avatarUrl, authorVerified: users.isVerified, authorKarma: users.karma,
		communityId: communities.id, community: communities.slug, communityName: communities.name,
		score: posts.score, upvotes: posts.upvoteCount, downvotes: posts.downvoteCount, commentsCount: posts.commentCount, views: posts.viewCount, shares: posts.shareCount,
		isPinned: posts.isStickied, isLocked: posts.isLocked, postType: posts.postType, flair: posts.flair, poll: posts.poll, isNsfw: posts.isNsfw, isRemoved: posts.isRemoved,
		bookmarkedAt: bookmarks.createdAt
	}).from(bookmarks).innerJoin(posts, eq(bookmarks.postId, posts.id)).leftJoin(users, eq(posts.authorId, users.id)).leftJoin(communities, eq(posts.communityId, communities.id))
		.where(and(eq(bookmarks.userId, actor.id), eq(posts.isRemoved, false), or(eq(communities.isPrivate, false), isNull(communities.isPrivate)))).orderBy(desc(bookmarks.createdAt)).limit(100);
	const myVotes = await db.select({ targetId: votes.targetId, value: votes.value }).from(votes).where(and(eq(votes.userId, actor.id), eq(votes.targetType, 'post')));
	const voteMap = new Map(myVotes.map((item) => [item.targetId, item.value]));
	return { posts: rows.map((row) => ({
		id: row.id, title: row.title, body: row.body ?? '', url: row.url ?? null,
		authorId: row.authorId ?? '', author: row.author ?? 'anonymous', authorName: row.authorName ?? row.author ?? 'Community member', authorAvatar: row.authorAvatar ?? null, authorVerified: Boolean(row.authorVerified), authorKarma: Number(row.authorKarma ?? 0),
		communityId: row.communityId ?? null, community: row.community ?? 'general', communityName: row.communityName ?? 'General',
		score: Number(row.score ?? 0), upvotes: Number(row.upvotes ?? 0), downvotes: Number(row.downvotes ?? 0), comments: Number(row.commentsCount ?? 0), views: Number(row.views ?? 0), shares: Number(row.shares ?? 0), bookmarkCount: 0,
		time: new Date(row.createdAt).toISOString(), isPinned: Boolean(row.isPinned), isLocked: Boolean(row.isLocked), postType: row.postType ?? 'discussion', flair: row.flair ?? null, poll: row.poll ?? null, isNsfw: Boolean(row.isNsfw), userVote: voteMap.get(row.id) ?? 0, isBookmarked: true, isFollowedAuthor: false, isJoinedCommunity: false
	})), viewer: { id: actor.id, username: actor.username ?? actor.id, name: actor.displayName ?? actor.username ?? 'Member' } };
};
