import {
	pgTable,
	text,
	integer,
	serial,
	boolean,
	timestamp,
	json,
	doublePrecision,
	primaryKey,
	index,
	uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: text('id').primaryKey(),
	username: text('username'),
	email: text('email').notNull(),
	displayName: text('display_name'),
	emailVerified: boolean('email_verified').default(false).notNull(),
	bio: text('bio'),
	avatarUrl: text('avatar_url'),
	bannerUrl: text('banner_url'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	isAdmin: boolean('is_admin').default(false).notNull(),
	isBanned: boolean('is_banned').default(false).notNull(),
	banReason: text('ban_reason'),
	banUntil: timestamp('ban_until'),
	isShadowBanned: boolean('is_shadow_banned').default(false).notNull(),
	profileVisibility: text('profile_visibility').default('public').notNull(),
	dmPolicy: text('dm_policy').default('everyone').notNull(),
	discoverable: boolean('discoverable').default(true).notNull(),
	// Owner is distinct from ordinary administrators and moderators.
	isOwner: boolean('is_owner').default(false).notNull(),
	role: text('role').default('member').notNull(),
	karma: integer('karma').default(0).notNull(),
	postKarma: integer('post_karma').default(0).notNull(),
	commentKarma: integer('comment_karma').default(0).notNull(),
	isVerified: boolean('is_verified').default(false).notNull(),
	preferredFeed: text('preferred_feed').default('for-you').notNull(),
	mutedKeywords: json('muted_keywords').$type<string[]>().default([]).notNull(),
	isNsfwEnabled: boolean('is_nsfw_enabled').default(false).notNull(),
	lastSeenAt: timestamp('last_seen_at')
});

export const sessions = pgTable('session', {
	id: text('id').primaryKey(),
	token: text('session_token').notNull(),
	userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
	expiresAt: timestamp('expires').notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Better Auth's Drizzle adapter expects these property names. Keep the existing
// physical column names for accountId/providerId so existing installations can
// migrate with `npm run db:push` without losing linked-account identifiers.
export const accounts = pgTable('account', {
	id: text('id').primaryKey(),
	accountId: text('provider_account_id').notNull(),
	providerId: text('provider').notNull(),
	userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
	// Legacy column retained with a default so Better Auth inserts do not fail.
	type: text('type').default('credential').notNull(),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const verifications = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('token').notNull(),
	expiresAt: timestamp('expires').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow()
});

export const communities = pgTable('communities', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	slug: text('slug').notNull(),
	createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
	iconUrl: text('icon_url'),
	bannerUrl: text('banner_url'),
	memberCount: integer('member_count').default(0).notNull(),
	category: text('category').default('General').notNull(),
	communityType: text('community_type').default('standard').notNull(),
	communitySettings: json('community_settings').$type<Record<string, unknown>>().default({}).notNull(),
	isFeatured: boolean('is_featured').default(false).notNull(),
	isPrivate: boolean('is_private').default(false).notNull(),
	rules: json('rules').$type<Array<{ title: string; description: string }>>(),
	exclusiveEmotes: json('exclusive_emotes').$type<Array<{ code: string; imageUrl: string; isAnimated?: boolean }>>().default([]).notNull()
}, (t) => ({ slugUnique: uniqueIndex('communities_slug_unique').on(t.slug) }));



/** Community-scoped bans. A NULL expires_at means a permanent community ban. */
export const communityBans = pgTable(
	'community_bans',
	{
		communityId: text('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
		userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		reason: text('reason'),
		expiresAt: timestamp('expires_at'),
		createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => ({ pk: primaryKey({ columns: [t.communityId, t.userId] }), expiresIdx: index('community_bans_expires_idx').on(t.expiresAt) })
);

export const communityMemberships = pgTable(
	'community_memberships',
	{
		userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		communityId: text('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
		joinedAt: timestamp('joined_at').defaultNow().notNull()
	},
	(t) => ({ pk: primaryKey({ columns: [t.userId, t.communityId] }), communityIdx: index('community_memberships_community_idx').on(t.communityId) })
);

export const posts = pgTable(
	'posts',
	{
		id: text('id').primaryKey(),
		idempotencyKey: text('idempotency_key'),
		authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		communityId: text('community_id').references(() => communities.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		body: text('body'),
		url: text('url'),
		media: json('media'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
		score: integer('score').default(0).notNull(),
		upvoteCount: integer('upvote_count').default(0).notNull(),
		downvoteCount: integer('downvote_count').default(0).notNull(),
		commentCount: integer('comment_count').default(0).notNull(),
		viewCount: integer('view_count').default(0).notNull(),
		shareCount: integer('share_count').default(0).notNull(),
		isStickied: boolean('is_stickied').default(false).notNull(),
		isNsfw: boolean('is_nsfw').default(false).notNull(),
		hotScore: doublePrecision('hot_score').default(0).notNull(),
		trendingScore: doublePrecision('trending_score').default(0).notNull(),
		qualityScore: doublePrecision('quality_score').default(0).notNull(),
		rankScore: doublePrecision('rank_score').default(0).notNull(),
		searchVector: text('search_vector'),
		postType: text('post_type').default('discussion').notNull(),
		flair: text('flair'),
		isLocked: boolean('is_locked').default(false).notNull(),
		isRemoved: boolean('is_removed').default(false).notNull(),
		removedReason: text('removed_reason'),
		removedBy: text('removed_by').references(() => users.id, { onDelete: 'set null' }),
		poll: json('poll').$type<{ options: Array<{ id: string; text: string; votes: number }>; endsAt?: string } | null>()
	},
	(t) => ({
		hotScoreIdx: index('posts_hot_score_idx').on(t.hotScore.desc()),
		recentIdx: index('posts_recent_idx').on(t.createdAt.desc()),
		searchIdx: index('posts_search_idx').on(t.searchVector),
		communityFeedIdx: index('posts_community_feed_idx').on(t.communityId, t.isRemoved, t.isStickied.desc(), t.createdAt.desc()),
		idempotencyUnique: uniqueIndex('posts_idempotency_key_unique').on(t.idempotencyKey)
	})
);

export const comments = pgTable('comments', {
	id: text('id').primaryKey(),
	postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
	authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	parentId: text('parent_id'),
	content: text('content').notNull(),
	gifUrl: text('gif_url'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	path: text('path').notNull(),
	score: integer('score').default(0).notNull(),
	isRemoved: boolean('is_removed').default(false).notNull(),
	isPinned: boolean('is_pinned').default(false).notNull(),
	removedReason: text('removed_reason')
});

export const votes = pgTable(
	'votes',
	{
		userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		targetId: text('target_id').notNull(),
		targetType: text('target_type').notNull(),
		value: integer('value').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => ({ pk: primaryKey({ columns: [t.userId, t.targetId, t.targetType] }), targetIdx: index('votes_target_idx').on(t.targetType, t.targetId) })
);

/** Auditable deltas used to keep reputation tied to the current vote state. */
export const karmaEvents = pgTable(
	'karma_events',
	{
		id: text('id').primaryKey(),
		actorId: text('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		recipientId: text('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		targetId: text('target_id').notNull(),
		targetType: text('target_type').notNull(),
		previousValue: integer('previous_value').default(0).notNull(),
		newValue: integer('new_value').default(0).notNull(),
		delta: integer('delta').default(0).notNull(),
		reason: text('reason').default('vote-change').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => ({ recipientRecentIdx: index('karma_events_recipient_recent_idx').on(t.recipientId, t.createdAt.desc()), actorTargetIdx: index('karma_events_actor_target_idx').on(t.actorId, t.targetType, t.targetId) })
);

export const notifications = pgTable('notifications', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	type: text('type').notNull(),
	message: text('message').notNull(),
	url: text('url'),
	isRead: boolean('is_read').default(false).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const follows = pgTable(
	'follows',
	{
		followerId: text('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		followingId: text('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => ({ pk: primaryKey({ columns: [t.followerId, t.followingId] }), followingIdx: index('follows_following_idx').on(t.followingId) })
);

export const bookmarks = pgTable(
	'bookmarks',
	{
		userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => ({ pk: primaryKey({ columns: [t.userId, t.postId] }), postIdx: index('bookmarks_post_idx').on(t.postId) })
);

export const reports = pgTable(
	'reports',
	{
		id: text('id').primaryKey(),
		targetType: text('target_type').notNull(),
		targetId: text('target_id').notNull(),
		reporterId: text('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		reason: text('reason').notNull(),
		details: text('details'),
		status: text('status').default('open').notNull(),
		reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
		reviewedAt: timestamp('reviewed_at'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => ({ statusIdx: index('reports_status_idx').on(t.status), targetIdx: index('reports_target_idx').on(t.targetType, t.targetId) })
);

export const moderationLogs = pgTable('moderation_logs', {
	id: text('id').primaryKey(),
	actorId: text('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	action: text('action').notNull(),
	targetType: text('target_type').notNull(),
	targetId: text('target_id').notNull(),
	reason: text('reason'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

/** Owner-reviewed verification requests. A blue badge is never self-assignable. */
export const verificationRequests = pgTable(
	'verification_requests',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		reason: text('reason').notNull(),
		evidenceUrl: text('evidence_url'),
		status: text('status').default('pending').notNull(),
		reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
		reviewedAt: timestamp('reviewed_at'),
		reviewerNote: text('reviewer_note'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => ({ statusIdx: index('verification_requests_status_idx').on(t.status), userIdx: index('verification_requests_user_idx').on(t.userId, t.createdAt.desc()) })
);

export const userBlocks = pgTable(
	'user_blocks',
	{
		blockerId: text('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		blockedId: text('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => ({ pk: primaryKey({ columns: [t.blockerId, t.blockedId] }) })
);

export const userMutes = pgTable(
	'user_mutes',
	{
		muterId: text('muter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		mutedId: text('muted_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => ({ pk: primaryKey({ columns: [t.muterId, t.mutedId] }) })
);

export const communityModerators = pgTable(
	'community_moderators',
	{
		communityId: text('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
		userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		role: text('role').default('moderator').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => ({ pk: primaryKey({ columns: [t.communityId, t.userId] }) })
);

/** Lightweight first-party action log used to personalize the For You ranking. */
export const userInteractions = pgTable(
	'user_interactions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		targetId: text('target_id').notNull(),
		targetType: text('target_type').default('post').notNull(),
		actionType: text('action_type').notNull(),
		value: integer('value').default(1).notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => ({ userRecentIdx: index('user_interactions_user_recent_idx').on(t.userId, t.createdAt.desc()), targetIdx: index('user_interactions_target_idx').on(t.targetId, t.actionType) })
);

export const pollVotes = pgTable(
	'poll_votes',
	{
		userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
		optionId: text('option_id').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => ({ pk: primaryKey({ columns: [t.userId, t.postId] }), postIdx: index('poll_votes_post_idx').on(t.postId) })
);

export const appSettings = pgTable('app_settings', {
	id: integer('id').primaryKey().default(1),
	siteName: text('site_name').notNull(),
	tagline: text('tagline'),
	logoUrl: text('logo_url'),
	brandColor: text('brand_color').default('#2b6cb0').notNull(),
	allowRegistration: boolean('allow_registration').default(true).notNull(),
	inviteOnly: boolean('invite_only').default(false).notNull(),
	requireEmailVerification: boolean('require_email_verification').default(false).notNull(),
	enableNsfw: boolean('enable_nsfw').default(false).notNull(),
	enableRealtimeFeed: boolean('enable_realtime_feed').default(true).notNull(),
	defaultSort: text('default_sort').default('hot').notNull(),
	postRateLimitPerHour: integer('post_rate_limit_per_hour').default(10).notNull(),
	setupComplete: boolean('setup_complete').default(false).notNull(),
	updatedAt: timestamp('updated_at').defaultNow()
});


/** Uploaded media metadata. The object bucket is resolved from the configured B2 access mode and the object-key prefix. */
export const mediaAssets = pgTable('media_assets', {
	id: text('id').primaryKey(),
	ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	objectKey: text('object_key').notNull(),
	originalName: text('original_name').notNull(),
	contentType: text('content_type').notNull(),
	mediaKind: text('media_kind').notNull(),
	visibility: text('visibility').default('public').notNull(),
	sizeBytes: integer('size_bytes').notNull(),
	referenceType: text('reference_type'),
	referenceId: text('reference_id'),
	isDeleted: boolean('is_deleted').default(false).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull()
}, (t) => ({ objectKeyUnique: uniqueIndex('media_assets_object_key_unique').on(t.objectKey), ownerRecentIdx: index('media_assets_owner_recent_idx').on(t.ownerId, t.createdAt.desc()) }));

/** Public identity keys only. Private ECDH keys must remain in the user's browser. */
export const dmPublicKeys = pgTable('dm_public_keys', {
	userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
	publicKey: json('public_key').$type<JsonWebKey>().notNull(),
	fingerprint: text('fingerprint').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const dmConversations = pgTable('dm_conversations', {
	id: text('id').primaryKey(),
	directKey: text('direct_key').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (t) => ({ directKeyUnique: uniqueIndex('dm_conversations_direct_key_unique').on(t.directKey), recentIdx: index('dm_conversations_recent_idx').on(t.updatedAt.desc()) }));

export const dmConversationMembers = pgTable('dm_conversation_members', {
	conversationId: text('conversation_id').notNull().references(() => dmConversations.id, { onDelete: 'cascade' }),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	joinedAt: timestamp('joined_at').defaultNow().notNull()
}, (t) => ({ pk: primaryKey({ columns: [t.conversationId, t.userId] }), memberIdx: index('dm_conversation_members_user_idx').on(t.userId, t.conversationId) }));

/** Ciphertext only. No plaintext body column exists by design. */
export const dmMessages = pgTable('dm_messages', {
	id: text('id').primaryKey(),
	conversationId: text('conversation_id').notNull().references(() => dmConversations.id, { onDelete: 'cascade' }),
	senderId: text('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	ciphertext: text('ciphertext').notNull(),
	nonce: text('nonce').notNull(),
	envelopes: json('envelopes').$type<Array<{ recipientId: string; ephemeralPublicKey: JsonWebKey; salt: string; wrapNonce: string; wrappedKey: string }>>().notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull()
}, (t) => ({ conversationRecentIdx: index('dm_messages_conversation_recent_idx').on(t.conversationId, t.createdAt.desc()) }));

export const supportTickets = pgTable('support_tickets', {
	id: text('id').primaryKey(),
	userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
	category: text('category').notNull(),
	subject: text('subject').notNull(),
	message: text('message').notNull(),
	contactEmail: text('contact_email'),
	status: text('status').default('open').notNull(),
	priority: text('priority').default('normal').notNull(),
	assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (t) => ({ statusIdx: index('support_tickets_status_idx').on(t.status), createdIdx: index('support_tickets_created_idx').on(t.createdAt.desc()) }));

export const privacyRequests = pgTable('privacy_requests', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	requestType: text('request_type').notNull(),
	details: text('details'),
	status: text('status').default('received').notNull(),
	resolutionNote: text('resolution_note'),
	reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (t) => ({ userRecentIdx: index('privacy_requests_user_recent_idx').on(t.userId, t.createdAt.desc()), statusIdx: index('privacy_requests_status_idx').on(t.status) }));

export const communityEmotes = pgTable('community_emotes', {
	id: text('id').primaryKey(),
	communityId: text('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
	code: text('code').notNull(),
	imageAssetId: text('image_asset_id').references(() => mediaAssets.id, { onDelete: 'set null' }),
	imageUrl: text('image_url').notNull(),
	isAnimated: boolean('is_animated').default(false).notNull(),
	uploadedBy: text('uploaded_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').defaultNow().notNull()
}, (t) => ({ emoteCodeUnique: uniqueIndex('community_emotes_community_code_unique').on(t.communityId, t.code) }));


/** Events are community-scoped; RSVPs are unique per user and event. */
export const communityEvents = pgTable(
  'community_events',
  {
    id: text('id').primaryKey(),
    communityId: text('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    eventType: text('event_type').default('online').notNull(),
    locationText: text('location_text'),
    onlineUrl: text('online_url'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    timezone: text('timezone').default('UTC').notNull(),
    capacity: integer('capacity'),
    visibility: text('visibility').default('community').notNull(),
    status: text('status').default('scheduled').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ communityStartsIdx: index('community_events_community_starts_idx').on(t.communityId, t.startsAt), statusStartsIdx: index('community_events_status_starts_idx').on(t.status, t.startsAt) })
);

export const communityEventRsvps = pgTable(
  'community_event_rsvps',
  {
    eventId: text('event_id').notNull().references(() => communityEvents.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').default('going').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ pk: primaryKey({ columns: [t.eventId, t.userId] }), userRecentIdx: index('community_event_rsvps_user_recent_idx').on(t.userId, t.updatedAt.desc()) })
);

/** Gaming LFG sessions expire automatically and are scoped to gaming communities. */
export const gamingLfgSessions = pgTable(
  'gaming_lfg_sessions',
  {
    id: text('id').primaryKey(),
    communityId: text('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    game: text('game').notNull(),
    platform: text('platform').default('Any').notNull(),
    region: text('region').default('Any').notNull(),
    rank: text('rank'),
    activity: text('activity').default('casual').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    partySize: integer('party_size').default(5).notNull(),
    slotsOpen: integer('slots_open').default(4).notNull(),
    voiceRequired: boolean('voice_required').default(false).notNull(),
    status: text('status').default('open').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ communityStatusIdx: index('gaming_lfg_community_status_idx').on(t.communityId, t.status, t.expiresAt), creatorIdx: index('gaming_lfg_creator_idx').on(t.createdBy, t.createdAt.desc()) })
);

/** Academic resource cards can carry ordinary URLs or DOI metadata; never fetch URLs server-side. */
export const academicResources = pgTable(
  'academic_resources',
  {
    id: text('id').primaryKey(),
    communityId: text('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    resourceType: text('resource_type').default('article').notNull(),
    subject: text('subject'),
    url: text('url').notNull(),
    doi: text('doi'),
    citation: text('citation'),
    accessLevel: text('access_level').default('community').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ communityRecentIdx: index('academic_resources_community_recent_idx').on(t.communityId, t.createdAt.desc()), subjectIdx: index('academic_resources_subject_idx').on(t.subject) })
);

/** A shared collaborative pixel board. pixel_cells stores current state; pixel_history is append-only history. */
export const pixelCanvases = pgTable(
  'pixel_canvases',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    communityId: text('community_id').references(() => communities.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    width: integer('width').default(100).notNull(),
    height: integer('height').default(100).notNull(),
    palette: json('palette').$type<string[]>().notNull(),
    cooldownMs: integer('cooldown_ms').default(5000).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    isActive: boolean('is_active').default(true).notNull(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ slugUnique: uniqueIndex('pixel_canvases_slug_unique').on(t.slug), activeIdx: index('pixel_canvases_active_idx').on(t.isActive, t.startsAt, t.endsAt) })
);

export const pixelCells = pgTable(
  'pixel_cells',
  {
    canvasId: text('canvas_id').notNull().references(() => pixelCanvases.id, { onDelete: 'cascade' }),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    color: text('color').notNull(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ pk: primaryKey({ columns: [t.canvasId, t.x, t.y] }), userIdx: index('pixel_cells_user_idx').on(t.canvasId, t.userId) })
);

export const pixelHistory = pgTable(
  'pixel_history',
  {
    id: serial('id').primaryKey(),
    canvasId: text('canvas_id').notNull().references(() => pixelCanvases.id, { onDelete: 'cascade' }),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    color: text('color').notNull(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    placedAt: timestamp('placed_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ canvasHistoryIdx: index('pixel_history_canvas_idx').on(t.canvasId, t.id), userRecentIdx: index('pixel_history_user_recent_idx').on(t.canvasId, t.userId, t.id.desc()) })
);


export const gamingLfgMembers = pgTable(
  'gaming_lfg_members',
  {
    sessionId: text('session_id').notNull().references(() => gamingLfgSessions.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').default('joined').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({ pk: primaryKey({ columns: [t.sessionId, t.userId] }), userIdx: index('gaming_lfg_members_user_idx').on(t.userId, t.createdAt.desc()) })
);
