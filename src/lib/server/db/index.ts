import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { env } from '$env/dynamic/private';

type Schema = typeof schema;
type Db = PostgresJsDatabase<Schema>;

let _db: Db | null = null;

function createDb(): Db | null {
	const url = env.DATABASE_URL;
	if (!url) {
		console.warn('[db] DATABASE_URL is not set — database features are disabled.');
		return null;
	}

	try {
		// Neon (and most managed Postgres providers) require SSL.
		// Using `ssl: 'require'` works for both Neon and local Postgres when
		// the server supports it; remove the option if you're on plain localhost.
		const client = postgres(url, {
			ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
			max: 10,
			idle_timeout: 20,
			connect_timeout: 10
		});

		return drizzle(client, { schema });
	} catch (err) {
		console.error('[db] Failed to initialise database client:', err);
		return null;
	}
}

// Lazily initialised singleton — safe to import at module level.
export const db: Db | null = _db ?? (_db = createDb());