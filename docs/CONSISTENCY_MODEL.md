# Nexus consistency and availability model

## Decision

Nexus uses a **BASE-inspired application architecture for social features**, while PostgreSQL remains the authoritative relational database. BASE is a consistency/availability design model, not a legal compliance certification. ACID is not exclusive to finance; database transactions are useful for any operation that must remain correct under concurrent requests. The goal is to use eventual consistency where a short propagation delay is acceptable, rather than weaken security- or privacy-critical decisions.

## Where eventual consistency is appropriate

The following information is derived or user-facing and can be recalculated or refreshed asynchronously as the site grows:

- For You ranking scores, hot/rising/trending ordering, and author-diversity signals.
- Cached engagement counts and community/user statistics.
- Search indexes and recommendation aggregates.
- Non-critical notification delivery and activity-feed fan-out.
- Analytics, media processing status, and cleanup jobs.

The current implementation periodically recomputes post scores (the ranking updater runs on a five-minute interval after setup). Feed clients may therefore see scores or ordering update after a short delay. A future multi-instance deployment should move these periodic jobs to a durable worker/queue and use idempotent jobs plus retry/backoff. Do not start one independent in-memory timer per production replica.

## Where authoritative, transactional writes remain necessary

A social app still needs immediate, reliable enforcement for critical state. Use database transactions or conditional writes and re-check authorization on every request for:

- Login/session validity, account role changes, temporary/permanent bans, and shadow-ban state.
- Private-community membership and access, blocks, DM conversation membership, and encryption-key registration.
- Report resolution, moderation actions, appeals, and their audit records.
- Upload ownership, media-to-post references, and data-subject request status.
- Votes and poll-vote uniqueness, and any operation where duplicate or partially applied writes would violate the product rules.

A cached feed may briefly contain stale ranking data, but a stale cache must never grant access to private content or override a ban, block, or community permission check. Authorization is evaluated against authoritative state, not ranking/cache state.

## Recommended projection pattern as load grows

1. Commit the authoritative change to PostgreSQL.
2. In the same transaction, insert a small durable outbox/event record describing the change (no secrets or plaintext E2EE messages).
3. A worker reads pending events, updates denormalized counters/search/feed projections, and marks each event processed.
4. Make consumers idempotent, retry failures, cap retries, and send persistent failures to a dead-letter table/queue.
5. Rebuild projections from authoritative records when needed and monitor queue lag, failed jobs, and projection freshness.

This repository currently uses PostgreSQL plus the periodic score updater; a general outbox worker/queue is a scale-up item, not something to claim as already deployed.

## Security, privacy, and E2EE boundaries

BASE-style eventual consistency is not permission to make security decisions eventually consistent. Bans and private-content access should take effect immediately. End-to-end encrypted DM bodies remain ciphertext at the API/database layer; a relay server can still observe participant identifiers, timing, ciphertext sizes, and delivery metadata. This beta uses the server to relay messages, so it is not direct peer-to-peer networking. The site serves the client code and cannot protect users from a compromised deployment that deliberately ships malicious JavaScript. Key verification, device/key recovery, audited cryptographic design, abuse-report evidence handling, backups, and incident response require continued review before high-risk production use.

## Operational and compliance scope

- The Philippine Data Privacy Act of 2012 (RA 10173) and applicable NPC issuances are legal obligations to assess with Philippine counsel/DPO; a design document does not certify compliance.
- NIST Cybersecurity Framework 2.0 is a risk-management framework, not a law or a certification by itself. Map operational controls to its six functions: Govern, Identify, Protect, Detect, Respond, and Recover.
- Before public launch, replace privacy/contact placeholders, document processing purposes and lawful bases, set retention schedules, publish accurate terms/privacy notices, inventory processors and cross-border transfers, test access/deletion/export flows, establish a breach-response process, test backups/restoration, and complete a security review.
