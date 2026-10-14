import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { dmConversationMembers, dmConversations, dmMessages } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

const isValidBase64 = (value: unknown, max = 180_000) => typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9+/]+={0,2}$/.test(value);

export const POST: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to send messages.' }, { status: 401 });
  if (actor.isBanned) return json({ error: 'Account is suspended.' }, { status: 403 });
  const conversationId = event.params.id;
  const body = await event.request.json().catch(() => null);
  const id = String(body?.id ?? '');
  const ciphertext = body?.ciphertext;
  const nonce = body?.nonce;
  const envelopes = body?.envelopes;
  if (!/^[a-f0-9-]{30,40}$/i.test(id) || !isValidBase64(ciphertext) || !isValidBase64(nonce, 64) || !Array.isArray(envelopes) || envelopes.length < 2 || envelopes.length > 10) return json({ error: 'Invalid encrypted message payload.' }, { status: 400 });
  let nonceBytes: Uint8Array;
  try { nonceBytes = Uint8Array.from(atob(nonce), (char) => char.charCodeAt(0)); } catch { return json({ error: 'Invalid nonce.' }, { status: 400 }); }
  if (nonceBytes.length !== 12) return json({ error: 'Invalid AES-GCM nonce.' }, { status: 400 });
  const members = await db.select({ userId: dmConversationMembers.userId }).from(dmConversationMembers).where(eq(dmConversationMembers.conversationId, conversationId));
  const memberIds = members.map((member) => member.userId).sort();
  if (!memberIds.includes(actor.id) || memberIds.length < 2 || memberIds.length > 10) return json({ error: 'Conversation not found.' }, { status: 404 });
  const envelopeIds = envelopes.map((item: any) => String(item?.recipientId ?? '')).sort();
  if (JSON.stringify(envelopeIds) !== JSON.stringify(memberIds) || new Set(envelopeIds).size !== memberIds.length) return json({ error: 'Every conversation member must have an encrypted key envelope.' }, { status: 400 });
  for (const envelope of envelopes) {
    const pub = envelope?.ephemeralPublicKey;
    if (pub?.kty !== 'EC' || pub?.crv !== 'P-256' || typeof pub?.x !== 'string' || typeof pub?.y !== 'string' || !isValidBase64(envelope.salt, 80) || !isValidBase64(envelope.wrapNonce, 80) || !isValidBase64(envelope.wrappedKey, 1024)) return json({ error: 'Invalid encryption envelope.' }, { status: 400 });
  }
  try {
    await db.transaction(async (tx) => {
      await tx.insert(dmMessages).values({ id, conversationId, senderId: actor.id, ciphertext, nonce, envelopes, createdAt: new Date() });
      await tx.update(dmConversations).set({ updatedAt: new Date() }).where(eq(dmConversations.id, conversationId));
    });
    return json({ ok: true, id }, { status: 201 });
  } catch {
    return json({ error: 'Message could not be saved.' }, { status: 409 });
  }
};
