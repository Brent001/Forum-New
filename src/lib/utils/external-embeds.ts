export type ExternalEmbedKind =
  | 'youtube'
  | 'twitch'
  | 'vimeo'
  | 'spotify'
  | 'soundcloud'
  | 'dailymotion'
  | 'apple-music'
  | 'mixcloud'
  | 'scratch'
  | 'turbowarp';

export type ExternalEmbed = {
  kind: ExternalEmbedKind;
  provider: string;
  src: string;
  externalUrl: string;
  mode: 'video' | 'audio' | 'playground';
  height: number;
  ratio?: string;
  minWidth?: number;
  minHeight?: number;
  allow: string;
  sandbox?: string;
};

const PLAYER_ALLOW = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share';
const INTERACTIVE_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-presentation';

function readHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

function normalizedHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function makeEmbed(
  kind: ExternalEmbedKind,
  provider: string,
  src: string,
  externalUrl: string,
  mode: ExternalEmbed['mode'],
  height: number,
  options: Partial<Pick<ExternalEmbed, 'ratio' | 'minWidth' | 'minHeight' | 'allow' | 'sandbox'>> = {}
): ExternalEmbed {
  return { kind, provider, src, externalUrl, mode, height, allow: PLAYER_ALLOW, ...options };
}

/**
 * Turn only known, HTTPS provider URLs into canonical embed URLs. This deliberately
 * does not accept arbitrary iframe URLs or copy arbitrary query parameters into players.
 */
export function buildExternalEmbed(value: string | null | undefined, parentDomain = ''): ExternalEmbed | null {
  if (!value) return null;
  const url = readHttpsUrl(value);
  if (!url) return null;
  const host = normalizedHost(url);
  const path = url.pathname.replace(/\/{2,}/g, '/');

  // YouTube: watch, youtu.be, Shorts, live, and already-shared embed links.
  if (host === 'youtu.be' || ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    let id = '';
    if (host === 'youtu.be') id = path.split('/').filter(Boolean)[0] ?? '';
    else if (path === '/watch') id = url.searchParams.get('v') ?? '';
    else id = path.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]+)/)?.[1] ?? '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    const start = url.searchParams.get('start') ?? url.searchParams.get('t') ?? '';
    const seconds = /^\d+$/.test(start) ? `?start=${start}` : '';
    return makeEmbed('youtube', 'YouTube', `https://www.youtube-nocookie.com/embed/${id}${seconds}`, url.toString(), 'video', 405, { ratio: '16 / 9' });
  }

  // Twitch requires the exact current host in its parent parameter.
  if (['twitch.tv', 'm.twitch.tv', 'clips.twitch.tv'].includes(host)) {
    const parent = parentDomain.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
    if (!parent || !/^(?:localhost|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i.test(parent)) return null;
    let src = '';
    if (host === 'clips.twitch.tv') {
      const slug = path.split('/').filter(Boolean)[0] ?? '';
      if (!/^[A-Za-z0-9_-]{3,100}$/.test(slug)) return null;
      src = `https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&parent=${encodeURIComponent(parent)}`;
    } else {
      const parts = path.split('/').filter(Boolean);
      const clipIndex = parts.indexOf('clip');
      if (clipIndex >= 0 && parts[clipIndex + 1] && /^[A-Za-z0-9_-]{3,100}$/.test(parts[clipIndex + 1])) {
        src = `https://clips.twitch.tv/embed?clip=${encodeURIComponent(parts[clipIndex + 1])}&parent=${encodeURIComponent(parent)}`;
      } else if (parts[0] === 'videos' && parts[1] && /^\d{3,20}$/.test(parts[1])) {
        src = `https://player.twitch.tv/?video=v${parts[1]}&parent=${encodeURIComponent(parent)}&autoplay=false`;
      } else if (parts[0] === 'directory' || parts[0] === 'downloads' || parts[0] === 'settings' || parts[0] === 'p') {
        return null;
      } else {
        // Accept normal channel links and the common /embed/{channel} path, but
        // always rebuild the embed URL rather than trusting pasted query params.
        const channel = parts[0] === 'embed' ? (parts[1] ?? '') : (parts[0] ?? '');
        if (!/^[A-Za-z0-9_]{1,25}$/.test(channel) || channel.toLowerCase() === 'embed') return null;
        src = `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parent)}&autoplay=false`;
      }
    }
    return makeEmbed('twitch', 'Twitch', src, url.toString(), 'video', 405, { ratio: '16 / 9', minWidth: 400, minHeight: 300 });
  }

  // Vimeo videos and unlisted links with an h= privacy hash.
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = path.split('/').filter(Boolean);
    const idIndex = host === 'player.vimeo.com' && parts[0] === 'video' ? 1 : 0;
    const id = parts[idIndex] ?? '';
    if (!/^\d{5,15}$/.test(id)) return null;
    const privacyHash = url.searchParams.get('h') ?? (parts[idIndex + 1] && /^[A-Za-z0-9]{5,40}$/.test(parts[idIndex + 1]) ? parts[idIndex + 1] : '');
    const params = new URLSearchParams({ dnt: '1' });
    if (privacyHash) params.set('h', privacyHash);
    return makeEmbed('vimeo', 'Vimeo', `https://player.vimeo.com/video/${id}?${params.toString()}`, url.toString(), 'video', 405, { ratio: '16 / 9' });
  }

  // Spotify tracks, albums, artists, playlists, episodes, shows, audiobooks and chapters.
  if (host === 'open.spotify.com') {
    const parts = path.split('/').filter(Boolean);
    if (parts[0] && /^intl-[a-z]{2}$/i.test(parts[0])) parts.shift();
    const types = new Set(['track', 'album', 'artist', 'playlist', 'episode', 'show', 'audiobook', 'chapter']);
    const type = parts[0] ?? '';
    const id = parts[1] ?? '';
    if (!types.has(type) || !/^[A-Za-z0-9]{10,40}$/.test(id)) return null;
    const height = type === 'track' ? 152 : type === 'episode' || type === 'show' ? 232 : 352;
    return makeEmbed('spotify', 'Spotify', `https://open.spotify.com/embed/${type}/${id}?theme=0`, url.toString(), 'audio', height);
  }

  // Apple Music uses a stable embed subdomain; preserve only the recognized path.
  if (host === 'music.apple.com') {
    if (!/^\/[a-z]{2}(?:-[a-z]{2})?\/(?:album|song|playlist|music-video)\//i.test(path)) return null;
    return makeEmbed('apple-music', 'Apple Music', `https://embed.music.apple.com${path}${url.searchParams.has('i') ? `?i=${encodeURIComponent(url.searchParams.get('i') ?? '')}` : ''}`, url.toString(), 'audio', 450);
  }

  // SoundCloud's Widget only receives a URL from the validated soundcloud.com origin.
  if (host === 'soundcloud.com') {
    const parts = path.split('/').filter(Boolean);
    const reserved = new Set(['discover', 'stream', 'you', 'upload', 'settings', 'search', 'charts']);
    if (parts.length < 2 || reserved.has((parts[0] ?? '').toLowerCase())) return null;
    const trackUrl = `https://soundcloud.com/${parts.map((part) => encodeURIComponent(decodeURIComponentSafe(part))).join('/')}`;
    const params = new URLSearchParams({ url: trackUrl, color: '#ff4500', auto_play: 'false', hide_related: 'true', show_comments: 'false', show_reposts: 'false', show_teaser: 'true', visual: 'true' });
    return makeEmbed('soundcloud', 'SoundCloud', `https://w.soundcloud.com/player/?${params.toString()}`, url.toString(), 'audio', 300);
  }

  // Dailymotion long links and dai.ly short links.
  if (host === 'dailymotion.com' || host === 'dai.ly') {
    const id = host === 'dai.ly' ? path.split('/').filter(Boolean)[0] : path.match(/^\/video\/([A-Za-z0-9]+)/)?.[1];
    if (!id || !/^[A-Za-z0-9]{4,20}$/.test(id)) return null;
    return makeEmbed('dailymotion', 'Dailymotion', `https://www.dailymotion.com/embed/video/${id}`, url.toString(), 'video', 405, { ratio: '16 / 9' });
  }

  // Mixcloud sets and shows are exposed via its official widget.
  if (host === 'mixcloud.com') {
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const feed = `/${parts.map((part) => encodeURIComponent(decodeURIComponentSafe(part))).join('/')}/`;
    const params = new URLSearchParams({ hide_cover: '1', feed });
    return makeEmbed('mixcloud', 'Mixcloud', `https://www.mixcloud.com/widget/iframe/?${params.toString()}`, url.toString(), 'audio', 180);
  }

  // Scratch and TurboWarp projects. Arbitrary iframe hosts and arbitrary URL parameters are never reused.
  if (host === 'scratch.mit.edu') {
    const id = path.match(/^\/projects\/(\d+)(?:\/|$)/)?.[1];
    if (!id || id.length > 20) return null;
    return makeEmbed('scratch', 'Scratch', `https://scratch.mit.edu/projects/${id}/embed`, url.toString(), 'playground', 412, { ratio: '482 / 412', allow: `${PLAYER_ALLOW}; gamepad`, sandbox: INTERACTIVE_SANDBOX });
  }

  if (host === 'turbowarp.org') {
    const parts = path.split('/').filter(Boolean);
    let id = '';
    if (parts[0] === 'embed.html') id = url.searchParams.get('id') ?? '';
    else id = parts[0] ?? '';
    if (!/^\d{1,20}$/.test(id)) return null;
    const isEmbed = parts[1] === 'embed' || parts[0] === 'embed.html';
    const src = isEmbed ? `https://turbowarp.org/${id}/embed` : `https://turbowarp.org/${id}/embed`;
    return makeEmbed('turbowarp', 'TurboWarp', src, url.toString(), 'playground', 412, { ratio: '482 / 412', allow: `${PLAYER_ALLOW}; gamepad`, sandbox: INTERACTIVE_SANDBOX });
  }

  return null;
}

function decodeURIComponentSafe(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function findSupportedEmbedUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidates = value.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[),.!?\]}]+$/g, '');
    if (buildExternalEmbed(cleaned, 'example.com')) return cleaned;
  }
  return null;
}

export function isSupportedExternalEmbed(value: string | null | undefined): boolean {
  return Boolean(value && buildExternalEmbed(value, 'example.com'));
}
