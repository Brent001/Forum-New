import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types.js';
import { isSetupComplete } from '$lib/server/setup.js';
import { getActor } from '$lib/server/social.js';
import { db } from '$lib/server/db/index.js';
import { appSettings, users } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = async (event) => {
	const { url, locals } = event;
	const setupComplete = await isSetupComplete();
	if (!setupComplete && url.pathname !== '/setup') throw redirect(302, '/setup');
	if (setupComplete && url.pathname === '/setup') throw redirect(302, '/');

	const actorPromise = getActor(event);
	const settingsPromise = db ? db.select({ siteName: appSettings.siteName, tagline: appSettings.tagline, logoUrl: appSettings.logoUrl }).from(appSettings).where(eq(appSettings.id, 1)).limit(1) : Promise.resolve([]);
	const [actor, settingsRows] = await Promise.all([actorPromise, settingsPromise]);
	const settings = settingsRows[0];
	return {
		setupComplete,
		user: actor ? {
			...actor,
			name: actor.displayName || actor.username || 'Member',
			username: actor.username || actor.id
		} : null,
		site: { name: settings?.siteName ?? 'Nexus', tagline: settings?.tagline ?? 'The internet, in conversation.', logoUrl: settings?.logoUrl ?? null },
		pathname: url.pathname
	};
};
