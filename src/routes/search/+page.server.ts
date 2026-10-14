import type { PageServerLoad } from './$types.js';
import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { communities, posts, users } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const load: PageServerLoad = async (event) => {
	const query = (event.url.searchParams.get('q') ?? '').trim().slice(0, 100);
	const actor = await getActor(event);
	if (!db || query.length < 2) return { query, posts: [], communities: [], people: [], viewer: actor ? { id: actor.id, username: actor.username ?? actor.id } : null };
	const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
	const [postRows, communityRows, peopleRows] = await Promise.all([
		db.select({ id: posts.id, title: posts.title, body: posts.body, authorId: posts.authorId, authorShadowBanned: users.isShadowBanned, score: posts.score, commentCount: posts.commentCount, createdAt: posts.createdAt, username: users.username, communitySlug: communities.slug, communityName: communities.name })
			.from(posts).leftJoin(users, eq(posts.authorId, users.id)).leftJoin(communities, eq(posts.communityId, communities.id))
			.where(and(eq(posts.isRemoved, false), eq(users.isShadowBanned, false), or(eq(communities.isPrivate, false), isNull(communities.isPrivate)), or(ilike(posts.title, pattern), ilike(posts.body, pattern))))
			.orderBy(desc(posts.score), desc(posts.createdAt)).limit(30),
		db.select({ id: communities.id, name: communities.name, slug: communities.slug, description: communities.description, category: communities.category, memberCount: communities.memberCount })
			.from(communities).where(and(eq(communities.isPrivate, false), or(ilike(communities.name, pattern), ilike(communities.description, pattern))))
			.orderBy(desc(communities.memberCount)).limit(15),
		db.select({ id: users.id, username: users.username, displayName: users.displayName, bio: users.bio, avatarUrl: users.avatarUrl, isVerified: users.isVerified, karma: users.karma })
			.from(users).where(and(eq(users.isBanned, false), eq(users.isShadowBanned, false), eq(users.discoverable, true), or(ilike(users.username, pattern), ilike(users.displayName, pattern), ilike(users.bio, pattern))))
			.orderBy(desc(users.karma)).limit(15)
	]);
	return {
		query,
		posts: postRows.map((post) => ({ ...post, body: post.body ?? '', username: post.username ?? 'member', communitySlug: post.communitySlug ?? 'general', communityName: post.communityName ?? 'General' })),
		communities: communityRows,
		people: peopleRows.filter((person) => person.username).map((person) => ({ ...person, username: person.username!, displayName: person.displayName ?? person.username! })),
		viewer: actor ? { id: actor.id, username: actor.username ?? actor.id } : null
	};
};
