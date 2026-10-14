import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { verificationRequests } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const load: PageServerLoad = async (event) => {
	const actor = await getActor(event);
	if (!actor) throw redirect(302, '/login?callbackURL=%2Fsettings');
	const [latestVerification] = db ? await db.select({ id: verificationRequests.id, reason: verificationRequests.reason, status: verificationRequests.status, reviewerNote: verificationRequests.reviewerNote, createdAt: verificationRequests.createdAt }).from(verificationRequests).where(eq(verificationRequests.userId, actor.id)).orderBy(desc(verificationRequests.createdAt)).limit(1) : [];
	return {
		verification: { isVerified: actor.isVerified, latest: latestVerification ?? null },
		profile: {
			username: actor.username ?? actor.id,
			displayName: actor.displayName ?? actor.username ?? 'Member',
			bio: actor.bio ?? '',
			avatarUrl: actor.avatarUrl ?? '',
			bannerUrl: actor.bannerUrl ?? '',
			profileVisibility: actor.profileVisibility ?? 'public',
			dmPolicy: actor.dmPolicy ?? 'everyone',
			discoverable: actor.discoverable ?? true,
			preferredFeed: actor.preferredFeed ?? 'for-you',
			mutedKeywords: actor.mutedKeywords ?? [],
			isNsfwEnabled: actor.isNsfwEnabled ?? false,
			isOwner: actor.isOwner, karma: actor.karma, postKarma: actor.postKarma ?? 0, commentKarma: actor.commentKarma ?? 0
		}
	};
};
