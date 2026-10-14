import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db/index.js';
import { appSettings, users } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { auth, authSecret } from '$lib/server/auth.js';

// ---------------------------------------------------------------------------
// Setup-completion check
// ---------------------------------------------------------------------------

export async function isSetupComplete(): Promise<boolean> {
	if (!db) return false;

	try {
		const row = await db.select().from(appSettings).where(eq(appSettings.id, 1));
		return row.length > 0 && row[0].setupComplete === true;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetupConfig {
	siteName: string;
	tagline?: string;
	logoUrl?: string;
	brandColor: string;
	adminUsername: string;
	adminEmail: string;
	adminPassword: string;
	allowRegistration: boolean;
	inviteOnly: boolean;
	requireEmailVerification: boolean;
	enableNsfw: boolean;
	enableRealtimeFeed: boolean;
	defaultSort: string;
	postRateLimitPerHour: number;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

export async function testDatabaseConnection(connectionString: string): Promise<void> {
	const postgres = (await import('postgres')).default;
	const client = postgres(connectionString, { ssl: 'require' });
	try {
		await client`SELECT 1`;
	} finally {
		await client.end();
	}
}

export async function persistSetupSettings(settings: SetupConfig): Promise<void> {
	const targetDb = db ?? (await createTemporaryDb());
	if (!targetDb) throw new Error('Unable to connect to database during setup');

	const values = {
		id: 1,
		siteName: settings.siteName,
		tagline: settings.tagline,
		logoUrl: settings.logoUrl,
		brandColor: settings.brandColor,
		allowRegistration: settings.allowRegistration,
		inviteOnly: settings.inviteOnly,
		requireEmailVerification: settings.requireEmailVerification,
		enableNsfw: settings.enableNsfw,
		enableRealtimeFeed: settings.enableRealtimeFeed,
		defaultSort: settings.defaultSort,
		postRateLimitPerHour: settings.postRateLimitPerHour,
		setupComplete: true
	};

	let existing: unknown[];
	try {
		existing = await targetDb.select().from(appSettings).where(eq(appSettings.id, 1));
	} catch {
		await ensureAppSettingsTable(targetDb);
		existing = [];
	}

	if (existing.length) {
		await targetDb.update(appSettings).set(values).where(eq(appSettings.id, 1));
	} else {
		await targetDb.insert(appSettings).values(values);
	}
}

async function ensureAppSettingsTable(targetDb: any) {
	await targetDb.execute(`
		CREATE TABLE IF NOT EXISTS app_settings (
			id integer PRIMARY KEY DEFAULT 1,
			site_name text NOT NULL,
			tagline text,
			logo_url text,
			brand_color text NOT NULL DEFAULT '#2b6cb0',
			allow_registration boolean NOT NULL DEFAULT true,
			invite_only boolean NOT NULL DEFAULT false,
			require_email_verification boolean NOT NULL DEFAULT false,
			enable_nsfw boolean NOT NULL DEFAULT false,
			enable_realtime_feed boolean NOT NULL DEFAULT true,
			default_sort text NOT NULL DEFAULT 'hot',
			post_rate_limit_per_hour integer NOT NULL DEFAULT 10,
			setup_complete boolean NOT NULL DEFAULT false,
			updated_at timestamp
		);
	`);
}

// ---------------------------------------------------------------------------
// Admin-user creation
// ---------------------------------------------------------------------------

export async function createAdminUser(settings: SetupConfig): Promise<void> {
	if (!db) throw new Error('Database is not initialized. Check DATABASE_URL and restart the server.');
	if (!auth) throw new Error('Authentication is not configured. Check BETTER_AUTH_SECRET and PUBLIC_SITE_URL, then restart the server.');

	const email = settings.adminEmail.trim().toLowerCase();
	const username = settings.adminUsername.trim();
	const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

	if (existing.length) {
		// A previous setup attempt may have created the user before a later step
		// failed. Never promote an existing account just because its email matches:
		// require proof of account ownership by verifying the submitted password.
		try {
			await auth.api.signInEmail({ body: { email, password: settings.adminPassword } });
		} catch {
			throw new Error('An account with this email already exists. Enter that account’s correct password to resume setup, or choose a different admin email.');
		}
	} else {
		try {
			await auth.api.signUpEmail({
				body: {
					email,
					password: settings.adminPassword,
					name: username,
					username
				} as any
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (/USER_ALREADY_EXISTS|already exists/i.test(message)) {
				throw new Error('An account with this email was created by an earlier attempt. Enter its correct password to resume setup.');
			}
			throw error;
		}
	}

	await db.update(users).set({
		isAdmin: true,
		isOwner: true,
		role: 'owner',
		username,
		displayName: username
	}).where(eq(users.email, email));
}

// ---------------------------------------------------------------------------
// Env-file helpers
// ---------------------------------------------------------------------------

export async function persistEnvFile(settings: SetupConfig): Promise<void> {
	const envPath = resolve(process.cwd(), '.env.local');

	const values = new Map<string, string>([
		['PUBLIC_SITE_URL', env.PUBLIC_SITE_URL ?? 'http://localhost:5173'],
		['SETUP_COMPLETE', 'true']
	]);

	if (!env.BETTER_AUTH_SECRET) {
		values.set('BETTER_AUTH_SECRET', authSecret);
	}

	const existing = await readEnvFile(envPath);
	for (const [key, value] of values) {
		existing.set(key, value);
	}

	await fs.writeFile(envPath, formatEnvFile(existing), 'utf8');
}

async function readEnvFile(path: string): Promise<Map<string, string>> {
	try {
		const contents = await fs.readFile(path, 'utf8');
		return new Map(
			contents
				.split(/\r?\n/)
				.filter(Boolean)
				.map((line) => {
					const [key, ...rest] = line.split('=');
					return [key, rest.join('=')] as [string, string];
				})
		);
	} catch {
		return new Map();
	}
}

function formatEnvFile(map: Map<string, string>): string {
	return (
		Array.from(map.entries())
			.map(([key, value]) => `${key}=${value}`)
			.join('\n') + '\n'
	);
}

// ---------------------------------------------------------------------------
// Temporary DB (used during first-run before DATABASE_URL is persisted)
// ---------------------------------------------------------------------------

async function createTemporaryDb() {
	const connectionString = env.DATABASE_URL;
	if (!connectionString) return null;

	const postgres = (await import('postgres')).default;
	const { drizzle } = await import('drizzle-orm/postgres-js');
	const schema = await import('./db/schema.js');
	const client = postgres(connectionString);
	return drizzle(client, { schema });
}