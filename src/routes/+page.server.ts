import type { PageServerLoad } from './$types.js';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import {
	appSettings, bookmarks, communities, communityEmotes, communityMemberships, communityModerators, follows,
	posts, users, userBlocks, userMutes, userInteractions, votes, pollVotes
} from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';
import { forYouScore, hotScore, rankPost, trendingScore, type ForYouSignals, type SortMode } from '$lib/server/algorithm/ranking.js';

export const load: PageServerLoad = async (event) => {
	const { url } = event;
	if (!db) return { posts: [], communities: [], people: [], viewer: null, site: { name: 'Forum X', tagline: 'A place for ideas to find their people.' }, mode: 'for-you', query: '', databaseReady: false };

	const actorAndSettings = await Promise.all([
		getActor(event),
		db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1)
	]);
	const actor = actorAndSettings[0];
	const settings = actorAndSettings[1][0];
	const allowedModes = new Set(['for-you', 'following', 'latest', 'new', 'top', 'trending', 'rising', 'best', 'hot']);
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	const searchPattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
	const selectedMode = url.searchParams.get('feed') ?? actor?.preferredFeed ?? settings?.defaultSort ?? 'hot';
	const mode = allowedModes.has(selectedMode) ? selectedMode : 'hot';

	const postConditions = [eq(posts.isRemoved, false)];
	if (query.length > 1) postConditions.push(or(ilike(posts.title, searchPattern), ilike(posts.body, searchPattern)) as any);

	const rows = await db
		.select({
			id: posts.id,
			title: posts.title,
			body: posts.body,
			url: posts.url,
			media: posts.media,
			createdAt: posts.createdAt,
			authorId: users.id,
			author: users.username,
			authorName: users.displayName,
			authorAvatar: users.avatarUrl,
			authorVerified: users.isVerified,
			authorShadowBanned: users.isShadowBanned,
			authorKarma: users.karma,
			communityId: communities.id,
			community: communities.slug,
			communityName: communities.name,
			communityPrivate: communities.isPrivate,
			communityCreatorId: communities.createdBy,
			score: posts.score,
			upvotes: posts.upvoteCount,
			downvotes: posts.downvoteCount,
			comments: posts.commentCount,
			views: posts.viewCount,
			shares: posts.shareCount,
			isPinned: posts.isStickied,
			isLocked: posts.isLocked,
			postType: posts.postType,
			flair: posts.flair,
			poll: posts.poll,
			isNsfw: posts.isNsfw,
			hotScore: posts.hotScore,
			trendingScore: posts.trendingScore,
			qualityScore: posts.qualityScore
		})
		.from(posts)
		.leftJoin(users, eq(posts.authorId, users.id))
		.leftJoin(communities, eq(posts.communityId, communities.id))
		.where(and(...postConditions))
		.orderBy(desc(posts.createdAt))
		.limit(80);

	const communityIdsForEmotes = [...new Set(rows.map((row) => row.communityId).filter((id): id is string => Boolean(id)))];
	const feedPostIds = rows.map((row) => row.id);
	const feedAuthorIds = [...new Set(rows.map((row) => row.authorId).filter((id): id is string => Boolean(id)))];
	const viewerId = actor?.id;
	const emotePromise = communityIdsForEmotes.length
		? db.select({ id: communityEmotes.id, communityId: communityEmotes.communityId, code: communityEmotes.code, imageUrl: communityEmotes.imageUrl, isAnimated: communityEmotes.isAnimated })
			.from(communityEmotes).where(inArray(communityEmotes.communityId, communityIdsForEmotes)).limit(2000)
		: Promise.resolve([]);
	const viewerPromise = viewerId
		? Promise.all([
			feedAuthorIds.length ? db.select({ followingId: follows.followingId }).from(follows).where(and(eq(follows.followerId, viewerId), inArray(follows.followingId, feedAuthorIds))) : Promise.resolve([]),
			communityIdsForEmotes.length ? db.select({ communityId: communityMemberships.communityId }).from(communityMemberships).where(and(eq(communityMemberships.userId, viewerId), inArray(communityMemberships.communityId, communityIdsForEmotes))) : Promise.resolve([]),
			communityIdsForEmotes.length ? db.select({ communityId: communityModerators.communityId }).from(communityModerators).where(and(eq(communityModerators.userId, viewerId), inArray(communityModerators.communityId, communityIdsForEmotes))) : Promise.resolve([]),
			feedPostIds.length ? db.select({ postId: bookmarks.postId }).from(bookmarks).where(and(eq(bookmarks.userId, viewerId), inArray(bookmarks.postId, feedPostIds))) : Promise.resolve([]),
			feedPostIds.length ? db.select({ targetId: votes.targetId, value: votes.value }).from(votes).where(and(eq(votes.userId, viewerId), eq(votes.targetType, 'post'), inArray(votes.targetId, feedPostIds))) : Promise.resolve([]),
			db.select({ targetId: userInteractions.targetId, actionType: userInteractions.actionType, createdAt: userInteractions.createdAt })
				.from(userInteractions).where(eq(userInteractions.userId, viewerId)).orderBy(desc(userInteractions.createdAt)).limit(200),
			feedPostIds.length ? db.select({ postId: pollVotes.postId, optionId: pollVotes.optionId }).from(pollVotes).where(and(eq(pollVotes.userId, viewerId), inArray(pollVotes.postId, feedPostIds))) : Promise.resolve([])
			])
		: Promise.resolve([[], [], [], [], [], [], []] as const);
	const blockPromise = viewerId ? Promise.all([
		feedAuthorIds.length ? db.select({ blockedId: userBlocks.blockedId }).from(userBlocks).where(and(eq(userBlocks.blockerId, viewerId), inArray(userBlocks.blockedId, feedAuthorIds))) : Promise.resolve([]),
		feedAuthorIds.length ? db.select({ mutedId: userMutes.mutedId }).from(userMutes).where(and(eq(userMutes.muterId, viewerId), inArray(userMutes.mutedId, feedAuthorIds))) : Promise.resolve([])
	]) : Promise.resolve([[], []] as const);
	const [emoteRows, viewerRows, blockRows] = await Promise.all([emotePromise, viewerPromise, blockPromise]);
	const [followRows, membershipRows, moderatorRows, bookmarkRows, voteRows, interactionRows, pollVoteRows] = viewerRows;
	const emotesByCommunity = new Map<string, Array<{ id: string; code: string; imageUrl: string; isAnimated: boolean }>>();
	for (const emote of emoteRows) {
		const current = emotesByCommunity.get(emote.communityId) ?? [];
		if (current.length < 250) current.push({ id: emote.id, code: emote.code, imageUrl: emote.imageUrl, isAnimated: emote.isAnimated });
		emotesByCommunity.set(emote.communityId, current);
	}

	const followedAuthors = new Set(followRows.map((row) => row.followingId));
	const joinedCommunities = new Set(membershipRows.map((row) => row.communityId));
	const moderatedCommunities = new Set(moderatorRows.map((row) => row.communityId));
	const savedPosts = new Set(bookmarkRows.map((row) => row.postId));
	const myPollVotes = new Map(pollVoteRows.map((row) => [row.postId, row.optionId]));
	const myVotes = new Map(voteRows.map((row) => [row.targetId, row.value]));
	const interactedPosts = new Set(interactionRows.filter((row) => ['like', 'reply', 'bookmark', 'poll-vote', 'share', 'hide'].includes(row.actionType)).map((row) => row.targetId));
	const negativeFeedback = new Map<string, number>();
	for (const interaction of interactionRows) {
		if (['dislike', 'report', 'hide'].includes(interaction.actionType)) negativeFeedback.set(interaction.targetId, (negativeFeedback.get(interaction.targetId) ?? 0) + 1);
	}

	const blockedAuthors = new Set(blockRows[0].map((row) => row.blockedId));
	const mutedAuthors = new Set(blockRows[1].map((row) => row.mutedId));
	const mutedKeywords = (actor?.mutedKeywords ?? []).map((word) => word.toLowerCase()).filter(Boolean);
	const authorFeedCounts = new Map<string, number>();
	const formatted = rows.map((row) => {
		const authorId = row.authorId ?? '';
		const authorIndex = (authorFeedCounts.get(authorId) ?? 0) + 1;
		authorFeedCounts.set(authorId, authorIndex);
		const createdAt = row.createdAt ?? new Date();
		const ageHours = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 3_600_000);
		const signals: ForYouSignals = {
			upvotes: Number(row.upvotes ?? 0),
			downvotes: Number(row.downvotes ?? 0),
			viewCount: Number(row.views ?? 0),
			createdAt: new Date(createdAt),
			commentCount: Number(row.comments ?? 0),
			shareCount: Number(row.shares ?? 0),
			bookmarkCount: 0,
			authorFollowers: 0,
			authorKarma: Number(row.authorKarma ?? 0),
			isStickied: Boolean(row.isPinned),
			bodyLength: (row.body ?? '').length,
			isFollowedAuthor: followedAuthors.has(authorId),
			isFollowedCommunity: Boolean(row.communityId && joinedCommunities.has(row.communityId)),
			authorPostCountInFeed: authorIndex,
			authorIsNew: Number(row.authorKarma ?? 0) < 3,
			viewerAlreadyInteracted: interactedPosts.has(row.id),
			negativeFeedback: negativeFeedback.get(row.id) ?? 0,
			personalInterest: row.flair && query.toLowerCase().includes(row.flair.toLowerCase()) ? 0.2 : 0,
			ageHours
		};
		const xRank = forYouScore(signals);
		const hot = Number(row.hotScore ?? 0) || hotScore(signals);
		const trending = Number(row.trendingScore ?? 0) || trendingScore(signals);
		return {
			id: row.id,
			title: row.title,
			body: row.body ?? '',
			url: row.url ?? null,
			media: Array.isArray(row.media) ? row.media as Array<{ id: string; kind: string }> : [],
			authorId,
			author: row.author ?? 'anonymous',
			authorName: row.authorName ?? row.author ?? 'Community member',
			authorAvatar: row.authorAvatar ?? null,
			authorVerified: Boolean(row.authorVerified),
			authorKarma: Number(row.authorKarma ?? 0),
			authorShadowBanned: Boolean(row.authorShadowBanned),
			communityId: row.communityId ?? null,
			emotes: row.communityId ? (emotesByCommunity.get(row.communityId) ?? []) : [],
			community: row.community ?? 'general',
			communityName: row.communityName ?? 'General',
			communityIsPrivate: Boolean(row.communityPrivate),
			communityCreatorId: row.communityCreatorId ?? null,
			score: Number(row.score ?? 0),
			upvotes: Number(row.upvotes ?? 0),
			downvotes: Number(row.downvotes ?? 0),
			comments: Number(row.comments ?? 0),
			views: Number(row.views ?? 0),
			shares: Number(row.shares ?? 0),
			bookmarkCount: 0,
			time: new Date(createdAt).toISOString(),
			isPinned: Boolean(row.isPinned),
			isLocked: Boolean(row.isLocked),
			postType: row.postType ?? 'discussion',
			flair: row.flair ?? null,
			poll: row.poll ?? null,
			userPollVote: myPollVotes.get(row.id) ?? null,
			isNsfw: Boolean(row.isNsfw),
			isFollowedAuthor: followedAuthors.has(authorId),
			isJoinedCommunity: Boolean(row.communityId && joinedCommunities.has(row.communityId)),
			userVote: myVotes.get(row.id) ?? 0,
			isBookmarked: savedPosts.has(row.id),
			xRank,
			hotRank: hot,
			trendingRank: trending,
			bestRank: rankPost(signals, 'best')
		};
	});

	let visiblePosts = formatted.filter((post) =>
		(!post.authorShadowBanned || post.authorId === actor?.id) &&
		!blockedAuthors.has(post.authorId) &&
		!mutedAuthors.has(post.authorId) &&
		(!post.communityIsPrivate || Boolean(actor?.isOwner || actor?.isAdmin) || post.communityCreatorId === actor?.id || (post.communityId && joinedCommunities.has(post.communityId)) || (post.communityId && moderatedCommunities.has(post.communityId))) &&
		(!post.isNsfw || Boolean(actor?.isNsfwEnabled)) &&
		!mutedKeywords.some((keyword) => `${post.title} ${post.body}`.toLowerCase().includes(keyword))
	);
	if (mode === 'following' && actor) visiblePosts = visiblePosts.filter((post) => followedAuthors.has(post.authorId) || post.authorId === actor.id || (post.communityId && (joinedCommunities.has(post.communityId) || moderatedCommunities.has(post.communityId))));
	if (mode === 'for-you') visiblePosts = visiblePosts.sort((a, b) => b.xRank - a.xRank);
	else if (mode === 'latest' || mode === 'new') visiblePosts = visiblePosts.sort((a, b) => +new Date(b.time) - +new Date(a.time));
	else if (mode === 'top') visiblePosts = visiblePosts.sort((a, b) => b.score - a.score);
	else if (mode === 'trending' || mode === 'rising') visiblePosts = visiblePosts.sort((a, b) => b.trendingRank - a.trendingRank);
	else if (mode === 'best') visiblePosts = visiblePosts.sort((a, b) => b.bestRank - a.bestRank);
	else visiblePosts = visiblePosts.sort((a, b) => b.hotRank - a.hotRank);

	const communityRows = await db.select({ id: communities.id, name: communities.name, slug: communities.slug, description: communities.description, memberCount: communities.memberCount, category: communities.category, iconUrl: communities.iconUrl, isPrivate: communities.isPrivate, createdBy: communities.createdBy })
		.from(communities).orderBy(desc(communities.memberCount)).limit(30);
	const communitiesData = communityRows
		.filter((community) => !community.isPrivate || Boolean(actor?.isOwner || actor?.isAdmin) || community.createdBy === actor?.id || joinedCommunities.has(community.id) || moderatedCommunities.has(community.id))
		.slice(0, 7)
		.map(({ isPrivate: _isPrivate, createdBy: _createdBy, ...community }) => ({ ...community, isJoined: joinedCommunities.has(community.id) }));

	const peopleRows = await db.select({ id: users.id, username: users.username, displayName: users.displayName, bio: users.bio, avatarUrl: users.avatarUrl, isVerified: users.isVerified, role: users.role })
		.from(users).where(eq(users.isBanned, false)).limit(14);
	const candidateIds = peopleRows.filter((person) => person.id !== viewerId).map((person) => person.id);
	const followerRows = candidateIds.length
		? await db.select({ followingId: follows.followingId }).from(follows).where(inArray(follows.followingId, candidateIds))
		: [];
	const followerCounts = new Map<string, number>();
	for (const follower of followerRows) followerCounts.set(follower.followingId, (followerCounts.get(follower.followingId) ?? 0) + 1);
	const people = peopleRows.filter((person) => person.id !== viewerId && !followedAuthors.has(person.id)).slice(0, 5).map((person) => ({
		...person,
		name: person.displayName ?? person.username ?? 'Community member',
		username: person.username ?? 'member',
		followers: followerCounts.get(person.id) ?? 0
	}));

	return {
		posts: visiblePosts.slice(0, 40),
		communities: communitiesData,
		people,
		viewer: actor ? { ...actor, name: actor.displayName ?? actor.username ?? 'Member', username: actor.username ?? actor.id } : null,
		site: { name: settings?.siteName ?? 'Forum X', tagline: settings?.tagline ?? 'The internet, in conversation.' },
		mode,
		query,
		databaseReady: true
	};
};
