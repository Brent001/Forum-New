import { db } from '$lib/server/db/index.js';
import { bookmarks, follows, posts } from '$lib/server/db/schema.js';
import { eq, gt, sql } from 'drizzle-orm';
import { hotScore, qualityScore, rankPost, trendingScore } from './ranking.js';
import type { PostSignals } from './ranking.js';
import { isSetupComplete } from '$lib/server/setup.js';

let interval: ReturnType<typeof setInterval> | null = null;
let consecutiveAuthFailures = 0;
const MAX_AUTH_FAILURES = 3;

export async function startScoreUpdater() {
	const database = db;
	if (!database || interval) return;

	const setupReady = await isSetupComplete();
	if (!setupReady) return;

	interval = setInterval(async () => {
		try {
			const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
			const recentPosts = await database.select().from(posts).where(gt(posts.createdAt, since));

			for (const post of recentPosts) {
				const bookmarkCountResult = await database
					.select({ count: sql`count(*)` })
					.from(bookmarks)
					.where(eq(bookmarks.postId, post.id));

				const followerCountResult = await database
					.select({ count: sql`count(*)` })
					.from(follows)
					.where(eq(follows.followingId, post.authorId));

				const bookmarkCount = Number(bookmarkCountResult[0]?.count ?? 0);
				const authorFollowers = Number(followerCountResult[0]?.count ?? 0);

				const signals: PostSignals = {
					upvotes: post.upvoteCount ?? 0,
					downvotes: post.downvoteCount ?? 0,
					viewCount: post.viewCount ?? 0,
					createdAt: post.createdAt,
					commentCount: post.commentCount ?? 0,
					shareCount: post.shareCount ?? 0,
					bookmarkCount,
					authorFollowers,
					authorKarma: 0,
					isStickied: post.isStickied ?? false,
				};

				await database.update(posts).set({
					score: (post.upvoteCount ?? 0) - (post.downvoteCount ?? 0),
					hotScore: hotScore(signals),
					trendingScore: trendingScore(signals),
					qualityScore: qualityScore(signals),
					rankScore: rankPost(signals, 'hot')
				}).where(eq(posts.id, post.id));
			}
			
			// Reset failure counter on success
			consecutiveAuthFailures = 0;
		} catch (error) {
			console.error('Failed to refresh post scores:', error);
			
			// Check if this is an authentication error
			const errorMessage = error instanceof Error ? error.message : String(error);
			const isAuthError = errorMessage.includes('password authentication failed') ||
			                   errorMessage.includes('28P01');
			
			if (isAuthError) {
				consecutiveAuthFailures++;
				console.error(`Database authentication failed (${consecutiveAuthFailures}/${MAX_AUTH_FAILURES}). Please check your DATABASE_URL in .env file.`);
				
				if (consecutiveAuthFailures >= MAX_AUTH_FAILURES) {
					console.error('Too many authentication failures. Stopping score updater. Please fix your database credentials and restart the server.');
					if (interval) {
						clearInterval(interval);
						interval = null;
					}
				}
			}
		}
	}, 5 * 60 * 1000);
}
