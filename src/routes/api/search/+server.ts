import { json, type RequestHandler } from '@sveltejs/kit';
import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { communities, posts, users } from '$lib/server/db/schema.js';

export const GET: RequestHandler = async ({ url }) => {
	if (!db) return json({ posts: [], communities: [], users: [] });
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	if (query.length < 2) return json({ posts: [], communities: [], users: [] });
	const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
	const [postRows, communityRows, userRows] = await Promise.all([
		db.select({ id: posts.id, title: posts.title, body: posts.body, score: posts.score, commentCount: posts.commentCount, createdAt: posts.createdAt, username: users.username, communitySlug: communities.slug })
			.from(posts).leftJoin(users, eq(posts.authorId, users.id)).leftJoin(communities, eq(posts.communityId, communities.id))
			.where(and(eq(posts.isRemoved, false), or(eq(communities.isPrivate, false), isNull(communities.isPrivate)), or(ilike(posts.title, pattern), ilike(posts.body, pattern)))).orderBy(desc(posts.score), desc(posts.createdAt)).limit(10),
		db.select({ id: communities.id, name: communities.name, slug: communities.slug, description: communities.description, memberCount: communities.memberCount })
			.from(communities).where(and(eq(communities.isPrivate, false), or(ilike(communities.name, pattern), ilike(communities.description, pattern)))).orderBy(desc(communities.memberCount)).limit(5),
		db.select({ id: users.id, username: users.username, displayName: users.displayName, bio: users.bio, avatarUrl: users.avatarUrl, isVerified: users.isVerified })
			.from(users).where(and(eq(users.isBanned, false), or(ilike(users.username, pattern), ilike(users.displayName, pattern)))).limit(5)
	]);
	return json({ posts: postRows, communities: communityRows, users: userRows });
};
