import { createHash } from 'node:crypto';
import { json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { dmPublicKeys } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const PUT: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to set up secure messaging.' }, { status: 401 });
  if (actor.isBanned) return json({ error: 'Account is suspended.' }, { status: 403 });
  const body = await event.request.json().catch(() => null);
  const jwk = body?.publicKey as JsonWebKey | undefined;
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string' || jwk.x.length > 100 || jwk.y.length > 100) return json({ error: 'Invalid P-256 public key.' }, { status: 400 });
  const fingerprint = createHash('sha256').update(`EC:P-256:${jwk.x}:${jwk.y}`).digest('hex').toUpperCase().match(/.{1,4}/g)?.join(' ') ?? '';
  const [oldKey] = await db.select({ fingerprint: dmPublicKeys.fingerprint }).from(dmPublicKeys).where(eq(dmPublicKeys.userId, actor.id)).limit(1);
  await db.insert(dmPublicKeys).values({ userId: actor.id, publicKey: jwk, fingerprint, updatedAt: new Date() }).onConflictDoUpdate({ target: dmPublicKeys.userId, set: { publicKey: jwk, fingerprint, updatedAt: new Date() } });
  return json({ ok: true, fingerprint, keyChanged: Boolean(oldKey && oldKey.fingerprint !== fingerprint) });
};
