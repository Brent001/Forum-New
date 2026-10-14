import { db } from '$lib/server/db/index.js';
import { isSetupComplete } from '$lib/server/setup.js';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
  // The setup wizard is only for the first run. The root layout routes new
  // installations here; once the owner completes setup, redirect home.
  if (await isSetupComplete()) throw redirect(302, '/');
  if (!db) return { error: 'Database is not configured yet. Add DATABASE_URL to your environment first.' };
  return { error: null };
};
