import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { communities, communityMemberships } from '$lib/server/db/schema.js';
import { getActor, getCommunityBan } from '$lib/server/social.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to join communities.' }, { status: 401 });
	const communityId = event.params.id;
	const [community] = await db.select({ id: communities.id, isPrivate: communities.isPrivate }).from(communities).where(eq(communities.id, communityId)).limit(1);
	if (!community) return json({ error: 'Community not found.' }, { status: 404 });
	const communityBan = await getCommunityBan(actor.id, communityId);
	if (communityBan) return json({ error: communityBan.reason || 'You are banned from this community.' }, { status: 403 });
	if (community.isPrivate) return json({ error: 'This community is private. Ask a moderator for an invite.' }, { status: 403 });
	const whereMembership = and(eq(communityMemberships.userId, actor.id), eq(communityMemberships.communityId, communityId));
	const [existing] = await db.select().from(communityMemberships).where(whereMembership).limit(1);
	if (existing) {
		await db.delete(communityMemberships).where(whereMembership);
		await db.update(communities).set({ memberCount: sql`greatest(${communities.memberCount} - 1, 0)` }).where(eq(communities.id, communityId));
		return json({ ok: true, joined: false });
	}
	await db.insert(communityMemberships).values({ userId: actor.id, communityId });
	await db.update(communities).set({ memberCount: sql`${communities.memberCount} + 1` }).where(eq(communities.id, communityId));
	return json({ ok: true, joined: true });
};
