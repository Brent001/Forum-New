import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { appSettings, comments, communities, moderationLogs, posts, privacyRequests, reports, supportTickets, users, verificationRequests } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const load: PageServerLoad = async (event) => {
	const actor = await getActor(event);
	if (!actor) throw redirect(302, '/login?callbackURL=%2Fadmin');
	if (!actor.isOwner) throw error(403, 'The owner studio is only available to the site owner.');
	if (!db) throw error(503, 'Database is not configured.');

	const [usersCount, postCount, commentCount, communityCount, openReportCount, recentUsers, recentPosts, reportRows, communityRows, logRows, settings, supportRows, privacyRows] = await Promise.all([
		db.select({ count: sql<number>`count(*)` }).from(users),
		db.select({ count: sql<number>`count(*)` }).from(posts),
		db.select({ count: sql<number>`count(*)` }).from(comments),
		db.select({ count: sql<number>`count(*)` }).from(communities),
		db.select({ count: sql<number>`count(*)` }).from(reports).where(eq(reports.status, 'open')),
		db.select({ id: users.id, username: users.username, displayName: users.displayName, email: users.email, role: users.role, isOwner: users.isOwner, isBanned: users.isBanned, banUntil: users.banUntil, isShadowBanned: users.isShadowBanned, isVerified: users.isVerified, createdAt: users.createdAt, karma: users.karma, postKarma: users.postKarma, commentKarma: users.commentKarma }).from(users).orderBy(desc(users.createdAt)).limit(15),
		db.select({ id: posts.id, title: posts.title, score: posts.score, commentCount: posts.commentCount, createdAt: posts.createdAt, isRemoved: posts.isRemoved, isStickied: posts.isStickied, isLocked: posts.isLocked, authorId: users.id, author: users.username, community: communities.slug }).from(posts).leftJoin(users, eq(posts.authorId, users.id)).leftJoin(communities, eq(posts.communityId, communities.id)).orderBy(desc(posts.createdAt)).limit(15),
		db.select({ id: reports.id, targetType: reports.targetType, targetId: reports.targetId, reason: reports.reason, details: reports.details, status: reports.status, createdAt: reports.createdAt, reporter: users.username, postTitle: posts.title })
			.from(reports).leftJoin(users, eq(reports.reporterId, users.id)).leftJoin(posts, and(eq(reports.targetType, 'post'), eq(posts.id, reports.targetId))).where(eq(reports.status, 'open')).orderBy(desc(reports.createdAt)).limit(40),
		db.select({ id: communities.id, name: communities.name, slug: communities.slug, memberCount: communities.memberCount, isFeatured: communities.isFeatured, isPrivate: communities.isPrivate, category: communities.category }).from(communities).orderBy(desc(communities.memberCount)).limit(12),
		db.select({ id: moderationLogs.id, action: moderationLogs.action, targetType: moderationLogs.targetType, targetId: moderationLogs.targetId, reason: moderationLogs.reason, createdAt: moderationLogs.createdAt, actor: users.username }).from(moderationLogs).leftJoin(users, eq(moderationLogs.actorId, users.id)).orderBy(desc(moderationLogs.createdAt)).limit(20),
		db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1),
	db.select({ id: supportTickets.id, category: supportTickets.category, subject: supportTickets.subject, message: supportTickets.message, status: supportTickets.status, createdAt: supportTickets.createdAt, username: users.username, email: supportTickets.contactEmail }).from(supportTickets).leftJoin(users, eq(users.id, supportTickets.userId)).where(eq(supportTickets.status, 'open')).orderBy(desc(supportTickets.createdAt)).limit(50),
	db.select({ id: privacyRequests.id, requestType: privacyRequests.requestType, details: privacyRequests.details, status: privacyRequests.status, createdAt: privacyRequests.createdAt, username: users.username }).from(privacyRequests).leftJoin(users, eq(users.id, privacyRequests.userId)).where(eq(privacyRequests.status, 'received')).orderBy(desc(privacyRequests.createdAt)).limit(50)
	]);

	const verificationRows = await db.select({ id: verificationRequests.id, userId: verificationRequests.userId, reason: verificationRequests.reason, evidenceUrl: verificationRequests.evidenceUrl, status: verificationRequests.status, createdAt: verificationRequests.createdAt, username: users.username, displayName: users.displayName }).from(verificationRequests).innerJoin(users, eq(users.id, verificationRequests.userId)).where(eq(verificationRequests.status, 'pending')).orderBy(desc(verificationRequests.createdAt)).limit(50);

	return {
		viewer: { id: actor.id, name: actor.displayName ?? actor.username ?? 'Owner', username: actor.username ?? actor.id },
		stats: { users: Number(usersCount[0]?.count ?? 0), posts: Number(postCount[0]?.count ?? 0), comments: Number(commentCount[0]?.count ?? 0), communities: Number(communityCount[0]?.count ?? 0), openReports: Number(openReportCount[0]?.count ?? 0) },
		verificationRequests: verificationRows.map((row) => ({ ...row, username: row.username ?? 'member', displayName: row.displayName ?? row.username ?? 'Member' })),
		users: recentUsers.map((user) => ({ ...user, username: user.username ?? 'member', displayName: user.displayName ?? user.username ?? 'Member' })),
		posts: recentPosts.map((post) => ({ ...post, author: post.author ?? 'anonymous', community: post.community ?? 'general' })),
		reports: reportRows.map((report) => ({ ...report, reporter: report.reporter ?? 'member', postTitle: report.postTitle ?? null })),
		communities: communityRows,
		logs: logRows.map((log) => ({ ...log, actor: log.actor ?? 'owner' })),
		settings: settings[0] ?? null,
		supportTickets: supportRows.map((ticket) => ({ ...ticket, username: ticket.username ?? 'deleted member' })),
		privacyRequests: privacyRows.map((request) => ({ ...request, username: request.username ?? 'member' }))
	};
};
