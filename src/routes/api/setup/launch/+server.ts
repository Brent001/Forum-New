import { json, type RequestHandler } from '@sveltejs/kit';
import { isSetupComplete } from '$lib/server/setup.js';
import { persistSetupSettings, persistEnvFile, createAdminUser } from '$lib/server/setup.js';
import { db } from '$lib/server/db/index.js';
import { appSettings } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request }) => {
	if (await isSetupComplete()) return json({ ok: false, error: 'Setup has already been completed.' }, { status: 409 });
	const body = await request.json();
	const required = ['siteName', 'brandColor', 'adminUsername', 'adminEmail', 'adminPassword', 'defaultSort'];

	for (const key of required) {
		if (!body?.[key]) {
			return json({ ok: false, error: `Missing field ${key}` }, { status: 400 });
		}
	}

	const rawColor = String(body.brandColor ?? '').trim();	
	if (!/^#[0-9a-fA-F]{6}$/.test(rawColor)) return json({ ok: false, error: 'Choose a valid 6-digit brand color.' }, { status: 400 });
	const config = {
		siteName: String(body.siteName).trim(),
		tagline: String(body.tagline ?? '').trim(),
		logoUrl: String(body.logoUrl ?? '').trim(),
		brandColor: rawColor,
		adminUsername: String(body.adminUsername).trim(),
		adminEmail: String(body.adminEmail).trim(),
		adminPassword: String(body.adminPassword).trim(),
		allowRegistration: Boolean(body.allowRegistration),
		inviteOnly: Boolean(body.inviteOnly),
		requireEmailVerification: Boolean(body.requireEmailVerification),
		enableNsfw: Boolean(body.enableNsfw),
		enableRealtimeFeed: Boolean(body.enableRealtimeFeed),
		defaultSort: String(body.defaultSort).trim() || 'hot',
		postRateLimitPerHour: Number(body.postRateLimitPerHour) || 10
	};

	try {
		// Create/verify the owner first; mark setup complete only after every step succeeds.
		await createAdminUser(config);
		await persistEnvFile(config);
		await persistSetupSettings(config);
		return json({ ok: true });
	} catch (error) {
		console.error('[setup launch]', error);
		const detail = error instanceof Error ? error.message : 'Unknown setup error';
		// Setup is marked complete while settings are persisted. Re-open the
		// wizard if owner creation or environment persistence fails.
		try { if (db) await db.update(appSettings).set({ setupComplete: false }).where(eq(appSettings.id, 1)); } catch { /* The initial database/table may not exist yet. */ }
		return json({ ok: false, error: detail }, { status: 500 });
	}
};
