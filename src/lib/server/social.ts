import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { communities, communityBans, communityMemberships, communityModerators, posts, users, userInteractions } from '$lib/server/db/schema.js';
import type { RequestEvent } from '@sveltejs/kit';

export async function getActor(event: Pick<RequestEvent, 'locals'>) {
	if (!db || !event.locals.user?.id) return null;
	const [actor] = await db
		.select({
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			email: users.email,
			avatarUrl: users.avatarUrl,
			bannerUrl: users.bannerUrl,
			bio: users.bio,
			preferredFeed: users.preferredFeed,
			mutedKeywords: users.mutedKeywords,
			isNsfwEnabled: users.isNsfwEnabled,
			isVerified: users.isVerified,
			karma: users.karma,
			postKarma: users.postKarma,
			commentKarma: users.commentKarma,
			createdAt: users.createdAt,
			role: users.role,
			isOwner: users.isOwner,
			isAdmin: users.isAdmin,
			isBanned: users.isBanned,
			banReason: users.banReason,
			banUntil: users.banUntil,
			isShadowBanned: users.isShadowBanned,
			profileVisibility: users.profileVisibility,
			dmPolicy: users.dmPolicy,
			discoverable: users.discoverable
		})
		.from(users)
		.where(eq(users.id, event.locals.user.id))
		.limit(1);
	if (!actor) return null;
	const tempBanActive = Boolean(actor.banUntil && new Date(actor.banUntil).getTime() > Date.now());
	return { ...actor, isBanned: Boolean(actor.isBanned || tempBanActive), isTempBanned: tempBanActive };
}

export async function requireActor(event: Pick<RequestEvent, 'locals'>) {
	const actor = await getActor(event);
	if (!actor) throw error(401, 'Sign in to continue.');
	if (actor.isBanned) throw error(403, actor.banReason || 'This account is suspended.');
	return actor;
}

export async function requireOwner(event: Pick<RequestEvent, 'locals'>) {
	const actor = await requireActor(event);
	if (!actor.isOwner) throw error(403, 'Owner access is required.');
	return actor;
}

export async function recordInteraction(input: {
	userId: string;
	targetId: string;
	targetType?: string;
	actionType: string;
	value?: number;
}) {
	if (!db) return;
	await db.insert(userInteractions).values({
		id: crypto.randomUUID(),
		userId: input.userId,
		targetId: input.targetId,
		targetType: input.targetType ?? 'post',
		actionType: input.actionType,
		value: input.value ?? 1
	});
}


/** Enforce community privacy in both page loaders and write APIs. */
export async function canAccessCommunity(actor: { id: string; isOwner: boolean; isAdmin?: boolean } | null, communityId: string) {
	if (!db) return false;
	const [community] = await db.select({ id: communities.id, isPrivate: communities.isPrivate, createdBy: communities.createdBy })
		.from(communities).where(eq(communities.id, communityId)).limit(1);
	if (!community) return false;
	if (!community.isPrivate) return true;
	if (!actor) return false;
	if (actor.isOwner || actor.isAdmin || community.createdBy === actor.id) return true;
	const [membership] = await db.select({ communityId: communityMemberships.communityId })
		.from(communityMemberships)
		.where(and(eq(communityMemberships.userId, actor.id), eq(communityMemberships.communityId, communityId)))
		.limit(1);
	if (membership) return true;
	const [moderator] = await db.select({ communityId: communityModerators.communityId })
		.from(communityModerators)
		.where(and(eq(communityModerators.userId, actor.id), eq(communityModerators.communityId, communityId)))
		.limit(1);
	return Boolean(moderator);
}

export async function canAccessPost(actor: { id: string; isOwner: boolean; isAdmin?: boolean } | null, postId: string) {
	if (!db) return false;
	const [post] = await db.select({ id: posts.id, communityId: posts.communityId })
		.from(posts).where(eq(posts.id, postId)).limit(1);
	if (!post) return false;
	if (!post.communityId) return true;
	return canAccessCommunity(actor, post.communityId);
}


/** Returns an active community ban, while treating expired temporary bans as inactive. */
export async function getCommunityBan(userId: string, communityId: string) {
  if (!db) return null;
  const [ban] = await db.select({ reason: communityBans.reason, expiresAt: communityBans.expiresAt })
    .from(communityBans).where(and(eq(communityBans.userId, userId), eq(communityBans.communityId, communityId))).limit(1);
  if (!ban) return null;
  if (ban.expiresAt && new Date(ban.expiresAt).getTime() <= Date.now()) return null;
  return ban;
}
