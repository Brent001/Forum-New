import { json, type RequestHandler } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { dmConversationMembers, dmMessages, dmPublicKeys, users } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const GET: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to view encrypted messages.' }, { status: 401 });
  const conversationId = event.params.id;
  const memberships = await db.select({ userId: dmConversationMembers.userId }).from(dmConversationMembers).where(eq(dmConversationMembers.conversationId, conversationId));
  if (!memberships.some((member) => member.userId === actor.id)) return json({ error: 'Conversation not found.' }, { status: 404 });
  const members = await db.select({ id: users.id, username: users.username, displayName: users.displayName, publicKey: dmPublicKeys.publicKey, fingerprint: dmPublicKeys.fingerprint })
    .from(dmConversationMembers).innerJoin(users, eq(users.id, dmConversationMembers.userId)).leftJoin(dmPublicKeys, eq(dmPublicKeys.userId, users.id)).where(eq(dmConversationMembers.conversationId, conversationId));
  const messages = await db.select({ id: dmMessages.id, senderId: dmMessages.senderId, ciphertext: dmMessages.ciphertext, nonce: dmMessages.nonce, envelopes: dmMessages.envelopes, createdAt: dmMessages.createdAt })
    .from(dmMessages).where(eq(dmMessages.conversationId, conversationId)).orderBy(asc(dmMessages.createdAt)).limit(100);
  return json({ conversationId, members: members.map((member) => ({ ...member, username: member.username ?? 'member', displayName: member.displayName ?? member.username ?? 'Member' })), messages });
};
