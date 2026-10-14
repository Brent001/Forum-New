# Community tools: moderators, emotes, and member safety

Nexus communities support Discord-style custom emote shortcodes, scoped moderators, post moderation, and timed/permanent community bans.

## Community creator workflow

1. Open a community page (`/c/<slug>`).
2. Use **Manage community** to add or remove custom emotes, add or remove moderators, and review or lift community bans.
3. Upload emotes as PNG, JPEG, WebP, AVIF, or GIF, up to 1 MB each. Shortcodes use `:party_parrot:` style and are limited to 100 emotes per community.
4. Insert shortcode text from the community emote picker while composing a post or comment. The shortcode renders as the community's image anywhere that community's emote list is provided.

## Role model

- **Community creator:** manages moderators and can use all community moderation tools.
- **Community moderator:** can manage emotes, pin/lock/remove posts, and issue temporary/permanent community bans. They cannot grant or remove moderator roles or ban other moderators.
- **Site admin/owner:** can moderate across communities and has global tools in `/admin`.
- **Member:** can join, post (if not restricted), vote, comment, use community emotes, and report content.

Community bans are separate from site-wide suspensions. A community ban blocks joining, posting, commenting, voting, and poll voting in the affected community. A null expiry means permanent; timed bans expire automatically when permission checks run, while old rows can remain until a moderator removes them.

## GIF providers

GIF search runs server-side so API keys are never exposed in browser code. Set either or both:

```dotenv
TENOR_API_KEY=
GIPHY_API_KEY=
```

The picker supports `Auto`, `Tenor`, and `GIPHY`. `Auto` searches configured providers in parallel, merges unique results, and gracefully handles one provider being unavailable. Direct GIF URLs are restricted to HTTPS GIF assets on recognized Tenor/GIPHY media hosts. Observe each provider's current developer terms, attribution rules, rating filters, usage limits, and caching restrictions before production use.

## Database change

Run `npm run db:push` after updating source to create the community ban table and add `communities.created_by` if this is an existing database. Back up production data and review generated schema changes before applying them.

## Production notes

- Serve uploads via the existing Backblaze B2 route; keep B2 application keys server-side and configure CORS for your deployed origin.
- Community emotes are limited to 1 MB, and upload permissions are checked server-side.
- Moderator actions are written to `moderation_logs`.
- The custom emote and moderation APIs should receive integration tests before production rollout; the project archive has not yet passed a dependency-backed framework build in this environment.
