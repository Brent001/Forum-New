import type { PageServerLoad } from './$types.js';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { communities, communityMemberships } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const load: PageServerLoad = async (event) => {
	if (!db) return { communities: [], viewer: null, query: '' };
	const query = (event.url.searchParams.get('q') ?? '').trim().slice(0, 80);
	const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
	const [actor, rows] = await Promise.all([
		getActor(event),
		db.select().from(communities)
			.where(query.length > 1 ? or(ilike(communities.name, pattern), ilike(communities.description, pattern), ilike(communities.category, pattern)) : undefined)
			.orderBy(desc(communities.isFeatured), desc(communities.memberCount)).limit(100)
	]);
	const communityIds = rows.map((community) => community.id);
	const memberships = actor && communityIds.length ? await db.select({ communityId: communityMemberships.communityId }).from(communityMemberships).where(and(eq(communityMemberships.userId, actor.id), inArray(communityMemberships.communityId, communityIds))) : [];
	const joined = new Set(memberships.map((item) => item.communityId));
	return { communities: rows.map((row) => ({ ...row, isJoined: joined.has(row.id) })), viewer: actor ? { id: actor.id, isOwner: actor.isOwner } : null, query };
};
