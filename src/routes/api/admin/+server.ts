import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, ne, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { appSettings, comments, communities, communityEmotes, mediaAssets, moderationLogs, posts, privacyRequests, reports, supportTickets, users, verificationRequests, votes } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';
import { getPrivateB2Config } from '$lib/server/b2-config.js';
import { getB2ConfigForObjectKey, isObjectInPublicBucket, verifyB2BucketAccess } from '$lib/storage/b2.js';

export const POST: RequestHandler = async (event) => {
	if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
	const actor = await getActor(event);
	if (!actor) return json({ error: 'Sign in to continue.' }, { status: 401 });
	if (!actor.isOwner) return json({ error: 'Owner privileges are required.' }, { status: 403 });
	const body = await event.request.json().catch(() => null);
	if (!body || typeof body !== 'object') return json({ error: 'Invalid request body.' }, { status: 400 });
	const action = String(body.action ?? '');
	const targetId = String(body.targetId ?? '').trim();
	const reason = String(body.reason ?? '').trim().slice(0, 500) || null;
	let targetType = String(body.targetType ?? '');
	let logId = targetId;

	try {
		switch (action) {
			case 'removePost':
				if (!targetId) return json({ error: 'A post ID is required.' }, { status: 400 });
				await db.update(posts).set({ isRemoved: true, removedReason: reason ?? 'Removed by the site owner.', removedBy: actor.id }).where(eq(posts.id, targetId));
				targetType = 'post';
				break;
			case 'restorePost':
				await db.update(posts).set({ isRemoved: false, removedReason: null, removedBy: null }).where(eq(posts.id, targetId));
				targetType = 'post';
				break;
			case 'pinPost': {
				const [post] = await db.select({ isStickied: posts.isStickied }).from(posts).where(eq(posts.id, targetId)).limit(1);
				if (!post) return json({ error: 'Post not found.' }, { status: 404 });
				await db.update(posts).set({ isStickied: !post.isStickied }).where(eq(posts.id, targetId));
				targetType = 'post';
				break;
			}
			case 'lockPost': {
				const [post] = await db.select({ isLocked: posts.isLocked }).from(posts).where(eq(posts.id, targetId)).limit(1);
				if (!post) return json({ error: 'Post not found.' }, { status: 404 });
				await db.update(posts).set({ isLocked: !post.isLocked }).where(eq(posts.id, targetId));
				targetType = 'post';
				break;
			}
			case 'featureCommunity': {
				const [community] = await db.select({ isFeatured: communities.isFeatured }).from(communities).where(eq(communities.id, targetId)).limit(1);
				if (!community) return json({ error: 'Community not found.' }, { status: 404 });
				await db.update(communities).set({ isFeatured: !community.isFeatured }).where(eq(communities.id, targetId));
				targetType = 'community';
				break;
			}
			case 'togglePrivateCommunity': {
				const [community] = await db.select({ isPrivate: communities.isPrivate }).from(communities).where(eq(communities.id, targetId)).limit(1);
				if (!community) return json({ error: 'Community not found.' }, { status: 404 });
				if (!community.isPrivate) {
					// Do not turn public B2 objects into private-community attachments: a public
					// bucket cannot revoke anonymous reads at object level.
					const linkedAssets = await db.select({ objectKey: mediaAssets.objectKey }).from(mediaAssets)
						.leftJoin(posts, eq(mediaAssets.referenceId, posts.id))
						.leftJoin(communityEmotes, eq(mediaAssets.referenceId, communityEmotes.id))
						.where(or(
							and(eq(mediaAssets.referenceType, 'post'), eq(posts.communityId, targetId)),
							and(eq(mediaAssets.referenceType, 'community-icon'), eq(mediaAssets.referenceId, targetId)),
							and(eq(mediaAssets.referenceType, 'community-banner'), eq(mediaAssets.referenceId, targetId)),
							and(eq(mediaAssets.referenceType, 'community-emote'), eq(communityEmotes.communityId, targetId))
						));
					if (linkedAssets.length) {
						try {
							const b2 = getPrivateB2Config();
							for (const asset of linkedAssets) await verifyB2BucketAccess(getB2ConfigForObjectKey(b2, asset.objectKey));
							if (linkedAssets.some((asset) => isObjectInPublicBucket(b2, asset.objectKey))) return json({ error: 'This community still references media stored in a public bucket. Re-upload or remove the community artwork, emotes, and attachments into private storage before making the community private.' }, { status: 409 });
						} catch (error) {
							return json({ error: error instanceof Error ? error.message : 'Could not verify community media storage.' }, { status: 503 });
						}
					}
				}
				await db.update(communities).set({ isPrivate: !community.isPrivate }).where(eq(communities.id, targetId));
				targetType = 'community';
				break;
			}
			case 'removeComment':
				await db.update(comments).set({ isRemoved: true, removedReason: reason ?? 'Removed by the site owner.' }).where(eq(comments.id, targetId));
				targetType = 'comment';
				break;
			case 'resolveReport':
			case 'dismissReport':
				await db.update(reports).set({ status: action === 'resolveReport' ? 'resolved' : 'dismissed', reviewedBy: actor.id, reviewedAt: new Date() }).where(eq(reports.id, targetId));
				targetType = 'report';
				break;
			case 'takeDownReport': {
				const [report] = await db.select().from(reports).where(eq(reports.id, targetId)).limit(1);
				if (!report) return json({ error: 'Report not found.' }, { status: 404 });
				if (report.targetType === 'post') {
					await db.update(posts).set({ isRemoved: true, removedReason: `Reported: ${report.reason}`, removedBy: actor.id }).where(eq(posts.id, report.targetId));
				} else if (report.targetType === 'comment') {
					await db.update(comments).set({ isRemoved: true, removedReason: `Reported: ${report.reason}` }).where(eq(comments.id, report.targetId));
				}
				await db.update(reports).set({ status: 'resolved', reviewedBy: actor.id, reviewedAt: new Date() }).where(eq(reports.id, targetId));
				targetType = 'report';
				break;
			}
			case 'tempBanUser': {
				const hours = Math.max(1, Math.min(8760, Number(body.durationHours) || 24));
				const [target] = await db.select({ id: users.id, isOwner: users.isOwner }).from(users).where(eq(users.id, targetId)).limit(1);
				if (!target) return json({ error: 'User not found.' }, { status: 404 });
				if (target.isOwner || target.id === actor.id) return json({ error: 'The owner cannot be temporarily banned here.' }, { status: 403 });
				await db.update(users).set({ isBanned: false, banUntil: new Date(Date.now() + hours * 60 * 60 * 1000), banReason: reason ?? 'Temporary suspension by site owner.' }).where(eq(users.id, targetId));
				targetType = 'user';
				break;
			}
			case 'shadowBanUser':
			case 'unshadowBanUser': {
				const [target] = await db.select({ id: users.id, isOwner: users.isOwner }).from(users).where(eq(users.id, targetId)).limit(1);
				if (!target) return json({ error: 'User not found.' }, { status: 404 });
				if (target.isOwner || target.id === actor.id) return json({ error: 'The owner cannot be shadow-banned here.' }, { status: 403 });
				await db.update(users).set({ isShadowBanned: action === 'shadowBanUser' }).where(eq(users.id, targetId));
				targetType = 'user';
				break;
			}
			case 'banUser':
			case 'unbanUser': {
				const [target] = await db.select({ id: users.id, isOwner: users.isOwner }).from(users).where(eq(users.id, targetId)).limit(1);
				if (!target) return json({ error: 'User not found.' }, { status: 404 });
				if (target.isOwner || target.id === actor.id) return json({ error: 'The owner cannot be banned or change their own account status here.' }, { status: 403 });
				await db.update(users).set({ isBanned: action === 'banUser', banUntil: null, banReason: action === 'banUser' ? reason ?? 'Suspended by site owner.' : null }).where(eq(users.id, targetId));
				targetType = 'user';
				break;
			}
			case 'setRole': {
				const role = String(body.role ?? 'member');
				if (!['member', 'moderator', 'admin'].includes(role)) return json({ error: 'Choose member, moderator, or admin.' }, { status: 400 });
				const [target] = await db.select({ id: users.id, isOwner: users.isOwner }).from(users).where(eq(users.id, targetId)).limit(1);
				if (!target) return json({ error: 'User not found.' }, { status: 404 });
				if (target.isOwner || target.id === actor.id) return json({ error: 'The owner role cannot be changed here.' }, { status: 403 });
				await db.update(users).set({ role, isAdmin: role === 'admin' }).where(eq(users.id, targetId));
				targetType = 'user';
				break;
			}
			case 'verifyUser': {
				const [target] = await db.select({ id: users.id, isOwner: users.isOwner }).from(users).where(eq(users.id, targetId)).limit(1);
				if (!target) return json({ error: 'User not found.' }, { status: 404 });
				await db.update(users).set({ isVerified: Boolean(body.verified) }).where(eq(users.id, targetId));
				targetType = 'user';
				break;
			}
			case 'approveVerificationRequest':
			case 'rejectVerificationRequest': {
				const [request] = await db.select({ id: verificationRequests.id, userId: verificationRequests.userId, status: verificationRequests.status }).from(verificationRequests).where(eq(verificationRequests.id, targetId)).limit(1);
				if (!request) return json({ error: 'Verification request not found.' }, { status: 404 });
				if (request.status !== 'pending') return json({ error: 'This verification request has already been reviewed.' }, { status: 409 });
				const approved = action === 'approveVerificationRequest';
				await db.transaction(async (tx) => {
					await tx.update(verificationRequests).set({ status: approved ? 'approved' : 'rejected', reviewedBy: actor.id, reviewedAt: new Date(), reviewerNote: String(body.reviewNote ?? reason ?? '').trim().slice(0, 1000) || null }).where(eq(verificationRequests.id, targetId));
					if (approved) await tx.update(users).set({ isVerified: true }).where(eq(users.id, request.userId));
					else await tx.update(users).set({ isVerified: false }).where(eq(users.id, request.userId));
				});
				targetType = 'verification-request';
				break;
			}
			case 'rebuildKarma': {
				const postTotals = await db.select({ userId: posts.authorId, total: sql<number>`COALESCE(SUM(${votes.value}), 0)` }).from(posts)
					.leftJoin(votes, and(eq(votes.targetId, posts.id), eq(votes.targetType, 'post'), ne(votes.userId, posts.authorId)))
					.where(eq(posts.isRemoved, false)).groupBy(posts.authorId);
				const commentTotals = await db.select({ userId: comments.authorId, total: sql<number>`COALESCE(SUM(${votes.value}), 0)` }).from(comments)
					.innerJoin(posts, eq(comments.postId, posts.id))
					.leftJoin(votes, and(eq(votes.targetId, comments.id), eq(votes.targetType, 'comment'), ne(votes.userId, comments.authorId)))
					.where(and(eq(comments.isRemoved, false), eq(posts.isRemoved, false))).groupBy(comments.authorId);
				const postMap = new Map(postTotals.map((row) => [row.userId, Number(row.total ?? 0)]));
				const commentMap = new Map(commentTotals.map((row) => [row.userId, Number(row.total ?? 0)]));
				const allUsers = await db.select({ id: users.id }).from(users);
				await db.transaction(async (tx) => {
					for (const user of allUsers) {
						const postKarma = postMap.get(user.id) ?? 0;
						const commentKarma = commentMap.get(user.id) ?? 0;
						await tx.update(users).set({ postKarma, commentKarma, karma: postKarma + commentKarma }).where(eq(users.id, user.id));
					}
				});
				targetType = 'reputation';
				logId = 'all-users';
				break;
			}
			case 'resolveSupportTicket':
			case 'closeSupportTicket': {
				const [ticket] = await db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, targetId)).limit(1);
				if (!ticket) return json({ error: 'Support ticket not found.' }, { status: 404 });
				await db.update(supportTickets).set({ status: action === 'resolveSupportTicket' ? 'resolved' : 'closed', assignedTo: actor.id, updatedAt: new Date() }).where(eq(supportTickets.id, targetId));
				targetType = 'support-ticket';
				break;
			}
			case 'resolvePrivacyRequest':
			case 'rejectPrivacyRequest': {
				const note = String(body.resolutionNote ?? reason ?? '').trim().slice(0, 1000) || null;
				const [request] = await db.select({ id: privacyRequests.id }).from(privacyRequests).where(eq(privacyRequests.id, targetId)).limit(1);
				if (!request) return json({ error: 'Privacy request not found.' }, { status: 404 });
				await db.update(privacyRequests).set({ status: action === 'resolvePrivacyRequest' ? 'resolved' : 'rejected', resolutionNote: note, reviewedBy: actor.id, updatedAt: new Date() }).where(eq(privacyRequests.id, targetId));
				targetType = 'privacy-request';
				break;
			}
			case 'updateSettings': {
				const [settings] = await db.select({ id: appSettings.id }).from(appSettings).where(eq(appSettings.id, 1)).limit(1);
				if (!settings) return json({ error: 'Site settings are not initialized.' }, { status: 409 });
				const updates: Record<string, unknown> = { updatedAt: new Date() };
				if (typeof body.allowRegistration === 'boolean') updates.allowRegistration = body.allowRegistration;
				if (typeof body.inviteOnly === 'boolean') updates.inviteOnly = body.inviteOnly;
				if (typeof body.enableNsfw === 'boolean') updates.enableNsfw = body.enableNsfw;
				if (typeof body.enableRealtimeFeed === 'boolean') updates.enableRealtimeFeed = body.enableRealtimeFeed;
				if (typeof body.tagline === 'string') updates.tagline = body.tagline.trim().slice(0, 200);
				if (typeof body.defaultSort === 'string' && ['for-you', 'hot', 'best', 'new', 'rising', 'top'].includes(body.defaultSort)) updates.defaultSort = body.defaultSort;
				if (body.postRateLimitPerHour !== undefined) updates.postRateLimitPerHour = Math.max(1, Math.min(100, Number(body.postRateLimitPerHour) || 10));
				await db.update(appSettings).set(updates as any).where(eq(appSettings.id, 1));
				targetType = 'settings';
				logId = 'site';
				break;
			}
			default:
				return json({ error: 'Unknown moderation action.' }, { status: 400 });
		}

		await db.insert(moderationLogs).values({
			id: crypto.randomUUID(), actorId: actor.id, action,
			targetType: targetType || 'unknown', targetId: logId || 'unknown', reason
		});
		return json({ ok: true, action });
	} catch (error) {
		console.error('[admin action]', error);
		return json({ error: 'The action could not be completed.' }, { status: 500 });
	}
};
