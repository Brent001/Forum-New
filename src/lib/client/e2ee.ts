export type PublicIdentity = { userId: string; publicKey: JsonWebKey; fingerprint: string };
export type DMEnvelope = { recipientId: string; ephemeralPublicKey: JsonWebKey; salt: string; wrapNonce: string; wrappedKey: string };
export type EncryptedPayload = { id: string; ciphertext: string; nonce: string; envelopes: DMEnvelope[] };
export type ClientIdentity = { userId: string; privateKey: CryptoKey; publicKey: JsonWebKey; fingerprint: string };

const DB_NAME = 'nexus-e2ee-v1';
const STORE = 'identities';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'userId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local key storage.'));
  });
}
async function readRecord(userId: string): Promise<any> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(userId);
    request.onsuccess = () => { resolve(request.result); db.close(); };
    request.onerror = () => { reject(request.error); db.close(); };
  });
}
async function saveRecord(record: any): Promise<void> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not save local encryption key.')); };
  });
}
function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let offset = 0; offset < array.length; offset += 0x8000) binary += String.fromCharCode(...array.subarray(offset, Math.min(offset + 0x8000, array.length)));
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
export async function fingerprintPublicKey(jwk: JsonWebKey): Promise<string> {
  const canonical = `${jwk.kty}:${jwk.crv}:${jwk.x}:${jwk.y}`;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonical)));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return hex.match(/.{1,4}/g)?.join(' ') ?? hex;
}

export async function getOrCreateIdentity(userId: string): Promise<ClientIdentity> {
  const stored = await readRecord(userId);
  if (stored?.privateKey && stored?.publicKey) {
    return { userId, privateKey: stored.privateKey as CryptoKey, publicKey: stored.publicKey as JsonWebKey, fingerprint: stored.fingerprint as string };
  }
  // Generate an exportable pair once, then re-import the private key as non-extractable.
  // Only the public JWK is ever sent to the server.
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateKey = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const fingerprint = await fingerprintPublicKey(publicKey);
  await saveRecord({ userId, privateKey, publicKey, fingerprint, createdAt: new Date().toISOString() });
  return { userId, privateKey, publicKey, fingerprint };
}

async function makeWrapKey(privateKey: CryptoKey, peerJwk: JsonWebKey, salt: Uint8Array, info: string): Promise<CryptoKey> {
  const publicKey = await crypto.subtle.importKey('jwk', peerJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(info) }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptDMMessage(text: string, conversationId: string, messageId: string, identity: ClientIdentity, recipients: PublicIdentity[]): Promise<EncryptedPayload> {
  const unique = new Map(recipients.map((recipient) => [recipient.userId, recipient]));
  unique.set(identity.userId, { userId: identity.userId, publicKey: identity.publicKey, fingerprint: identity.fingerprint });
  const members = [...unique.values()];
  if (!members.length || !members.every((member) => member.publicKey?.kty === 'EC' && member.publicKey.crv === 'P-256')) throw new Error('A conversation member has not activated secure messaging yet.');
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const ephemeralPublicKey = await crypto.subtle.exportKey('jwk', ephemeral.publicKey);
  const contentKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const rawContentKey = await crypto.subtle.exportKey('raw', contentKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(`nexus-dm-v1:${conversationId}:${messageId}`);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, contentKey, encoder.encode(text));
  const envelopes: DMEnvelope[] = [];
  for (const recipient of members) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const wrapNonce = crypto.getRandomValues(new Uint8Array(12));
    const info = `nexus-dm-key-v1:${conversationId}:${messageId}:${recipient.userId}`;
    const wrappingKey = await makeWrapKey(ephemeral.privateKey, recipient.publicKey, salt, info);
    const wrappedKey = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapNonce }, wrappingKey, rawContentKey);
    envelopes.push({ recipientId: recipient.userId, ephemeralPublicKey, salt: toBase64(salt), wrapNonce: toBase64(wrapNonce), wrappedKey: toBase64(wrappedKey) });
  }
  return { id: messageId, ciphertext: toBase64(ciphertext), nonce: toBase64(nonce), envelopes };
}

export async function decryptDMMessage(message: EncryptedPayload, conversationId: string, identity: ClientIdentity): Promise<string> {
  const envelope = message.envelopes.find((candidate) => candidate.recipientId === identity.userId);
  if (!envelope) throw new Error('This device does not have a key envelope for this message.');
  const info = `nexus-dm-key-v1:${conversationId}:${message.id}:${identity.userId}`;
  const wrappingKey = await makeWrapKey(identity.privateKey, envelope.ephemeralPublicKey, fromBase64(envelope.salt), info);
  const rawContentKey = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.wrapNonce) }, wrappingKey, fromBase64(envelope.wrappedKey));
  const contentKey = await crypto.subtle.importKey('raw', rawContentKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const aad = encoder.encode(`nexus-dm-v1:${conversationId}:${message.id}`);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(message.nonce), additionalData: aad }, contentKey, fromBase64(message.ciphertext));
  return decoder.decode(plaintext);
}
