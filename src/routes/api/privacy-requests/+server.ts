import { json, type RequestHandler } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { privacyRequests } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

const REQUEST_TYPES = new Set(['access', 'correction', 'erasure', 'blocking', 'portability', 'objection', 'withdraw-consent', 'other']);

export const GET: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to view your data requests.' }, { status: 401 });
  const requests = await db.select({ id: privacyRequests.id, requestType: privacyRequests.requestType, details: privacyRequests.details, status: privacyRequests.status, resolutionNote: privacyRequests.resolutionNote, createdAt: privacyRequests.createdAt, updatedAt: privacyRequests.updatedAt }).from(privacyRequests).where(eq(privacyRequests.userId, actor.id)).orderBy(desc(privacyRequests.createdAt)).limit(50);
  return json({ requests }, { headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Data request service is unavailable.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to submit a privacy request.' }, { status: 401 });
  const body = await event.request.json().catch(() => null);
  const requestType = String(body?.requestType ?? 'other');
  const details = String(body?.details ?? '').trim().slice(0, 2500) || null;
  if (!REQUEST_TYPES.has(requestType)) return json({ error: 'Choose a valid request type.' }, { status: 400 });
  await db.insert(privacyRequests).values({ id: crypto.randomUUID(), userId: actor.id, requestType, details, status: 'received', createdAt: new Date(), updatedAt: new Date() });
  return json({ ok: true, message: 'Your request has been recorded. The site operator must review identity and applicable retention obligations before fulfilling it.' }, { status: 201 });
};
