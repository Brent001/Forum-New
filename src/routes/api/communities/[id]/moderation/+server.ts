import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { moderationLogs, posts } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';
import { getCommunityPermissions } from '$lib/server/community-permissions.js';

const ACTIONS = ['pin', 'unpin', 'lock', 'unlock', 'remove', 'restore'] as const;
export const POST: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to moderate this community.' }, { status: 401 });
  if (actor.isBanned) return json({ error: 'This account is suspended.' }, { status: 403 });
  const communityId = event.params.id;
  const permission = await getCommunityPermissions(actor, communityId);
  if (!permission) return json({ error: 'Community not found.' }, { status: 404 });
  if (!permission.canModerateContent) return json({ error: 'Community moderator permissions are required.' }, { status: 403 });
  const payload = await event.request.json().catch(() => null);
  const postId = String(payload?.postId ?? '').trim();
  const action = String(payload?.action ?? '');
  const reason = String(payload?.reason ?? '').trim().slice(0, 500) || null;
  if (!postId || !ACTIONS.includes(action as typeof ACTIONS[number])) return json({ error: 'Choose a post and a valid moderation action.' }, { status: 400 });
  const [post] = await db.select({ id: posts.id, isStickied: posts.isStickied, isLocked: posts.isLocked, isRemoved: posts.isRemoved })
    .from(posts).where(and(eq(posts.id, postId), eq(posts.communityId, communityId))).limit(1);
  if (!post) return json({ error: 'Post not found in this community.' }, { status: 404 });
  const update = action === 'pin' || action === 'unpin' ? { isStickied: action === 'pin' }
    : action === 'lock' || action === 'unlock' ? { isLocked: action === 'lock' }
    : { isRemoved: action === 'remove', removedReason: action === 'remove' ? reason || 'Removed by a community moderator.' : null, removedBy: action === 'remove' ? actor.id : null };
  await db.transaction(async (tx) => {
    await tx.update(posts).set({ ...update, updatedAt: new Date() } as any).where(and(eq(posts.id, postId), eq(posts.communityId, communityId)));
    await tx.insert(moderationLogs).values({ id: crypto.randomUUID(), actorId: actor.id, action: `communityPost:${action}`, targetType: 'post', targetId: postId, reason });
  });
  return json({ ok: true, action, state: { isStickied: action === 'pin' ? true : action === 'unpin' ? false : post.isStickied, isLocked: action === 'lock' ? true : action === 'unlock' ? false : post.isLocked, isRemoved: action === 'remove' ? true : action === 'restore' ? false : post.isRemoved } });
};
