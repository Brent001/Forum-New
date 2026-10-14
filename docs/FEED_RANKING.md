# Feed ranking and recommendation design

## What is implemented here

Nexus uses a small, explainable **X-inspired For You heuristic** alongside the original forum-style sort modes. The score estimates action likelihoods from local engagement signals (votes, replies, shares, bookmarks, views and the viewer's follow graph), blends positive and negative signals, then applies recency decay, followed-author/community relevance, author diversity and a modest new-author discovery boost. Mutes, blocks, removed posts, muted words and opt-in sensitive-content settings are visibility filters applied separately from ranking.

This is not a port of X's production model and does not pretend to reproduce it. The current app has no X Phoenix checkpoints, training pipeline, JAX model service, Rust serving layer or production-scale retrieval/index infrastructure. `src/lib/server/algorithm/ranking.ts` is a pragmatic site-sized approximation that runs on the project's own records and can be swapped behind the same scoring interface later.

## Public reference

X publishes the [x-algorithm repository](https://github.com/xai-org/x-algorithm) under Apache-2.0. Its README describes a feed assembled from in-network and out-of-network candidates, with per-action prediction probabilities combined using configured weights, followed by author-diversity and network adjustments; it also explains that ranking is distinct from visibility filtering. This project follows those architectural ideas at a much smaller scale but does not copy or bundle X's production model code.

Other UX inspirations worth studying:

- [Reddit moderation tools](https://support.reddithelp.com/hc/en-us/articles/15484384020756-Moderation-Tools-overview): reported/reviewed/removed queues and moderator workflows.
- [Discord forum channels](https://support.discord.com/hc/en-us/articles/6208479917079-Forum-Channels-FAQ): topic-oriented spaces, tags and thread controls.
- [GitHub Discussions](https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions): structured community Q&A and discussion formats.
- [Bluesky custom feeds](https://bsky.social/about/blog/7-27-2023-custom-feeds): user choice between personalized and chronological discovery.

## Tuning safely

Treat weights as product choices, not objective truth. Log and inspect feed outcomes, user reports, retention, author concentration and new-author exposure before tuning. Keep report/block/mute/removed-content enforcement outside the relevance score so popular content cannot buy its way past a safety decision.
