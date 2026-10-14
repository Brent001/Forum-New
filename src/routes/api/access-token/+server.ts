import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createPrivateKey, sign as signSignature, randomBytes } from 'node:crypto';
import { db } from '$lib/server/db/index.js';
import { users } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

function b64url(value: string | Buffer) { return Buffer.from(value).toString('base64url'); }
function sign(payload: Record<string, unknown>, pem: string) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const privateKey = createPrivateKey(pem);
  const signature = signSignature('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
  return `${data}.${signature}`;
}


export const GET: RequestHandler = async (event) => {
  const userId = event.locals.user?.id;
  if (!userId || !event.locals.session) return json({ error: 'Sign in to access the feature API.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const privateKeyPem = (env.API_TOKEN_PRIVATE_KEY || process.env.API_TOKEN_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!privateKeyPem.includes('BEGIN PRIVATE KEY')) return json({ error: 'Feature API signing key is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const [user] = await db.select({ id: users.id, isBanned: users.isBanned, banUntil: users.banUntil, isOwner: users.isOwner, isAdmin: users.isAdmin, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return json({ error: 'Account not found.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (user.isBanned || (user.banUntil && user.banUntil.getTime() > Date.now())) return json({ error: 'This account is restricted.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 300;
  let token: string;
  try { token = sign({ iss: 'nexus-web', aud: 'nexus-api', sub: user.id, iat: now, exp: expiresAt, jti: randomBytes(12).toString('hex') }, privateKeyPem); }
  catch { return json({ error: 'Feature API signing key is invalid.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  return json({ token, expiresAt: expiresAt * 1000 }, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
};
