import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db/index.js';
import { users, sessions, accounts, verifications } from '$lib/server/db/schema.js';
import { randomBytes } from 'node:crypto';

function getAuthSecret(): string {
	return (
		env.BETTER_AUTH_SECRET ||
		process.env.BETTER_AUTH_SECRET ||
		randomBytes(32).toString('hex')
	);
}

function getBaseUrl(): string {
	return env.ORIGIN || env.PUBLIC_SITE_URL || 'http://localhost:5173';
}

export const authSecret = getAuthSecret();

// Ensure the secret is always available to the process so that
// subsequent requests (e.g. cookie verification) use the same value.
if (!env.BETTER_AUTH_SECRET && !process.env.BETTER_AUTH_SECRET) {
	process.env.BETTER_AUTH_SECRET = authSecret;
}

let auth: ReturnType<typeof betterAuth> | null = null;

if (db && authSecret) {
	auth = betterAuth({
		baseURL: getBaseUrl(),
		secret: authSecret,
		database: drizzleAdapter(db, {
			provider: 'pg',
			schema: {
				user: users,
				session: sessions,
				account: accounts,
				verification: verifications
			}
		}),
		user: {
			// Map Better Auth's built-in "name" field to our "displayName" column.
			fields: {
				name: 'displayName'
			},
			// Declare "username" so Better Auth writes it during INSERT instead of
			// leaving it NULL, which violates the NOT NULL constraint on the column.
			additionalFields: {
				username: {
					type: 'string',
					required: false,
					defaultValue: null,
					// Allow callers (e.g. auth.api.signUpEmail) to supply the value.
					input: true,
					fieldName: 'username'
				}
			}
		},
		emailAndPassword: { enabled: true },
		plugins: [
			// sveltekitCookies must be the last plugin in the array.
			sveltekitCookies(getRequestEvent)
		]
	});
}

export { auth };