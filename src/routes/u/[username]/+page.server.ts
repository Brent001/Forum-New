import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { bookmarks, comments, communities, follows, posts, userBlocks, userMutes, users, votes } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const load: PageServerLoad = async (event) => {
	if (!db) throw error(503, 'Database is not configured.');
	const actor = await getActor(event);
	const username = decodeURIComponent(event.params.username);
	const [profile] = await db.select({
		id: users.id, username: users.username, displayName: users.displayName, bio: users.bio, avatarUrl: users.avatarUrl, bannerUrl: users.bannerUrl,
		createdAt: users.createdAt, role: users.role, isVerified: users.isVerified, karma: users.karma, postKarma: users.postKarma, commentKarma: users.commentKarma, isBanned: users.isBanned, isShadowBanned: users.isShadowBanned, profileVisibility: users.profileVisibility, isOwner: users.isOwner
	}).from(users).where(eq(users.username, username)).limit(1);
	if (!profile || profile.isBanned || (profile.profileVisibility === 'private' && actor?.id !== profile.id && !actor?.isOwner)) throw error(404, 'This profile could not be found.');
	if (profile.isShadowBanned && actor?.id !== profile.id && !actor?.isOwner) throw error(404, 'This profile could not be found.');
	const [followerCount, followingCount, postCount, commentCount, followRow, blockRow, muteRow] = await Promise.all([
		db.select({ count: sql<number>`count(*)` }).from(follows).where(eq(follows.followingId, profile.id)),
		db.select({ count: sql<number>`count(*)` }).from(follows).where(eq(follows.followerId, profile.id)),
		db.select({ count: sql<number>`count(*)` }).from(posts).where(and(eq(posts.authorId, profile.id), eq(posts.isRemoved, false))),
		db.select({ count: sql<number>`count(*)` }).from(comments).where(and(eq(comments.authorId, profile.id), eq(comments.isRemoved, false))),
		actor && actor.id !== profile.id ? db.select().from(follows).where(and(eq(follows.followerId, actor.id), eq(follows.followingId, profile.id))).limit(1) : Promise.resolve([]),
		actor && actor.id !== profile.id ? db.select().from(userBlocks).where(and(eq(userBlocks.blockerId, actor.id), eq(userBlocks.blockedId, profile.id))).limit(1) : Promise.resolve([]),
		actor && actor.id !== profile.id ? db.select().from(userMutes).where(and(eq(userMutes.muterId, actor.id), eq(userMutes.mutedId, profile.id))).limit(1) : Promise.resolve([])
	]);
	const postRows = await db.select({
		id: posts.id, title: posts.title, body: posts.body, url: posts.url, media: posts.media, createdAt: posts.createdAt,
		authorId: users.id, author: users.username, authorName: users.displayName, authorAvatar: users.avatarUrl, authorVerified: users.isVerified, authorKarma: users.karma,
		communityId: communities.id, community: communities.slug, communityName: communities.name,
		score: posts.score, upvotes: posts.upvoteCount, downvotes: posts.downvoteCount, commentsCount: posts.commentCount, views: posts.viewCount, shares: posts.shareCount,
		isPinned: posts.isStickied, isLocked: posts.isLocked, postType: posts.postType, flair: posts.flair, poll: posts.poll, isNsfw: posts.isNsfw
	}).from(posts).leftJoin(users, eq(posts.authorId, users.id)).leftJoin(communities, eq(posts.communityId, communities.id))
		.where(and(eq(posts.authorId, profile.id), eq(posts.isRemoved, false), or(eq(communities.isPrivate, false), isNull(communities.isPrivate)))).orderBy(desc(posts.createdAt)).limit(60);
	const [myVotes, savedPosts] = actor ? await Promise.all([
		db.select({ targetId: votes.targetId, value: votes.value }).from(votes).where(and(eq(votes.userId, actor.id), eq(votes.targetType, 'post'))),
		db.select({ postId: bookmarks.postId }).from(bookmarks).where(eq(bookmarks.userId, actor.id))
	]) : [[], []];
	const voteMap = new Map(myVotes.map((item) => [item.targetId, item.value])); const savedSet = new Set(savedPosts.map((item) => item.postId));
	return {
		profile: { ...profile, name: profile.displayName ?? profile.username ?? 'Member', followers: Number(followerCount[0]?.count ?? 0), following: Number(followingCount[0]?.count ?? 0), postCount: Number(postCount[0]?.count ?? 0), commentCount: Number(commentCount[0]?.count ?? 0), isFollowing: followRow.length > 0, isBlocked: blockRow.length > 0, isMuted: muteRow.length > 0 },
		posts: postRows.map((row) => ({
			id: row.id, title: row.title, body: row.body ?? '', url: row.url ?? null, media: Array.isArray(row.media) ? row.media as Array<{ id: string; kind: string }> : [],
			authorId: row.authorId ?? '', author: row.author ?? 'anonymous', authorName: row.authorName ?? row.author ?? 'Community member', authorAvatar: row.authorAvatar ?? null, authorVerified: Boolean(row.authorVerified), authorKarma: Number(row.authorKarma ?? 0),
			communityId: row.communityId ?? null, community: row.community ?? 'general', communityName: row.communityName ?? 'General', score: Number(row.score ?? 0), upvotes: Number(row.upvotes ?? 0), downvotes: Number(row.downvotes ?? 0), comments: Number(row.commentsCount ?? 0), views: Number(row.views ?? 0), shares: Number(row.shares ?? 0), bookmarkCount: 0,
			time: new Date(row.createdAt).toISOString(), isPinned: Boolean(row.isPinned), isLocked: Boolean(row.isLocked), postType: row.postType ?? 'discussion', flair: row.flair ?? null, poll: row.poll ?? null, isNsfw: Boolean(row.isNsfw), userVote: voteMap.get(row.id) ?? 0, isBookmarked: savedSet.has(row.id), isFollowedAuthor: false, isJoinedCommunity: false
		})),
		viewer: actor ? { id: actor.id, username: actor.username ?? actor.id, name: actor.displayName ?? actor.username ?? 'Member', isOwner: actor.isOwner } : null
	};
};
