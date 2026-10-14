import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { communities, communityModerators } from '$lib/server/db/schema.js';

export type CommunityActor = { id: string; isOwner?: boolean; isAdmin?: boolean };

export async function getCommunityPermissions(actor: CommunityActor | null, communityId: string) {
  if (!db) return null;
  const [community] = await db.select({ id: communities.id, slug: communities.slug, createdBy: communities.createdBy, isPrivate: communities.isPrivate })
    .from(communities).where(eq(communities.id, communityId)).limit(1);
  if (!community) return null;
  const [moderator] = actor
    ? await db.select({ role: communityModerators.role }).from(communityModerators)
      .where(and(eq(communityModerators.communityId, communityId), eq(communityModerators.userId, actor.id))).limit(1)
    : [];
  const isCreator = Boolean(actor && community.createdBy === actor.id);
  const isModerator = Boolean(moderator);
  const isGlobalManager = Boolean(actor?.isOwner || actor?.isAdmin);
  return {
    community,
    isCreator,
    isModerator,
    canManageEmotes: Boolean(actor && (isGlobalManager || isCreator || isModerator)),
    canModerateContent: Boolean(actor && (isGlobalManager || isCreator || isModerator)),
    canManageModerators: Boolean(actor && (isGlobalManager || isCreator)),
    canBanMembers: Boolean(actor && (isGlobalManager || isCreator || isModerator))
  };
}
