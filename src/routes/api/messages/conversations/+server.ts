import { json, type RequestHandler } from '@sveltejs/kit';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { dmConversationMembers, dmConversations, dmMessages, dmPublicKeys, follows, userBlocks, users } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const GET: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to view messages.' }, { status: 401 });
  const mine = await db.select({ conversationId: dmConversationMembers.conversationId }).from(dmConversationMembers).where(eq(dmConversationMembers.userId, actor.id));
  const ids = mine.map((row) => row.conversationId);
  if (!ids.length) return json({ conversations: [] });
  const rows = await db.select({ id: dmConversations.id, updatedAt: dmConversations.updatedAt }).from(dmConversations).where(inArray(dmConversations.id, ids)).orderBy(desc(dmConversations.updatedAt)).limit(50);
  const conversations = [];
  for (const conversation of rows) {
    const members = await db.select({ userId: dmConversationMembers.userId, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl, fingerprint: dmPublicKeys.fingerprint })
      .from(dmConversationMembers).innerJoin(users, eq(users.id, dmConversationMembers.userId)).leftJoin(dmPublicKeys, eq(dmPublicKeys.userId, users.id)).where(eq(dmConversationMembers.conversationId, conversation.id));
    const other = members.find((member) => member.userId !== actor.id);
    if (!other) continue;
    const [latest] = await db.select({ createdAt: dmMessages.createdAt, senderId: dmMessages.senderId }).from(dmMessages).where(eq(dmMessages.conversationId, conversation.id)).orderBy(desc(dmMessages.createdAt)).limit(1);
    conversations.push({ id: conversation.id, updatedAt: conversation.updatedAt, other: { id: other.userId, username: other.username ?? 'member', displayName: other.displayName ?? other.username ?? 'Member', avatarUrl: other.avatarUrl, fingerprint: other.fingerprint }, lastMessageAt: latest?.createdAt ?? conversation.updatedAt, lastSenderId: latest?.senderId ?? null });
  }
  return json({ conversations });
};

export const POST: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to start a private conversation.' }, { status: 401 });
  if (actor.isBanned) return json({ error: 'Account is suspended.' }, { status: 403 });
  const body = await event.request.json().catch(() => null);
  const username = String(body?.username ?? '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_.-]{2,32}$/.test(username)) return json({ error: 'Enter a valid username.' }, { status: 400 });
  const [recipient] = await db.select({ id: users.id, username: users.username, isBanned: users.isBanned, banUntil: users.banUntil, isShadowBanned: users.isShadowBanned, dmPolicy: users.dmPolicy })
    .from(users).where(eq(users.username, username)).limit(1);
  if (!recipient || recipient.id === actor.id || recipient.isBanned || (recipient.banUntil && recipient.banUntil.getTime() > Date.now())) return json({ error: 'That member is unavailable for direct messages.' }, { status: 404 });
  if (recipient.dmPolicy === 'none') return json({ error: 'This member is not accepting direct messages.' }, { status: 403 });
  if (recipient.dmPolicy === 'following') {
    const [followsSender] = await db.select({ followerId: follows.followerId }).from(follows).where(and(eq(follows.followerId, recipient.id), eq(follows.followingId, actor.id))).limit(1);
    if (!followsSender) return json({ error: 'This member only accepts messages from accounts they follow.' }, { status: 403 });
  }
  const [block] = await db.select({ blockerId: userBlocks.blockerId }).from(userBlocks).where(or(and(eq(userBlocks.blockerId, actor.id), eq(userBlocks.blockedId, recipient.id)), and(eq(userBlocks.blockerId, recipient.id), eq(userBlocks.blockedId, actor.id)))).limit(1);
  if (block) return json({ error: 'A block prevents this conversation.' }, { status: 403 });
  const directKey = [actor.id, recipient.id].sort().join(':');
  let conversationId = '';
  await db.transaction(async (tx) => {
    await tx.insert(dmConversations).values({ id: crypto.randomUUID(), directKey, createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing({ target: dmConversations.directKey });
    const [conversation] = await tx.select({ id: dmConversations.id }).from(dmConversations).where(eq(dmConversations.directKey, directKey)).limit(1);
    if (!conversation) throw new Error('Could not create DM conversation.');
    conversationId = conversation.id;
    await tx.insert(dmConversationMembers).values([{ conversationId, userId: actor.id }, { conversationId, userId: recipient.id }]).onConflictDoNothing();
  });
  return json({ ok: true, conversationId }, { status: 201 });
};
