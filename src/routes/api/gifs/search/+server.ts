import { json, type RequestHandler } from '@sveltejs/kit';

type GifResult = { id: string; title: string; url: string; previewUrl: string; provider: 'tenor' | 'giphy' };
type TenorPayload = {
  results?: Array<{
    id?: string;
    title?: string;
    content_description?: string;
    media_formats?: { gif?: { url?: string }; tinygif?: { url?: string } };
  }>;
};
type GiphyPayload = {
  data?: Array<{
    id?: string;
    title?: string;
    images?: { original?: { url?: string }; fixed_width_small?: { url?: string } };
  }>;
};

function isValidGifUrl(raw: string) {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const trusted = host === 'media.tenor.com' || host === 'c.tenor.com' || host === 'i.giphy.com' || host === 'media.giphy.com' || /^media\d+\.giphy\.com$/.test(host);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port && trusted && /\.gif$/i.test(parsed.pathname);
  } catch { return false; }
}

async function searchTenor(query: string, fetcher: typeof fetch): Promise<GifResult[]> {
  const key = process.env.TENOR_API_KEY?.trim();
  if (!key) return [];
  const target = new URL('https://tenor.googleapis.com/v2/search');
  target.searchParams.set('q', query);
  target.searchParams.set('key', key);
  target.searchParams.set('client_key', 'nexus-social');
  target.searchParams.set('limit', '18');
  target.searchParams.set('media_filter', 'gif,tinygif');
  target.searchParams.set('contentfilter', 'medium');
  const response = await fetcher(target, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Tenor returned ${response.status}`);
  const payload = await response.json() as TenorPayload;
  return (payload.results ?? []).map((item) => {
    const url = String(item.media_formats?.gif?.url || item.media_formats?.tinygif?.url || '');
    return { id: `tenor-${String(item.id ?? '')}`, title: String(item.title || item.content_description || 'GIF').slice(0, 100), url, previewUrl: url, provider: 'tenor' as const };
  }).filter((item) => isValidGifUrl(item.url));
}

async function searchGiphy(query: string, fetcher: typeof fetch): Promise<GifResult[]> {
  const key = process.env.GIPHY_API_KEY?.trim();
  if (!key) return [];
  const target = new URL('https://api.giphy.com/v1/gifs/search');
  target.searchParams.set('api_key', key);
  target.searchParams.set('q', query);
  target.searchParams.set('limit', '18');
  target.searchParams.set('rating', 'pg-13');
  target.searchParams.set('lang', 'en');
  target.searchParams.set('bundle', 'messaging_non_clips');
  const response = await fetcher(target, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`GIPHY returned ${response.status}`);
  const payload = await response.json() as GiphyPayload;
  return (payload.data ?? []).map((item) => {
    const url = String(item.images?.original?.url ?? '');
    const previewUrl = String(item.images?.fixed_width_small?.url || url);
    return { id: `giphy-${String(item.id ?? '')}`, title: String(item.title || 'GIF').slice(0, 100), url, previewUrl: isValidGifUrl(previewUrl) ? previewUrl : url, provider: 'giphy' as const };
  }).filter((item) => isValidGifUrl(item.url));
}

/**
 * Provider keys are kept on the server. `provider=auto` merges both configured
 * providers; returned media URLs are validated before they can reach comments.
 */
export const GET: RequestHandler = async ({ url, fetch }) => {
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const provider = (url.searchParams.get('provider') ?? 'auto').trim().toLowerCase();
  if (!['auto', 'tenor', 'giphy'].includes(provider)) return json({ error: 'Choose auto, tenor, or giphy.', results: [] }, { status: 400 });
  const providers = { tenor: Boolean(process.env.TENOR_API_KEY?.trim()), giphy: Boolean(process.env.GIPHY_API_KEY?.trim()) };
  if (query.length < 2) return json({ results: [], configured: providers.tenor || providers.giphy, providers });
  const calls: Array<Promise<GifResult[]>> = [];
  const names: Array<'tenor' | 'giphy'> = [];
  if ((provider === 'auto' || provider === 'tenor') && providers.tenor) { names.push('tenor'); calls.push(searchTenor(query, fetch)); }
  if ((provider === 'auto' || provider === 'giphy') && providers.giphy) { names.push('giphy'); calls.push(searchGiphy(query, fetch)); }
  if (!calls.length) return json({ results: [], configured: false, providers, message: provider === 'auto' ? 'Configure TENOR_API_KEY and/or GIPHY_API_KEY on the server.' : `Configure ${provider === 'giphy' ? 'GIPHY_API_KEY' : 'TENOR_API_KEY'} on the server.` });
  const settled = await Promise.allSettled(calls);
  const results: GifResult[] = [];
  const errors: string[] = [];
  for (let index = 0; index < settled.length; index++) {
    const item = settled[index];
    if (item.status === 'fulfilled') results.push(...item.value);
    else errors.push(`${names[index]} search failed`);
  }
  const unique = new Map<string, GifResult>();
  for (const item of results) if (!unique.has(item.url)) unique.set(item.url, item);
  const merged = [...unique.values()].slice(0, 30);
  return json({ results: merged, configured: true, providers, partialError: errors.length ? 'One GIF provider could not be reached.' : null });
};
