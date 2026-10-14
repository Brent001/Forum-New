# UI feature compatibility notes

This patch keeps the Reddit-style layout while restoring/adding expected social content affordances in the current Nexus source.

## Post content

- The shared `PostCard.svelte` continues to render Backblaze-backed image, video and audio media plus polls and normal URL previews.
- YouTube URLs in a post's URL field or body are recognized for `youtube.com/watch`, `youtu.be`, Shorts, live, embed and `youtube-nocookie.com` forms, with video IDs validated before creating a privacy-enhanced iframe on `youtube-nocookie.com`. Other links remain regular external links.
- The homepage composer retains separate Post, Images & Video, Link and Poll modes. Selected media must be uploaded before the post is sent so a publish cannot silently omit local files.

## GIF replies

- Replies may contain text, a GIF, or both. The comment table stores `gif_url`; the API permits direct HTTPS GIFs only from the GIPHY/Tenor media hosts and rejects user info/ports.
- Configure `TENOR_API_KEY` server-side to activate Tenor search. Without it, users can still attach a direct GIF URL from the supported hosts. The key is never sent to the browser.
- `npm run db:push` applies the `comments.gif_url` column in a development database. Data export also includes the GIF URL for a user's own comments.

## Custom controls and icons

- Select controls in the Svelte routes use the shared `src/lib/components/ui/Dropdown.svelte` instead of native `<select>` elements. It supports outside-click dismissal and Escape-to-close.
- UI icons come from `@lucide/svelte` (Svelte 5 package). Svelte screens do not use manually authored inline `<svg>` icon markup.

## Dependencies and validation

The project manifest and lockfile include `@lucide/svelte`. Run `npm install`, `npm run db:push`, `npm run check`, and `npm run build` on the project machine. The current offline workspace does not have installed Node dependencies, so a full SvelteKit build cannot be asserted here.
