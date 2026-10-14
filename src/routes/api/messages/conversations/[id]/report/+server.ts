import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { dmConversationMembers, dmMessages, reports } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const POST: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to report a message.' }, { status: 401 });
  const body = await event.request.json().catch(() => null);
  const messageId = String(body?.messageId ?? '');
  const reason = String(body?.reason ?? 'other').trim().slice(0, 60);
  const evidence = String(body?.evidence ?? '').trim().slice(0, 4000);
  if (!messageId || !evidence) return json({ error: 'Select a message and confirm the text you want to share with moderation.' }, { status: 400 });
  const [member] = await db.select({ userId: dmConversationMembers.userId }).from(dmConversationMembers).where(and(eq(dmConversationMembers.conversationId, event.params.id), eq(dmConversationMembers.userId, actor.id))).limit(1);
  const [message] = await db.select({ id: dmMessages.id }).from(dmMessages).where(and(eq(dmMessages.id, messageId), eq(dmMessages.conversationId, event.params.id))).limit(1);
  if (!member || !message) return json({ error: 'Message not found.' }, { status: 404 });
  await db.insert(reports).values({ id: crypto.randomUUID(), targetType: 'dm-message', targetId: messageId, reporterId: actor.id, reason: `dm:${reason}`, details: `Reporter-selected decrypted evidence (consensually submitted):\n${evidence}`, status: 'open', createdAt: new Date() });
  return json({ ok: true }, { status: 201 });
};
