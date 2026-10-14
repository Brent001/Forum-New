import type { PageServerLoad } from './$types.js';
export const load: PageServerLoad = async ({ params }) => ({ slug: params.slug });
