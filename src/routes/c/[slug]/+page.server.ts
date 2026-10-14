import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { bookmarks, communityBans, communities, communityEmotes, communityMemberships, communityModerators, follows, posts, users, votes } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const load: PageServerLoad = async (event) => {
  if (!db) throw error(503, 'Database is not configured.');
  const [actor, communityRows] = await Promise.all([
    getActor(event),
    db.select().from(communities).where(eq(communities.slug, event.params.slug)).limit(1)
  ]);
  const community = communityRows[0];
  if (!community) throw error(404, 'Community not found.');
  const membershipPromise = actor
    ? db.select().from(communityMemberships).where(and(eq(communityMemberships.userId, actor.id), eq(communityMemberships.communityId, community.id))).limit(1)
    : Promise.resolve([]);
  const moderatorAccessPromise = actor
    ? db.select({ userId: communityModerators.userId }).from(communityModerators).where(and(eq(communityModerators.userId, actor.id), eq(communityModerators.communityId, community.id))).limit(1)
    : Promise.resolve([]);
  const [membershipRows, moderatorAccessRows] = await Promise.all([membershipPromise, moderatorAccessPromise]);
  const membership = membershipRows[0];
  const accessModerator = moderatorAccessRows[0];
  if (community.isPrivate && !membership && !accessModerator && !actor?.isOwner && !actor?.isAdmin && community.createdBy !== actor?.id) throw error(403, 'This community is private.');
  const rows = await db.select({
    id: posts.id, title: posts.title, body: posts.body, url: posts.url, createdAt: posts.createdAt,
    authorId: users.id, author: users.username, authorName: users.displayName, authorAvatar: users.avatarUrl, authorVerified: users.isVerified, authorKarma: users.karma,
    communityId: communities.id, community: communities.slug, communityName: communities.name,
    score: posts.score, upvotes: posts.upvoteCount, downvotes: posts.downvoteCount, commentsCount: posts.commentCount,
    views: posts.viewCount, shares: posts.shareCount, isPinned: posts.isStickied, isLocked: posts.isLocked,
    postType: posts.postType, flair: posts.flair, poll: posts.poll, isNsfw: posts.isNsfw, media: posts.media
  }).from(posts).leftJoin(users, eq(posts.authorId, users.id)).leftJoin(communities, eq(posts.communityId, communities.id))
    .where(and(eq(posts.communityId, community.id), eq(posts.isRemoved, false))).orderBy(desc(posts.isStickied), desc(posts.createdAt)).limit(60);

  const feedPostIds = rows.map((row) => row.id);
  const feedAuthorIds = [...new Set(rows.map((row) => row.authorId).filter((id): id is string => Boolean(id)))];
  const [emoteRows, moderatorRows, myVotes, saved, followsRows, banRows] = await Promise.all([
    db.select({ id: communityEmotes.id, code: communityEmotes.code, imageAssetId: communityEmotes.imageAssetId, imageUrl: communityEmotes.imageUrl, isAnimated: communityEmotes.isAnimated, createdAt: communityEmotes.createdAt })
      .from(communityEmotes).where(eq(communityEmotes.communityId, community.id)).orderBy(communityEmotes.code).limit(250),
    db.select({ userId: communityModerators.userId, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl, createdAt: communityModerators.createdAt, role: communityModerators.role })
      .from(communityModerators).leftJoin(users, eq(users.id, communityModerators.userId)).where(eq(communityModerators.communityId, community.id)).orderBy(desc(communityModerators.createdAt)).limit(100),
    actor && feedPostIds.length ? db.select({ targetId: votes.targetId, value: votes.value }).from(votes).where(and(eq(votes.userId, actor.id), eq(votes.targetType, 'post'), inArray(votes.targetId, feedPostIds))) : Promise.resolve([]),
    actor && feedPostIds.length ? db.select({ postId: bookmarks.postId }).from(bookmarks).where(and(eq(bookmarks.userId, actor.id), inArray(bookmarks.postId, feedPostIds))) : Promise.resolve([]),
    actor && feedAuthorIds.length ? db.select({ followingId: follows.followingId }).from(follows).where(and(eq(follows.followerId, actor.id), inArray(follows.followingId, feedAuthorIds))) : Promise.resolve([]),
    actor ? db.select({ userId: communityBans.userId, username: users.username, displayName: users.displayName, reason: communityBans.reason, expiresAt: communityBans.expiresAt, createdAt: communityBans.createdAt })
      .from(communityBans).leftJoin(users, eq(users.id, communityBans.userId)).where(eq(communityBans.communityId, community.id)).orderBy(desc(communityBans.createdAt)).limit(100) : Promise.resolve([])
  ]);
  const votesMap = new Map(myVotes.map((vote) => [vote.targetId, vote.value]));
  const savedSet = new Set(saved.map((bookmark) => bookmark.postId));
  const followSet = new Set(followsRows.map((follow) => follow.followingId));
  const isCreator = Boolean(actor && community.createdBy === actor.id);
  const isGlobalManager = Boolean(actor && (actor.isOwner || actor.isAdmin));
  const isModerator = Boolean(actor && moderatorRows.some((row) => row.userId === actor.id));
  const canManageEmotes = Boolean(actor && (isCreator || isGlobalManager || isModerator));
  const canManageModerators = Boolean(actor && (isCreator || isGlobalManager));
  const canModerateContent = Boolean(actor && (isCreator || isGlobalManager || isModerator));
  const canBanMembers = canModerateContent;
  const removedRows = canModerateContent
    ? await db.select({ id: posts.id, title: posts.title, body: posts.body, removedReason: posts.removedReason, createdAt: posts.createdAt, updatedAt: posts.updatedAt, authorId: users.id, author: users.username, authorName: users.displayName })
        .from(posts).leftJoin(users, eq(users.id, posts.authorId))
        .where(and(eq(posts.communityId, community.id), eq(posts.isRemoved, true))).orderBy(desc(posts.updatedAt)).limit(100)
    : [];
  const { createdBy: _createdBy, ...publicCommunity } = community;

  return {
    community: { ...publicCommunity, isJoined: Boolean(membership) },
    emotes: emoteRows.map((emote) => ({ ...emote, imageUrl: emote.imageUrl ?? (emote.imageAssetId ? `/api/media/${emote.imageAssetId}` : '') })),
    canManageEmotes, canManageModerators, canModerateContent, canBanMembers, canManageProfile: canModerateContent,
    removedPosts: removedRows.map((row) => ({ id: row.id, title: row.title, body: row.body ?? '', reason: row.removedReason ?? 'Removed by a moderator.', createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(), authorId: row.authorId ?? '', author: row.author ?? 'unknown', authorName: row.authorName ?? row.author ?? 'Community member' })),
    moderators: canManageModerators ? moderatorRows : [],
    bans: canBanMembers ? banRows.filter((ban) => !ban.expiresAt || new Date(ban.expiresAt).getTime() > Date.now()) : [],
    posts: rows.map((row) => ({
      id: row.id, title: row.title, body: row.body ?? '', url: row.url ?? null,
      authorId: row.authorId ?? '', author: row.author ?? 'anonymous', authorName: row.authorName ?? row.author ?? 'Community member', authorAvatar: row.authorAvatar ?? null, authorVerified: Boolean(row.authorVerified), authorKarma: Number(row.authorKarma ?? 0),
      communityId: row.communityId ?? community.id, community: row.community ?? community.slug, communityName: row.communityName ?? community.name,
      score: Number(row.score ?? 0), upvotes: Number(row.upvotes ?? 0), downvotes: Number(row.downvotes ?? 0), comments: Number(row.commentsCount ?? 0), views: Number(row.views ?? 0), shares: Number(row.shares ?? 0),
      bookmarkCount: 0, time: new Date(row.createdAt).toISOString(), isPinned: Boolean(row.isPinned), isLocked: Boolean(row.isLocked), postType: row.postType ?? 'discussion', flair: row.flair ?? null, poll: row.poll ?? null, isNsfw: Boolean(row.isNsfw), media: Array.isArray(row.media) ? row.media : [],
      userVote: votesMap.get(row.id) ?? 0, isBookmarked: savedSet.has(row.id), isFollowedAuthor: followSet.has(row.authorId ?? ''), isJoinedCommunity: Boolean(membership)
    })),
    viewer: actor ? { id: actor.id, username: actor.username ?? actor.id, name: actor.displayName ?? actor.username ?? 'Member', isOwner: actor.isOwner, isAdmin: actor.isAdmin } : null
  };
};
