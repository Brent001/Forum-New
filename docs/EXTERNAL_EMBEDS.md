# External platform embeds

The feed's `PostCard.svelte` uses the reusable `ExternalEmbed.svelte` component and the strict URL parser in `src/lib/utils/external-embeds.ts`. Only known HTTPS providers can become embeds; the code reconstructs an official/canonical iframe URL instead of trusting arbitrary `iframe` HTML or arbitrary user query parameters. Unsupported links fall back to a normal external-link card.

## Supported links

- **YouTube**: `youtube.com/watch`, `youtube.com/embed`, `/shorts/`, `/live/`, `/v/`, `youtu.be`; uses `youtube-nocookie.com`.
- **Twitch**: channel, `/videos/{id}`, `/clip/{slug}`, and `clips.twitch.tv/{slug}`. Twitch's official player requires a `parent` hostname parameter. The component uses `window.location.hostname` in the browser; `PUBLIC_SITE_URL` is a server-render fallback. Make sure the production `PUBLIC_SITE_URL` is your real public origin.
- **Vimeo**: standard numeric video URLs and unlisted links with the `h` privacy hash. Adds `dnt=1`.
- **Spotify**: tracks, albums, artists, playlists, episodes, shows, audiobooks and chapters on `open.spotify.com`.
- **Apple Music**: album, song, playlist and music-video URLs on `music.apple.com`.
- **SoundCloud**: tracks and sets on `soundcloud.com` via SoundCloud's Widget player.
- **Dailymotion**: `/video/{id}` and `dai.ly/{id}`.
- **Mixcloud**: show and mix links through its widget iframe.
- **Scratch**: shared Scratch project pages through `/projects/{id}/embed`.
- **TurboWarp**: shared numeric project URLs through TurboWarp's embed route.

## Security and privacy decisions

- The parser accepts HTTPS only, rejects URLs with user information or explicit ports, checks exact hostnames, validates provider-specific IDs, and produces its own embed URL.
- It does not paste arbitrary URL parameters or arbitrary iframes into the page. Supported providers get only the minimum URL fields required for the player; Vimeo's unlisted hash and YouTube's start position are retained when recognized.
- Iframes are lazy-loaded, use `referrerpolicy="no-referrer"`, and are given a descriptive title. Scratch/TurboWarp iframes use a restrictive sandbox with scripts, forms, pointer lock, presentation, and same-origin access scoped to their provider origin; top-level navigation is not enabled.
- Loading a provider can disclose the viewer's IP address, user agent and basic request metadata to that provider. Users can open the source link instead. This is not a promise of zero third-party tracking; review privacy policy/consent obligations before launch.
- Twitch requires the exact embedding domain as `parent`, and its player has a minimum size requirement. An unavailable stream, private/deleted video, unshared project, ad blocker, or provider policy can make an otherwise recognized URL fail to play.

## Official references

- Twitch: https://dev.twitch.tv/docs/embed/everything/
- Vimeo: https://developer.vimeo.com/player/sdk/embed
- Spotify: https://developer.spotify.com/documentation/embeds
- TurboWarp: https://docs.turbowarp.org/embedding
