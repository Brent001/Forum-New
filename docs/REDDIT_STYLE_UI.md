# Reddit-inspired forum UI

The home feed is intentionally forum-first rather than a social-media analytics dashboard. It uses familiar forum conventions: a compact top bar with global search, a left feed/community navigation rail, a central post feed, and a right sidebar for community discovery and trending posts. The styling uses a flat dark palette and restrained borders rather than gradient-heavy hero cards.

## Post creation

The composer exposes four clear formats:

- **Post** — title and text/body.
- **Images & Video** — title and one or more image/video/audio attachments.
- **Link** — title, URL, optional context.
- **Poll** — title, optional context and two to six options.

The media uploader asks the server for a short-lived Backblaze B2 upload URL, uploads the file directly to the configured bucket, verifies completion with the server, and attaches the resulting media asset IDs when the post is created. If a user selects files and clicks Post without manually uploading first, publishing now uploads the selected files before creating the post rather than silently dropping them. The API stores media posts using the existing discussion post type with a media attachment array; polls and links keep their explicit post types.

## Feed cards and polling

Feed cards provide a Reddit-style vote rail, community/author metadata, optional flair, title/body, image and video rendering, link preview, poll voting/results, comments, share, save and report controls. For signed-in users, the home feed also loads their existing poll-vote choice so a page refresh shows poll results instead of inviting a second vote.

## Design scope

This is a Reddit-inspired layout and interaction model with Nexus's own name, route structure and data model; it does not reuse Reddit trademarks or assets. Existing routes and API endpoint contracts are preserved where possible. Mobile screens collapse the right sidebar and place the community navigation inside an off-canvas menu.

## Validation

The source structure was inspected and Svelte block counts (if/each) are balanced. Full `npm run check`/`npm run build` still need to be run after dependencies install successfully; in this environment the package installation did not finish and `svelte-kit` was unavailable for the check command.
