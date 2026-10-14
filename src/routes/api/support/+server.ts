import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { supportTickets } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

const CATEGORIES = new Set(['account', 'technical', 'billing', 'safety', 'privacy', 'appeal', 'other']);

export const POST: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Support is temporarily unavailable.' }, { status: 503 });
  const actor = await getActor(event);
  const body = await event.request.json().catch(() => null);
  // Simple bot trap. If it is filled, quietly accept without creating a ticket.
  if (String(body?.website ?? '').trim()) return json({ ok: true }, { status: 201 });
  const category = String(body?.category ?? 'other');
  const subject = String(body?.subject ?? '').trim();
  const message = String(body?.message ?? '').trim();
  const contactEmail = String(body?.contactEmail ?? '').trim().slice(0, 254) || null;
  if (!CATEGORIES.has(category)) return json({ error: 'Choose a valid support category.' }, { status: 400 });
  if (subject.length < 5 || subject.length > 120) return json({ error: 'Subject must be 5–120 characters.' }, { status: 400 });
  if (message.length < 10 || message.length > 5000) return json({ error: 'Message must be 10–5,000 characters.' }, { status: 400 });
  if (!actor && (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) return json({ error: 'Provide a valid contact email or sign in.' }, { status: 400 });
  if (actor) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [count] = await db.select({ count: sql<number>`count(*)` }).from(supportTickets).where(and(eq(supportTickets.userId, actor.id), gt(supportTickets.createdAt, since)));
    if (Number(count?.count ?? 0) >= 5 && !actor.isOwner) return json({ error: 'You have reached the support submission limit. Please wait before creating another ticket.' }, { status: 429 });
  }
  await db.insert(supportTickets).values({ id: crypto.randomUUID(), userId: actor?.id ?? null, category, subject, message, contactEmail, status: 'open', priority: category === 'safety' || category === 'privacy' ? 'high' : 'normal', createdAt: new Date(), updatedAt: new Date() });
  return json({ ok: true }, { status: 201 });
};
