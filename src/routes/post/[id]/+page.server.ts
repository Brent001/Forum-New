import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { bookmarks, comments, communities, communityEmotes, posts, users, votes } from '$lib/server/db/schema.js';
import { canAccessPost, getActor, recordInteraction } from '$lib/server/social.js';

export const load: PageServerLoad = async (event) => {
	if (!db) throw error(503, 'Database is not configured.');
	const actor = await getActor(event);
	const [row] = await db.select({
		id: posts.id, title: posts.title, body: posts.body, url: posts.url, media: posts.media, createdAt: posts.createdAt,
		authorId: users.id, author: users.username, authorName: users.displayName, authorAvatar: users.avatarUrl, authorVerified: users.isVerified, authorKarma: users.karma,
		communityId: communities.id, community: communities.slug, communityName: communities.name,
		score: posts.score, upvotes: posts.upvoteCount, downvotes: posts.downvoteCount, commentsCount: posts.commentCount,
		views: posts.viewCount, shares: posts.shareCount, isPinned: posts.isStickied, isLocked: posts.isLocked,
		postType: posts.postType, flair: posts.flair, poll: posts.poll, isNsfw: posts.isNsfw, isRemoved: posts.isRemoved
	}).from(posts).leftJoin(users, eq(posts.authorId, users.id)).leftJoin(communities, eq(posts.communityId, communities.id)).where(eq(posts.id, event.params.id)).limit(1);
	if (!row || row.isRemoved) throw error(404, 'This post is unavailable.');
	if (!await canAccessPost(actor ? { id: actor.id, isOwner: actor.isOwner, isAdmin: actor.isAdmin } : null, row.id)) throw error(403, 'This post belongs to a private community.');
	await db.update(posts).set({ viewCount: sql`${posts.viewCount} + 1` }).where(eq(posts.id, row.id));
	if (actor) await recordInteraction({ userId: actor.id, targetId: row.id, actionType: 'click' });

	const [voteRow, bookmarkRow, commentsRows] = actor
		? await Promise.all([
			db.select({ value: votes.value }).from(votes).where(and(eq(votes.userId, actor.id), eq(votes.targetId, row.id), eq(votes.targetType, 'post'))).limit(1),
			db.select({ postId: bookmarks.postId }).from(bookmarks).where(and(eq(bookmarks.userId, actor.id), eq(bookmarks.postId, row.id))).limit(1),
			db.select({ id: comments.id, content: comments.content, gifUrl: comments.gifUrl, parentId: comments.parentId, path: comments.path, createdAt: comments.createdAt, score: comments.score, isPinned: comments.isPinned, authorId: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl, isVerified: users.isVerified, authorKarma: users.karma, isRemoved: comments.isRemoved })
				.from(comments).leftJoin(users, eq(comments.authorId, users.id)).where(and(eq(comments.postId, row.id), eq(comments.isRemoved, false))).orderBy(desc(comments.isPinned), asc(comments.createdAt)).limit(500)
		])
		: [[], [], await db.select({ id: comments.id, content: comments.content, gifUrl: comments.gifUrl, parentId: comments.parentId, path: comments.path, createdAt: comments.createdAt, score: comments.score, isPinned: comments.isPinned, authorId: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl, isVerified: users.isVerified, authorKarma: users.karma, isRemoved: comments.isRemoved })
			.from(comments).leftJoin(users, eq(comments.authorId, users.id)).where(and(eq(comments.postId, row.id), eq(comments.isRemoved, false))).orderBy(desc(comments.isPinned), asc(comments.createdAt)).limit(500)];

	const commentVoteRows = actor && commentsRows.length
		? await db.select({ targetId: votes.targetId, value: votes.value }).from(votes).where(and(eq(votes.userId, actor.id), eq(votes.targetType, 'comment'), inArray(votes.targetId, commentsRows.map((comment) => comment.id))))
		: [];
	const commentVoteMap = new Map(commentVoteRows.map((item) => [item.targetId, item.value]));

	const emoteRows = row.communityId
		? await db.select({ id: communityEmotes.id, code: communityEmotes.code, imageUrl: communityEmotes.imageUrl, imageAssetId: communityEmotes.imageAssetId, isAnimated: communityEmotes.isAnimated })
			.from(communityEmotes).where(eq(communityEmotes.communityId, row.communityId)).orderBy(communityEmotes.code).limit(250)
		: [];
	const emotes = emoteRows.map((emote) => ({ ...emote, imageUrl: emote.imageUrl || (emote.imageAssetId ? `/api/media/${emote.imageAssetId}` : '') }));

	const post = {
		id: row.id, title: row.title, body: row.body ?? '', url: row.url ?? null, media: Array.isArray(row.media) ? row.media as Array<{ id: string; kind: string }> : [],
		authorId: row.authorId ?? '', author: row.author ?? 'anonymous', authorName: row.authorName ?? row.author ?? 'Community member', authorAvatar: row.authorAvatar ?? null, authorVerified: Boolean(row.authorVerified), authorKarma: Number(row.authorKarma ?? 0),
		communityId: row.communityId ?? null, community: row.community ?? 'general', communityName: row.communityName ?? 'General',
		score: Number(row.score ?? 0), upvotes: Number(row.upvotes ?? 0), downvotes: Number(row.downvotes ?? 0), comments: Number(row.commentsCount ?? 0), views: Number(row.views ?? 0), shares: Number(row.shares ?? 0),
		time: new Date(row.createdAt).toISOString(), isPinned: Boolean(row.isPinned), isLocked: Boolean(row.isLocked), postType: row.postType ?? 'discussion', flair: row.flair ?? null, poll: row.poll ?? null, isNsfw: Boolean(row.isNsfw), userVote: voteRow[0]?.value ?? 0, isBookmarked: bookmarkRow.length > 0, isFollowedAuthor: false, isJoinedCommunity: false
	};
	return {
		post,
		emotes,
		comments: commentsRows.map((comment) => ({
			...comment,
			username: comment.username ?? 'member',
			name: comment.displayName ?? comment.username ?? 'Community member',
			authorKarma: Number(comment.authorKarma ?? 0), userVote: commentVoteMap.get(comment.id) ?? 0,
			depth: Math.max(0, String(comment.path ?? '').split('.').length - 1)
		})),
		viewer: actor ? { id: actor.id, username: actor.username ?? actor.id, name: actor.displayName ?? actor.username ?? 'Member', isOwner: actor.isOwner } : null
	};
};
