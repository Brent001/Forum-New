import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { communityBans, communityMemberships, communityModerators, communities, moderationLogs, users } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';
import { getCommunityPermissions } from '$lib/server/community-permissions.js';

export const POST: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to manage community bans.' }, { status: 401 });
  if (actor.isBanned) return json({ error: 'This account is suspended.' }, { status: 403 });
  const communityId = event.params.id;
  const permission = await getCommunityPermissions(actor, communityId);
  if (!permission) return json({ error: 'Community not found.' }, { status: 404 });
  if (!permission.canBanMembers) return json({ error: 'Community moderator permissions are required.' }, { status: 403 });
  const payload = await event.request.json().catch(() => null);
  const action = String(payload?.action ?? 'ban');
  const userId = String(payload?.userId ?? '').trim();
  const username = String(payload?.username ?? '').trim().replace(/^@/, '').slice(0, 40);
  const reason = String(payload?.reason ?? '').trim().slice(0, 500) || null;
  if (!['ban', 'unban'].includes(action)) return json({ error: 'Choose ban or unban.' }, { status: 400 });
  let target: { id: string; username: string | null; isOwner: boolean; isAdmin: boolean } | undefined;
  if (userId) {
    const [found] = await db.select({ id: users.id, username: users.username, isOwner: users.isOwner, isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).limit(1);
    target = found;
  } else if (username) {
    const [found] = await db.select({ id: users.id, username: users.username, isOwner: users.isOwner, isAdmin: users.isAdmin }).from(users).where(ilike(users.username, username)).limit(1);
    target = found;
  }
  if (!target) return json({ error: 'Find a user by exact username first.' }, { status: 404 });
  if (target.id === actor.id || target.id === permission.community.createdBy || target.isOwner || target.isAdmin) return json({ error: 'You cannot ban yourself, the community creator, or a site administrator.' }, { status: 403 });
  const [targetModerator] = await db.select({ userId: communityModerators.userId }).from(communityModerators).where(and(eq(communityModerators.communityId, communityId), eq(communityModerators.userId, target.id))).limit(1);
  if (targetModerator && !permission.canManageModerators) return json({ error: 'Only the community creator or a site administrator can ban another moderator.' }, { status: 403 });
  const membershipWhere = and(eq(communityMemberships.communityId, communityId), eq(communityMemberships.userId, target.id));
  const [membership] = await db.select({ userId: communityMemberships.userId }).from(communityMemberships).where(membershipWhere).limit(1);
  if (action === 'unban') {
    const [existing] = await db.select({ userId: communityBans.userId }).from(communityBans).where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, target.id))).limit(1);
    if (!existing) return json({ error: 'This user does not have an active community ban.' }, { status: 404 });
    await db.delete(communityBans).where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, target.id)));
  } else {
    const permanent = Boolean(payload?.permanent);
    const durationHours = Math.max(1, Math.min(8760, Number(payload?.durationHours) || 24));
    await db.insert(communityBans).values({ communityId, userId: target.id, reason, createdBy: actor.id, expiresAt: permanent ? null : new Date(Date.now() + durationHours * 60 * 60 * 1000), createdAt: new Date() })
      .onConflictDoUpdate({ target: [communityBans.communityId, communityBans.userId], set: { reason, createdBy: actor.id, expiresAt: permanent ? null : new Date(Date.now() + durationHours * 60 * 60 * 1000), createdAt: new Date() } });
    if (membership) {
      await db.transaction(async (tx) => {
        await tx.delete(communityMemberships).where(membershipWhere);
        await tx.update(communities).set({ memberCount: sql`greatest(${communities.memberCount} - 1, 0)` }).where(eq(communities.id, communityId));
      });
    }
  }
  await db.insert(moderationLogs).values({ id: crypto.randomUUID(), actorId: actor.id, action: action === 'ban' ? 'communityBan' : 'communityUnban', targetType: 'community-member', targetId: `${communityId}:${target.id}`, reason });
  return json({ ok: true, action, user: { id: target.id, username: target.username } });
};
