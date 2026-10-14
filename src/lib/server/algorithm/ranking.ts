export interface PostSignals {
	upvotes: number;
	downvotes: number;
	viewCount: number;
	createdAt: Date;
	commentCount: number;
	shareCount: number;
	bookmarkCount?: number;
	authorFollowers?: number;
	authorKarma?: number;
	isStickied: boolean;
}

export function wilsonScore(upvotes: number, downvotes: number): number {
	const n = upvotes + downvotes;
	if (n === 0) return 0;
	const z = 1.96; // 95% confidence
	const phat = upvotes / n;
	return (
		(phat + (z * z) / (2 * n) - z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n)) /
		(1 + (z * z) / n)
	);
}

export function hotScore(signals: PostSignals): number {
	const score = signals.upvotes - signals.downvotes;
	const order = Math.log10(Math.max(Math.abs(score), 1));
	const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
	const epochSeconds = signals.createdAt.getTime() / 1000;
	const seconds = epochSeconds - 1134028003;
	return sign * order + seconds / 45000;
}

export function trendingScore(signals: PostSignals): number {
	const ageHours = Math.max((Date.now() - signals.createdAt.getTime()) / (1000 * 60 * 60), 1);
	const decay = Math.pow(0.85, ageHours);

	const engagementScore =
		signals.upvotes * 30 +
		signals.commentCount * 20 +
		signals.shareCount * 20 +
		(signals.bookmarkCount ?? 0) * 1 +
		signals.viewCount * 0.5;

	const karmaMultiplier = Math.min(1 + Math.log10((signals.authorKarma ?? 0) + 1) * 0.1, 2.0);
	const followerMultiplier = Math.min(1 + Math.log10((signals.authorFollowers ?? 0) + 1) * 0.05, 1.5);

	return engagementScore * decay * karmaMultiplier * followerMultiplier;
}

export function qualityScore(signals: PostSignals): number {
	if (signals.viewCount === 0) return 0;
	const engagements = signals.upvotes + signals.commentCount * 2 + signals.shareCount * 3 + (signals.bookmarkCount ?? 0);
	const engagementRate = engagements / signals.viewCount;
	const upvoteRatio = signals.upvotes / Math.max(signals.upvotes + signals.downvotes, 1);
	return engagementRate * upvoteRatio * 100;
}

export type SortMode = 'hot' | 'top' | 'new' | 'best' | 'rising' | 'controversial';

export function rankPost(signals: PostSignals, mode: SortMode): number {
	if (signals.isStickied) return Infinity;

	switch (mode) {
		case 'hot':
			return hotScore(signals);
		case 'top':
			return signals.upvotes - signals.downvotes;
		case 'new':
			return signals.createdAt.getTime();
		case 'best':
			return wilsonScore(signals.upvotes, signals.downvotes);
		case 'rising':
			return trendingScore(signals);
		case 'controversial': {
			const s = signals.upvotes + signals.downvotes;
			const r = signals.upvotes > 0 ? signals.downvotes / signals.upvotes : 0;
			return s * r;
		}
		default:
			return hotScore(signals);
	}
}

/**
 * A lightweight, explainable X-inspired score for the For You feed.
 *
 * This is intentionally a heuristic scorer, not a claim to reproduce X's
 * Phoenix transformer inference. It follows the public design described by
 * xai-org/x-algorithm: combine estimated probabilities of several actions,
 * then apply author-diversity, network, freshness, and discovery adjustments.
 */
export interface ForYouSignals extends PostSignals {
	viewCount: number;
	bodyLength?: number;
	isFollowedAuthor?: boolean;
	isFollowedCommunity?: boolean;
	authorPostCountInFeed?: number;
	authorIsNew?: boolean;
	viewerAlreadyInteracted?: boolean;
	negativeFeedback?: number;
	personalInterest?: number;
	ageHours?: number;
}

export interface ActionPredictions {
	like: number;
	reply: number;
	repost: number;
	bookmark: number;
	click: number;
	dwell: number;
	followAuthor: number;
	notInterested: number;
	report: number;
}

const clampProbability = (n: number) => Math.max(0, Math.min(1, n));

/** Smoothed empirical action estimates based on available aggregate signals. */
export function predictActions(signals: ForYouSignals): ActionPredictions {
	const impressions = Math.max(signals.viewCount, 12);
	const upvotes = Math.max(0, signals.upvotes);
	const comments = Math.max(0, signals.commentCount);
	const shares = Math.max(0, signals.shareCount);
	const bookmarksCount = Math.max(0, signals.bookmarkCount ?? 0);
	const interactions = upvotes + comments + shares + bookmarksCount;
	const followBoost = signals.isFollowedAuthor ? 0.08 : 0;

	return {
		like: clampProbability((upvotes + 0.7) / (impressions + 8) + followBoost),
		reply: clampProbability((comments + 0.25) / (impressions + 10)),
		repost: clampProbability((shares + 0.15) / (impressions + 12)),
		bookmark: clampProbability((bookmarksCount + 0.1) / (impressions + 15)),
		click: clampProbability((interactions + 1.5) / (impressions + 10)),
		// Proxy for reading time: substantive discussion and replies tend to retain attention.
		dwell: clampProbability((Math.min(comments, 30) * 0.012 + Math.min(signals.bodyLength ?? 0, 1600) / 16000) + 0.04),
		followAuthor: signals.isFollowedAuthor ? 0.015 : clampProbability((interactions + 0.3) / (impressions * 7 + 30)),
		notInterested: clampProbability((signals.negativeFeedback ?? 0) * 0.35),
		report: clampProbability((signals.negativeFeedback ?? 0) * 0.04)
	};
}

export function forYouScore(signals: ForYouSignals): number {
	const actions = predictActions(signals);

	// Weights are applied to predicted action probabilities, never raw counts.
	const actionValue =
		actions.like * 1.0 +
		actions.reply * 2.5 +
		actions.repost * 3.0 +
		actions.bookmark * 1.7 +
		actions.click * 0.45 +
		actions.dwell * 0.8 +
		actions.followAuthor * 1.15 -
		actions.notInterested * 1.8 -
		actions.report * 5.0;

	const ageHours = Math.max(0, signals.ageHours ?? (Date.now() - signals.createdAt.getTime()) / 3_600_000);
	const freshness = Math.exp(-ageHours / 54);
	const networkFactor = signals.isFollowedAuthor ? 1.18 : 0.86;
	const communityFactor = signals.isFollowedCommunity ? 1.14 : 1;
	const authorIndex = Math.max(1, signals.authorPostCountInFeed ?? 1);
	const authorDiversity = Math.max(0.58, 1 / Math.pow(authorIndex, 0.42));
	const newAuthorBoost = signals.authorIsNew ? 1.12 : 1;
	const personalInterest = 1 + Math.max(-0.35, Math.min(0.6, signals.personalInterest ?? 0));
	const alreadyInteractedPenalty = signals.viewerAlreadyInteracted ? 0.58 : 1;
	const explorationFloor = signals.authorIsNew ? 0.012 : 0;

	return Math.max(0, (actionValue + explorationFloor) * 100 * freshness * networkFactor * communityFactor * authorDiversity * newAuthorBoost * personalInterest * alreadyInteractedPenalty);
}
