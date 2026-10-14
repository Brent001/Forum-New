import { env } from '$env/dynamic/public';

type ApiFailure = { error?: string; code?: string; details?: unknown };
let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let tokenRequest: Promise<string | null> | null = null;

function apiBase() {
  const configured = (env.PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) return 'http://localhost:4000';
  throw new Error('The feature API is not configured. Set PUBLIC_API_BASE_URL in your frontend environment and redeploy.');
}

async function acquireToken(): Promise<string | null> {
  if (cachedToken && tokenExpiresAt > Date.now() + 30_000) return cachedToken;
  if (tokenRequest) return tokenRequest;
  tokenRequest = (async () => {
    try {
      const response = await fetch('/api/access-token', { credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 401) { cachedToken = null; tokenExpiresAt = 0; return null; }
      const payload = await response.json() as { token?: string; expiresAt?: number; error?: string };
      if (!response.ok || !payload.token) throw new Error(payload.error || 'Could not authorize the feature API.');
      cachedToken = payload.token;
      tokenExpiresAt = Number(payload.expiresAt) || Date.now() + 240_000;
      return cachedToken;
    } finally { tokenRequest = null; }
  })();
  return tokenRequest;
}

export async function featureApiFetch(path: string, init: RequestInit = {}) {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid feature API path.');
  const token = await acquireToken();
  const headers = new Headers(init.headers);
  if (!headers.has('content-type') && init.body != null && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${apiBase()}/api/v1${path}`, { ...init, headers, credentials: 'omit', redirect: 'error' });
}

export async function featureApiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await featureApiFetch(path, init);
  const payload = await response.json().catch(() => ({})) as T & ApiFailure;
  if (!response.ok) {
    const details = Array.isArray(payload.details) ? ` ${payload.details.map((x) => typeof x === 'object' && x && 'message' in x ? String((x as { message: unknown }).message) : '').filter(Boolean).join(' ')}` : '';
    throw new Error(`${payload.error || `Request failed (${response.status}).`}${details}`);
  }
  return payload as T;
}

export function clearFeatureApiToken() { cachedToken = null; tokenExpiresAt = 0; }
