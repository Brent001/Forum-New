# Nexus karma and verification

## Verified account badge

Verification is a trust signal controlled by the site owner; users cannot set `isVerified` themselves. Signed-in users may submit a request from **Settings → Verification and karma** with a reason and an optional public HTTPS link. The owner reviews pending requests in **Owner Studio → Verification requests** and may approve or decline them with a reviewer note. Approval enables the reusable `VerifiedBadge` across the profile, posts, replies, and discovery surfaces. Verification is not a paid endorsement and does not grant staff permissions.

Do not ask users to upload unnecessary identity documents. In the current release, evidence is a public link and the decision is manual. Store only the minimum information needed for the decision and document a retention period before operating this feature at scale.

## Karma model

- `postKarma`: net score from votes received on the member's non-removed posts.
- `commentKarma`: net score from votes received on the member's non-removed replies whose parent post is not removed.
- `karma`: total, maintained as `postKarma + commentKarma`.
- Each member has one current vote per target. Vote changes apply only the delta (`newVote - previousVote`), so changing `-1` to `+1` changes the author's karma by `+2` rather than creating a duplicate award.
- Self-votes are rejected by the write endpoints. The one-time owner reconciliation also excludes historical self-votes.
- `karma_events` records voter, recipient, target type, previous/new vote, delta, and timestamp for accountability and export.
- Reputation tiers are cosmetic milestones only. They must never replace access-control checks, moderation roles, or verified status.

Karma is a simple current net-vote tally, not a proof of identity or quality. Vote brigading and sock-puppet accounts remain possible; before public launch, add rate limits and abuse monitoring based on your deployment's threat model. Never trust a client-submitted score or karma value.

## Applying the schema update

Back up the database first, then install dependencies and apply the schema through the project's existing workflow:

```bash
npm install
npm run db:push
npm run check
npm run dev
```

The update adds `post_karma`, `comment_karma`, `karma_events`, and `verification_requests`. Existing `karma` values are not automatically overwritten during schema migration. Once the schema is applied and the application is running, sign in as the site owner and use **Owner Studio → Members & roles → Recalculate legacy karma** once to rebuild split and total karma from existing votes on current non-removed content.

The full SvelteKit type check/build must be run in an environment with dependencies installed before production deployment.
