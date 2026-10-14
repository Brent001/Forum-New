import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, ilike } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { communityModerators, moderationLogs, users } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';
import { getCommunityPermissions } from '$lib/server/community-permissions.js';

export const POST: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to manage moderators.' }, { status: 401 });
  if (actor.isBanned) return json({ error: 'This account is suspended.' }, { status: 403 });
  const communityId = event.params.id;
  const permission = await getCommunityPermissions(actor, communityId);
  if (!permission) return json({ error: 'Community not found.' }, { status: 404 });
  if (!permission.canManageModerators) return json({ error: 'Only the community creator or a site administrator can manage moderators.' }, { status: 403 });
  const body = await event.request.json().catch(() => null);
  const action = String(body?.action ?? '');
  const rawName = String(body?.username ?? '').trim().replace(/^@/, '').slice(0, 40);
  const targetId = String(body?.userId ?? '').trim();
  if (!['add', 'remove'].includes(action)) return json({ error: 'Choose add or remove.' }, { status: 400 });
  let target: { id: string; username: string | null; isOwner: boolean; isAdmin: boolean } | undefined;
  if (action === 'add') {
    if (!/^[a-zA-Z0-9_.-]{2,40}$/.test(rawName)) return json({ error: 'Enter a valid username.' }, { status: 400 });
    const [found] = await db.select({ id: users.id, username: users.username, isOwner: users.isOwner, isAdmin: users.isAdmin }).from(users).where(ilike(users.username, rawName)).limit(1);
    target = found;
  } else {
    const [found] = await db.select({ id: users.id, username: users.username, isOwner: users.isOwner, isAdmin: users.isAdmin }).from(users).where(eq(users.id, targetId)).limit(1);
    target = found;
  }
  if (!target) return json({ error: action === 'add' ? 'No account found with that username.' : 'Moderator account not found.' }, { status: 404 });
  if (target.isOwner || target.isAdmin || target.id === permission.community.createdBy) return json({ error: 'Site administrators and the community creator do not need a community moderator entry.' }, { status: 409 });
  const [existing] = await db.select({ userId: communityModerators.userId }).from(communityModerators).where(and(eq(communityModerators.communityId, communityId), eq(communityModerators.userId, target.id))).limit(1);
  if (action === 'add' && existing) return json({ error: 'This person is already a moderator.' }, { status: 409 });
  if (action === 'remove' && !existing) return json({ error: 'This person is not a moderator.' }, { status: 404 });
  await db.transaction(async (tx) => {
    if (action === 'add') await tx.insert(communityModerators).values({ communityId, userId: target!.id, role: 'moderator', createdAt: new Date() });
    else await tx.delete(communityModerators).where(and(eq(communityModerators.communityId, communityId), eq(communityModerators.userId, target!.id)));
    await tx.insert(moderationLogs).values({ id: crypto.randomUUID(), actorId: actor.id, action: action === 'add' ? 'addCommunityModerator' : 'removeCommunityModerator', targetType: 'community', targetId: `${communityId}:${target!.id}`, reason: `Moderator ${action}: @${target!.username ?? target!.id}` });
  });
  return json({ ok: true, action, moderator: { id: target.id, username: target.username } }, { status: action === 'add' ? 201 : 200 });
};
