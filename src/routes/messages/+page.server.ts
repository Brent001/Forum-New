import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { getActor } from '$lib/server/social.js';

export const load: PageServerLoad = async (event) => {
  const actor = await getActor(event);
  if (!actor) throw redirect(302, '/login?callbackURL=%2Fmessages');
  return { viewer: { id: actor.id, username: actor.username ?? actor.id, displayName: actor.displayName ?? actor.username ?? 'Member' } };
};
