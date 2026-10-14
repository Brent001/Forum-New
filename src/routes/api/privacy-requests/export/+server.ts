import { json, type RequestHandler } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index.js';
import { bookmarks, comments, follows, karmaEvents, posts, privacyRequests, users, userInteractions, verificationRequests, votes } from '$lib/server/db/schema.js';
import { getActor } from '$lib/server/social.js';

export const GET: RequestHandler = async (event) => {
  if (!db) return json({ error: 'Database is not configured.' }, { status: 503 });
  const actor = await getActor(event);
  if (!actor) return json({ error: 'Sign in to export your data.' }, { status: 401 });
  const [profile, ownPosts, ownComments, ownFollows, ownBookmarks, ownVotes, interactions, requests, karmaHistory, ownVerificationRequests] = await Promise.all([
    db.select({ id: users.id, username: users.username, email: users.email, displayName: users.displayName, bio: users.bio, avatarUrl: users.avatarUrl, bannerUrl: users.bannerUrl, createdAt: users.createdAt, profileVisibility: users.profileVisibility, dmPolicy: users.dmPolicy, discoverable: users.discoverable, preferredFeed: users.preferredFeed, mutedKeywords: users.mutedKeywords, isNsfwEnabled: users.isNsfwEnabled, isVerified: users.isVerified, karma: users.karma, postKarma: users.postKarma, commentKarma: users.commentKarma }).from(users).where(eq(users.id, actor.id)).limit(1),
    db.select({ id: posts.id, title: posts.title, body: posts.body, url: posts.url, media: posts.media, createdAt: posts.createdAt, updatedAt: posts.updatedAt, score: posts.score, postType: posts.postType, flair: posts.flair, isRemoved: posts.isRemoved, removedReason: posts.removedReason }).from(posts).where(eq(posts.authorId, actor.id)).orderBy(desc(posts.createdAt)).limit(10000),
    db.select({ id: comments.id, postId: comments.postId, parentId: comments.parentId, content: comments.content, gifUrl: comments.gifUrl, createdAt: comments.createdAt, updatedAt: comments.updatedAt, isRemoved: comments.isRemoved }).from(comments).where(eq(comments.authorId, actor.id)).orderBy(desc(comments.createdAt)).limit(20000),
    db.select({ followingId: follows.followingId, createdAt: follows.createdAt }).from(follows).where(eq(follows.followerId, actor.id)),
    db.select({ postId: bookmarks.postId, createdAt: bookmarks.createdAt }).from(bookmarks).where(eq(bookmarks.userId, actor.id)),
    db.select({ targetId: votes.targetId, targetType: votes.targetType, value: votes.value, createdAt: votes.createdAt }).from(votes).where(eq(votes.userId, actor.id)),
    db.select({ targetId: userInteractions.targetId, targetType: userInteractions.targetType, actionType: userInteractions.actionType, value: userInteractions.value, createdAt: userInteractions.createdAt }).from(userInteractions).where(eq(userInteractions.userId, actor.id)).orderBy(desc(userInteractions.createdAt)).limit(20000),
    db.select({ id: privacyRequests.id, requestType: privacyRequests.requestType, details: privacyRequests.details, status: privacyRequests.status, createdAt: privacyRequests.createdAt, updatedAt: privacyRequests.updatedAt }).from(privacyRequests).where(eq(privacyRequests.userId, actor.id)),
    db.select({ targetId: karmaEvents.targetId, targetType: karmaEvents.targetType, previousValue: karmaEvents.previousValue, newValue: karmaEvents.newValue, delta: karmaEvents.delta, reason: karmaEvents.reason, createdAt: karmaEvents.createdAt }).from(karmaEvents).where(eq(karmaEvents.recipientId, actor.id)).orderBy(desc(karmaEvents.createdAt)).limit(20000),
    db.select({ id: verificationRequests.id, reason: verificationRequests.reason, evidenceUrl: verificationRequests.evidenceUrl, status: verificationRequests.status, reviewerNote: verificationRequests.reviewerNote, createdAt: verificationRequests.createdAt, reviewedAt: verificationRequests.reviewedAt }).from(verificationRequests).where(eq(verificationRequests.userId, actor.id)).orderBy(desc(verificationRequests.createdAt))
  ]);
  return json({ exportedAt: new Date().toISOString(), format: 'Nexus data portability export v1', note: 'Private direct messages are end-to-end encrypted and their plaintext is not available to the server for export. This export includes data in the categories listed below; it does not certify legal compliance.', profile: profile[0] ?? null, posts: ownPosts, comments: ownComments, following: ownFollows, bookmarks: ownBookmarks, votes: ownVotes, interactions, privacyRequests: requests, karmaHistory, verificationRequests: ownVerificationRequests }, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="nexus-data-export-${new Date().toISOString().slice(0,10)}.json"`, 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff' }
  });
};
