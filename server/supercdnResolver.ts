import {
  SUPERCDN_BASE_URL,
  BROWSER_USER_AGENT,
  buildHlsProxyPath,
  warmInitialHlsStream,
  type SubtitleTrackItem,
} from './hlsEngine.js';
import {
  STREAMBETTER_PUBLIC_KEY,
  checkSuperFlixCatalogAvailable,
  probeStreamBetterAvailable,
} from './catalogAvailability.js';
import { renderStatusHtml, renderDirectVideoHtml } from './playerHtml.js';

export interface SuperCdnResolvedEntry {
  kind: 'redirect' | 'html';
  available: boolean;
  resolvedChannel: 1 | 2 | 3;
  url?: string;
  html?: string;
  masterHlsUrl?: string;
  embedOrigin?: string;
  directMediaUrl?: string;
  subtitleTracks?: SubtitleTrackItem[];
  expiresAt: number;
}

export interface ChannelAvailabilityReport {
  availableChannels: Array<1 | 2 | 3>;
  recommendedChannel: 1 | 2 | 3 | null;
  channels: {
    1: boolean;
    2: boolean;
    3: boolean;
  };
}

interface ResolvedProviderOption {
  videoId: string;
  url: string;
  captionUrl: string | null;
  host: string;
  isDublado: boolean;
}

interface TitleProvidersMap {
  slot1: ResolvedProviderOption | null;
  slot2Url: string;
  slot3Url: string;
  hasExplicitSuperFlix: boolean;
  hasExplicitStreamBetter: boolean;
  expiresAt: number;
}

const superCdnStreamCache = new Map<string, SuperCdnResolvedEntry>();
const SUPERCDN_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const inFlightChannelResolves = new Map<string, Promise<SuperCdnResolvedEntry>>();

const titleProvidersCache = new Map<string, TitleProvidersMap>();
const TITLE_PROVIDERS_TTL_MS = 3 * 60 * 1000; // 3 minutes
const inFlightTitleProviders = new Map<string, Promise<TitleProvidersMap>>();

const availabilityCache = new Map<
  string,
  { report: ChannelAvailabilityReport; expiresAt: number }
>();
const inFlightAvailability = new Map<string, Promise<ChannelAvailabilityReport>>();
const AVAILABILITY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function encodePackerBase(num: number, radix: number): string {
  const prefix = num < radix ? '' : encodePackerBase(Math.floor(num / radix), radix);
  const rem = num % radix;
  const char = rem > 35 ? String.fromCharCode(rem + 29) : rem.toString(36);
  return prefix + char;
}

function unpackDeanEdwards(html: string): string {
  const match = html.match(
    /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('((?:\\.|[^'\\])*)',\s*(\d+),\s*(\d+),\s*'((?:\\.|[^'\\])*)'\.split\('\|'\)/
  );
  if (!match) return '';
  let payload = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const radix = Number(match[2]);
  let count = Number(match[3]);
  const symtab = match[4].split('|');
  if (!radix || !count || symtab.length === 0) return '';

  const dict: Record<string, string> = {};
  while (count--) {
    const token = encodePackerBase(count, radix);
    dict[token] = symtab[count] || token;
  }

  payload = payload.replace(/\b\w+\b/g, (word) => dict[word] ?? word);
  return payload;
}

function extractCookieHeader(headers: Headers): string {
  const getSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const rawCookies: string[] =
    typeof getSetCookie === 'function'
      ? getSetCookie.call(headers)
      : headers.get('set-cookie')
      ? [headers.get('set-cookie') as string]
      : [];

  return rawCookies
    .map((c) => c.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

function decodeSuperCdnVideoUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
    if (/^https?:\/\//i.test(decoded)) return decoded;
    if (decoded.startsWith('//')) return `https:${decoded}`;
  } catch {
    // ignore invalid base64
  }
  return trimmed;
}

function isNativeCdnProvider(url: string, host: string): boolean {
  if (/\.(m3u8|mp4)(\?|$)/i.test(url)) return true;
  return (
    host.includes('vaiquecol') ||
    host.includes('plenoflu') ||
    host.includes('fireplayer') ||
    host.includes('firevideoplayer')
  );
}

function isSuperFlixProvider(host: string): boolean {
  return host.includes('superflix');
}

function isStreamBetterProvider(host: string): boolean {
  return host.includes('streambetter');
}

let cachedSuperCdnCookie: { cookie: string; expiresAt: number } | null = null;
let inFlightCookieFetch: Promise<string> | null = null;

async function getSuperCdnCookie(): Promise<string> {
  if (cachedSuperCdnCookie && cachedSuperCdnCookie.expiresAt > Date.now()) {
    return cachedSuperCdnCookie.cookie;
  }
  if (inFlightCookieFetch) {
    return inFlightCookieFetch;
  }

  inFlightCookieFetch = (async () => {
    try {
      const res = await fetch(`${SUPERCDN_BASE_URL}/`, {
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(6000),
      });
      const cookie = extractCookieHeader(res.headers);
      if (cookie) {
        cachedSuperCdnCookie = {
          cookie,
          expiresAt: Date.now() + 30 * 60 * 1000,
        };
        return cookie;
      }
    } catch {
      // ignore
    }
    return '';
  })();

  try {
    return await inFlightCookieFetch;
  } finally {
    inFlightCookieFetch = null;
  }
}

async function resolveAllTitleProviders(params: {
  type: 'movie' | 'tvshow';
  imdb: string;
  tmdbId?: string;
  season: string;
  episode: string;
}): Promise<TitleProvidersMap> {
  const { type, imdb, tmdbId, season, episode } = params;
  const hasValidImdb = /^tt\d{4,12}$/i.test(imdb);
  const mapKey = `${type}:${imdb || 'noimdb'}:${season}:${episode}:${tmdbId || ''}`;
  const cached = titleProvidersCache.get(mapKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const inflight = inFlightTitleProviders.get(mapKey);
  if (inflight) return inflight;

  const work = (async (): Promise<TitleProvidersMap> => {
    let html = '';
    let cookieHeader = '';
    let pageOk = false;
    const superCdnPageUrl =
      type === 'movie'
        ? `${SUPERCDN_BASE_URL}/movie/${imdb}`
        : `${SUPERCDN_BASE_URL}/tvshow/${imdb}/${season}/${episode}`;

    if (hasValidImdb) {
      const pageController = new AbortController();
      const pageTimeout = setTimeout(() => pageController.abort(), 9000);

      try {
        const sessionCookie = await getSuperCdnCookie();
        const pageRes = await fetch(superCdnPageUrl, {
          method: 'GET',
          headers: {
            Referer: `${SUPERCDN_BASE_URL}/`,
            'User-Agent': BROWSER_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            ...(sessionCookie ? { Cookie: sessionCookie } : {}),
          },
          signal: pageController.signal,
        });
        pageOk = pageRes.ok;
        const respCookies = extractCookieHeader(pageRes.headers);
        cookieHeader = respCookies || sessionCookie;
        html = pageRes.ok ? await pageRes.text() : '';
      } catch {
        pageOk = false;
      } finally {
        clearTimeout(pageTimeout);
      }
    }

    const candidates: Array<{ videoId: string; isDublado: boolean }> = [];
    const seenIds = new Set<string>();
    const pushCandidate = (idRaw: string, isDublado: boolean) => {
      const id = idRaw.trim();
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({ videoId: id, isDublado });
      }
    };

    if (pageOk && html) {
      const groupRegex =
        /<div[^>]*class="[^"]*players_select_items[^"]*"[^>]*data-target="(\d+)"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*players_select_items|<div[^>]*class="[^"]*player_footer|<script|$)/gi;
      const dubGroups: string[] = [];
      const subGroups: string[] = [];

      for (const gMatch of html.matchAll(groupRegex)) {
        if (gMatch[1] === '1') dubGroups.push(gMatch[2]);
        else subGroups.push(gMatch[2]);
      }

      const itemRegex =
        /<div[^>]*class="[^"]*player_select_item[^"]*"[^>]*data-id="([^"]+)"|<div[^>]*data-id="([^"]+)"[^>]*class="[^"]*player_select_item[^"]*"/gi;

      for (const block of dubGroups) {
        for (const m of block.matchAll(itemRegex)) {
          pushCandidate(m[1] || m[2] || '', true);
        }
      }
      for (const block of subGroups) {
        for (const m of block.matchAll(itemRegex)) {
          pushCandidate(m[1] || m[2] || '', false);
        }
      }
      for (const m of html.matchAll(itemRegex)) {
        pushCandidate(m[1] || m[2] || '', true);
      }
      for (const m of html.matchAll(/data-id="([^"]+)"/gi)) {
        const rawId = m[1];
        if (rawId && (rawId.startsWith('dyn:') || /^\d+$/.test(rawId))) {
          pushCandidate(rawId, true);
        }
      }

      if (candidates.length === 0 && type === 'tvshow') {
        let episodeContentId = '';
        const directEpMatch = html.match(/DIRECT_EPISODE_ID\s*=\s*['"]?(\d+)['"]?/i);
        if (directEpMatch && Number(directEpMatch[1]) > 0) {
          episodeContentId = directEpMatch[1];
        } else {
          const epMatches = [
            ...html.matchAll(
              /data-epi-num="(\d+)"[^>]*data-contentid="(\d+)"|data-contentid="(\d+)"[^>]*data-epi-num="(\d+)"/gi
            ),
          ];
          const exactEp = epMatches.find(
            (m) => (m[1] && m[1] === episode) || (m[4] && m[4] === episode)
          );
          if (exactEp) {
            episodeContentId = exactEp[2] || exactEp[3] || '';
          } else {
            const anyContentId = html.match(/data-contentid="(\d+)"/i);
            if (anyContentId) episodeContentId = anyContentId[1];
          }
        }

        if (episodeContentId) {
          try {
            const optRes = await fetch(`${SUPERCDN_BASE_URL}/api`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                Referer: superCdnPageUrl,
                Origin: SUPERCDN_BASE_URL,
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': BROWSER_USER_AGENT,
                ...(cookieHeader ? { Cookie: cookieHeader } : {}),
              },
              body: new URLSearchParams({
                action: 'getOptions',
                contentid: episodeContentId,
              }).toString(),
              signal: AbortSignal.timeout(6500),
            });

            if (optRes.ok) {
              const optText = await optRes.text();
              const optJson = JSON.parse(optText) as {
                data?: { options?: Array<{ ID: number | string; type?: string | number }> };
              };
              const rawOptions = optJson?.data?.options || [];
              const dublado = rawOptions.filter((o) => String(o.type) === '1');
              const legendado = rawOptions.filter((o) => String(o.type) !== '1');
              for (const opt of dublado) {
                pushCandidate(String(opt.ID || ''), true);
              }
              for (const opt of legendado) {
                pushCandidate(String(opt.ID || ''), false);
              }
            }
          } catch {
            // ignore options lookup error
          }
        }
      }
    }

    const resolvedOptions = (
      await Promise.all(
        candidates.slice(0, 8).map(async (cand): Promise<ResolvedProviderOption | null> => {
          try {
            const playerRes = await fetch(`${SUPERCDN_BASE_URL}/api`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                Referer: superCdnPageUrl,
                Origin: SUPERCDN_BASE_URL,
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': BROWSER_USER_AGENT,
                ...(cookieHeader ? { Cookie: cookieHeader } : {}),
              },
              body: new URLSearchParams({
                action: 'getPlayer',
                video_id: cand.videoId,
              }).toString(),
              signal: AbortSignal.timeout(6500),
            });
            if (!playerRes.ok) return null;
            const rawBody = await playerRes.text();
            const playerJson = JSON.parse(rawBody) as {
              data?: { video_url?: string; video_caption_url?: string | null };
            };
            const rawVideoUrl = playerJson?.data?.video_url;
            if (!rawVideoUrl) return null;
            const decoded = decodeSuperCdnVideoUrl(rawVideoUrl);
            if (!decoded || !/^https?:\/\//i.test(decoded)) return null;
            const host = new URL(decoded).hostname.toLowerCase();
            return {
              videoId: cand.videoId,
              url: decoded,
              captionUrl: playerJson.data?.video_caption_url || null,
              host,
              isDublado: cand.isDublado,
            };
          } catch {
            return null;
          }
        })
      )
    ).filter((item): item is ResolvedProviderOption => item !== null);

    // Deterministic Channel Assignment:
    // Canal 1 -> Native SuperCDN / FirePlayer HLS
    let slot1 = resolvedOptions.find((o) => isNativeCdnProvider(o.url, o.host)) || null;
    if (!slot1) {
      if (type === 'movie' && (hasValidImdb || tmdbId)) {
        const movieRef = hasValidImdb ? imdb : tmdbId;
        slot1 = {
          videoId: 'fallback-vaiquecol',
          url: `https://vaiquecol.com/embed2/${movieRef}`,
          captionUrl: null,
          host: 'vaiquecol.com',
          isDublado: true,
        };
      } else if (type === 'tvshow' && (tmdbId || hasValidImdb)) {
        const seriesRef = tmdbId || imdb;
        slot1 = {
          videoId: 'fallback-vaiquecol',
          url: `https://vaiquecol.com/embed2/${seriesRef}-${season}-${episode}`,
          captionUrl: null,
          host: 'vaiquecol.com',
          isDublado: true,
        };
      }
    }

    // Canal 2 -> Always SuperFlix
    const superFlixOption = resolvedOptions.find((o) => isSuperFlixProvider(o.host));
    let slot2Url = superFlixOption?.url || '';
    if (!slot2Url) {
      if (type === 'movie') {
        const movieRef = hasValidImdb ? imdb : tmdbId || '';
        if (movieRef) {
          slot2Url = `https://superflixapi.fun/filme/${movieRef}#noEpList`;
        }
      } else if (tmdbId) {
        slot2Url = `https://superflixapi.fun/serie/${tmdbId}/${season}/${episode}#noEpList`;
      }
    }

    // Canal 3 -> Always StreamBetter (or distinct 3rd-party provider if different)
    const streamBetterOption = resolvedOptions.find((o) => isStreamBetterProvider(o.host));
    const otherThirdPartyOption = resolvedOptions.find(
      (o) =>
        !isNativeCdnProvider(o.url, o.host) &&
        !isSuperFlixProvider(o.host) &&
        o.url !== slot2Url
    );
    let slot3Url = streamBetterOption?.url || otherThirdPartyOption?.url || '';
    if (!slot3Url) {
      if (type === 'movie') {
        const movieRef = tmdbId || (hasValidImdb ? imdb : '');
        if (movieRef) {
          slot3Url = `https://streambetter.lol/filme/${movieRef}?key=${STREAMBETTER_PUBLIC_KEY}`;
        }
      } else if (tmdbId) {
        slot3Url = `https://streambetter.lol/serie/${tmdbId}/${season}/${episode}?key=${STREAMBETTER_PUBLIC_KEY}`;
      }
    }

    const mapped: TitleProvidersMap = {
      slot1,
      slot2Url,
      slot3Url,
      hasExplicitSuperFlix: Boolean(superFlixOption),
      hasExplicitStreamBetter: Boolean(streamBetterOption || otherThirdPartyOption),
      expiresAt: Date.now() + TITLE_PROVIDERS_TTL_MS,
    };
    titleProvidersCache.set(mapKey, mapped);
    return mapped;
  })();

  inFlightTitleProviders.set(mapKey, work);
  try {
    return await work;
  } finally {
    inFlightTitleProviders.delete(mapKey);
  }
}

export async function resolveSuperCdnChannel(params: {
  type: 'movie' | 'tvshow';
  imdb: string;
  tmdbId?: string;
  season: string;
  episode: string;
  channel: 1 | 2 | 3;
  warmOnly?: boolean;
}): Promise<SuperCdnResolvedEntry> {
  const { type, imdb, tmdbId, season, episode, channel, warmOnly } = params;
  const cacheKey = `${type}:${imdb || 'noimdb'}:${tmdbId || ''}:${season}:${episode}:${channel}`;
  const cached = superCdnStreamCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (warmOnly && cached.masterHlsUrl && cached.embedOrigin) {
      await warmInitialHlsStream(cached.masterHlsUrl, cached.embedOrigin, true);
    }
    return cached;
  }

  const inflight = inFlightChannelResolves.get(cacheKey);
  if (inflight && !warmOnly) {
    return inflight;
  }

  const task = (async (): Promise<SuperCdnResolvedEntry> => {
    const providers = await resolveAllTitleProviders({
      type,
      imdb,
      tmdbId,
      season,
      episode,
    });

    if (channel === 2) {
      const sfCatalog = providers.hasExplicitSuperFlix
        ? true
        : await checkSuperFlixCatalogAvailable({ type, tmdbId, imdb });

      if (!providers.slot2Url || sfCatalog === false) {
        return {
          kind: 'html',
          available: false,
          resolvedChannel: 2,
          html: renderStatusHtml(
            'Canal 2 indisponível para este título',
            'Selecione outro canal disponível no topo do reprodutor para iniciar a transmissão.'
          ),
          expiresAt: Date.now() + 30 * 1000,
        };
      }
      const entry: SuperCdnResolvedEntry = {
        kind: 'redirect',
        available: true,
        resolvedChannel: 2,
        url: providers.slot2Url,
        expiresAt: Date.now() + SUPERCDN_CACHE_TTL_MS,
      };
      superCdnStreamCache.set(cacheKey, entry);
      return entry;
    }

    if (channel === 3) {
      const sbOk = providers.hasExplicitStreamBetter
        ? true
        : await probeStreamBetterAvailable(providers.slot3Url);

      if (!providers.slot3Url || !sbOk) {
        return {
          kind: 'html',
          available: false,
          resolvedChannel: 3,
          html: renderStatusHtml(
            'Canal 3 indisponível para este título',
            'Selecione outro canal disponível no topo do reprodutor para iniciar a transmissão.'
          ),
          expiresAt: Date.now() + 30 * 1000,
        };
      }
      const entry: SuperCdnResolvedEntry = {
        kind: 'redirect',
        available: true,
        resolvedChannel: 3,
        url: providers.slot3Url,
        expiresAt: Date.now() + SUPERCDN_CACHE_TTL_MS,
      };
      superCdnStreamCache.set(cacheKey, entry);
      return entry;
    }

    // Channel 1 — Native SuperCDN / FirePlayer HLS
    const slot1 = providers.slot1;
    if (!slot1 || !slot1.url) {
      return {
        kind: 'html',
        available: false,
        resolvedChannel: 1,
        html: renderStatusHtml(
          'Canal 1 indisponível para este título',
          'Toque em outro canal disponível no topo da tela para assistir imediatamente.'
        ),
        expiresAt: Date.now() + 30 * 1000,
      };
    }

    const resolvedStreamUrl = slot1.url;
    const resolvedCaptionUrl = slot1.captionUrl;

    if (/\.(m3u8|mp4)(\?|$)/i.test(resolvedStreamUrl)) {
      const captionTracks: SubtitleTrackItem[] =
        resolvedCaptionUrl && resolvedCaptionUrl.startsWith('http')
          ? [{ label: 'Português', lang: 'pt', src: resolvedCaptionUrl }]
          : [];
      const entry: SuperCdnResolvedEntry = {
        kind: 'html',
        available: true,
        resolvedChannel: 1,
        html: renderDirectVideoHtml(resolvedStreamUrl, captionTracks),
        directMediaUrl: resolvedStreamUrl,
        subtitleTracks: captionTracks,
        expiresAt: Date.now() + SUPERCDN_CACHE_TTL_MS,
      };
      superCdnStreamCache.set(cacheKey, entry);
      return entry;
    }

    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(resolvedStreamUrl);
    } catch {
      parsedUrl = null;
    }
    const parsedHost = parsedUrl ? parsedUrl.hostname.toLowerCase() : '';

    if (parsedUrl && (parsedHost.includes('vaiquecol') || parsedHost.includes('plenoflu'))) {
      const embedOrigin = parsedUrl.origin;
      let embedRes: Response | null = null;
      try {
        embedRes = await fetch(resolvedStreamUrl, {
          method: 'GET',
          headers: {
            Referer: `${SUPERCDN_BASE_URL}/`,
            'User-Agent': BROWSER_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(6500),
        });
      } catch {
        embedRes = null;
      }

      if (embedRes && embedRes.ok && embedRes.status === 200) {
        const embedCookies = extractCookieHeader(embedRes.headers);
        const embedHtml = await embedRes.text();

        const isApache404 =
          embedHtml.includes('404 Not Found') ||
          embedHtml.includes('The requested URL was not found on this server') ||
          embedHtml.includes('ErrorDocument to handle the request') ||
          embedHtml.includes('Acesso proibido');

        if (!isApache404) {
          const unpacked = unpackDeanEdwards(embedHtml);
          const fpHashMatch =
            unpacked.match(/FirePlayer\(\s*["']([a-f0-9]{32})["']/i) ||
            embedHtml.match(/FirePlayer\(\s*["']([a-f0-9]{32})["']/i) ||
            embedHtml.match(/\|([a-f0-9]{32})\|/i);

          const fireHash = fpHashMatch?.[1] || '';

          const subtitleTracks: SubtitleTrackItem[] = [];
          if (unpacked) {
            const tracksSection = unpacked.match(/"tracks"\s*:\s*(\[[\s\S]*?\])/);
            if (tracksSection?.[1]) {
              try {
                const parsedTracks = JSON.parse(tracksSection[1]) as Array<{
                  file?: string;
                  label?: string;
                  language?: string;
                }>;
                const prioritized = parsedTracks
                  .filter((tr) => Boolean(tr?.file))
                  .map((tr) => {
                    const meta = `${tr.language || ''} ${tr.label || ''}`.toLowerCase();
                    const isPt =
                      meta.includes('por') ||
                      meta.includes('pt') ||
                      meta.includes('portug') ||
                      meta.includes('brasil');
                    const isEn = meta.includes('eng') || meta.includes('english');
                    const isEs =
                      meta.includes('spa') || meta.includes('spanish') || meta.includes('espan');
                    return { tr, isPt, isEn, isEs };
                  })
                  .filter((item) => item.isPt || item.isEn || item.isEs)
                  .sort((a, b) => Number(b.isPt) - Number(a.isPt));

                for (const { tr, isPt, isEn } of prioritized) {
                  if (!tr.file) continue;
                  const absSub = new URL(tr.file, resolvedStreamUrl).toString();
                  subtitleTracks.push({
                    label: isPt ? 'Português' : isEn ? 'Inglês' : tr.label || 'Espanhol',
                    lang: isPt ? 'pt' : isEn ? 'en' : 'es',
                    src: buildHlsProxyPath(absSub, embedOrigin, 'subtitle'),
                    isDefault: false,
                  });
                }
              } catch {
                // ignore malformed tracks
              }
            }
          }

          if (fireHash) {
            try {
              const videoApiRes = await fetch(
                `${embedOrigin}/player/index.php?data=${fireHash}&do=getVideo`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    Referer: resolvedStreamUrl,
                    Origin: embedOrigin,
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': BROWSER_USER_AGENT,
                    ...(embedCookies ? { Cookie: embedCookies } : {}),
                  },
                  body: new URLSearchParams({
                    hash: fireHash,
                    r: `${SUPERCDN_BASE_URL}/`,
                  }).toString(),
                  signal: AbortSignal.timeout(7500),
                }
              );

              if (videoApiRes.ok) {
                const rawVideoBody = await videoApiRes.text();
                let videoJson: {
                  videoSource?: string;
                  securedLink?: string;
                  videoImage?: string;
                } | null = null;
                try {
                  videoJson = JSON.parse(rawVideoBody);
                } catch {
                  videoJson = null;
                }

                const masterHlsUrl = (videoJson?.videoSource || videoJson?.securedLink || '').trim();
                if (masterHlsUrl && /^https?:\/\//i.test(masterHlsUrl)) {
                  const proxiedMasterPath = buildHlsProxyPath(masterHlsUrl, embedOrigin, 'manifest');
                  const playerHtml = renderDirectVideoHtml(proxiedMasterPath, subtitleTracks, null);
                  const entry: SuperCdnResolvedEntry = {
                    kind: 'html',
                    available: true,
                    resolvedChannel: 1,
                    html: playerHtml,
                    masterHlsUrl,
                    embedOrigin,
                    subtitleTracks,
                    expiresAt: Date.now() + SUPERCDN_CACHE_TTL_MS,
                  };
                  superCdnStreamCache.set(cacheKey, entry);

                  if (warmOnly) {
                    await warmInitialHlsStream(masterHlsUrl, embedOrigin, true);
                  } else {
                    void warmInitialHlsStream(masterHlsUrl, embedOrigin, false);
                  }

                  return entry;
                }
              }
            } catch {
              // ignore getVideo error
            }
          }
        }
      }

      const deadVaiquecolEntry: SuperCdnResolvedEntry = {
        kind: 'html',
        available: false,
        resolvedChannel: 1,
        html: renderStatusHtml(
          'Canal 1 indisponível para este título',
          'Selecione outro canal disponível no topo do reprodutor para iniciar a transmissão.'
        ),
        expiresAt: Date.now() + 60 * 1000,
      };
      superCdnStreamCache.set(cacheKey, deadVaiquecolEntry);
      return deadVaiquecolEntry;
    }

    let isReachable = true;
    try {
      const probeRes = await fetch(resolvedStreamUrl, {
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: '*/*',
        },
        signal: AbortSignal.timeout(4500),
      });
      if (probeRes.status === 404 || probeRes.status === 410) {
        isReachable = false;
      }
    } catch {
      // optimistic on transient timeout
    }

    if (!isReachable) {
      const deadEntry: SuperCdnResolvedEntry = {
        kind: 'html',
        available: false,
        resolvedChannel: 1,
        html: renderStatusHtml(
          'Canal 1 indisponível para este título',
          'Selecione outro canal disponível no topo do reprodutor para iniciar a transmissão.'
        ),
        expiresAt: Date.now() + 60 * 1000,
      };
      superCdnStreamCache.set(cacheKey, deadEntry);
      return deadEntry;
    }

    const entry: SuperCdnResolvedEntry = {
      kind: 'redirect',
      available: true,
      resolvedChannel: 1,
      url: resolvedStreamUrl,
      expiresAt: Date.now() + SUPERCDN_CACHE_TTL_MS,
    };
    superCdnStreamCache.set(cacheKey, entry);
    return entry;
  })();

  inFlightChannelResolves.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inFlightChannelResolves.delete(cacheKey);
  }
}

/**
 * Stage 2: Real-Time 3-Channel Availability Check + Pre-Warm
 * Checks Canal 1 (SuperCDN HLS), Canal 2 (SuperFlix), and Canal 3 (StreamBetter) in parallel
 * while pre-warming Canal 1 playlists if available.
 */
export async function checkTitleChannelAvailability(params: {
  type: 'movie' | 'tvshow';
  imdb: string;
  tmdbId?: string;
  season: string;
  episode: string;
}): Promise<ChannelAvailabilityReport> {
  const { type, imdb, tmdbId, season, episode } = params;
  const key = `${type}:${imdb || 'noimdb'}:${tmdbId || ''}:${season}:${episode}`;
  const cached = availabilityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.report;
  }

  const inflight = inFlightAvailability.get(key);
  if (inflight) return inflight;

  const work = (async (): Promise<ChannelAvailabilityReport> => {
    const providers = await resolveAllTitleProviders({
      type,
      imdb,
      tmdbId,
      season,
      episode,
    });

    const [ch1Entry, sfStatus, sbAvailable] = await Promise.all([
      providers.slot1
        ? resolveSuperCdnChannel({
            type,
            imdb,
            tmdbId,
            season,
            episode,
            channel: 1,
            warmOnly: false,
          }).catch(() => null)
        : Promise.resolve(null),
      providers.hasExplicitSuperFlix
        ? Promise.resolve(true as const)
        : checkSuperFlixCatalogAvailable({ type, tmdbId, imdb }),
      providers.hasExplicitStreamBetter
        ? Promise.resolve(true)
        : probeStreamBetterAvailable(providers.slot3Url),
    ]);

    const ch1Ok = Boolean(ch1Entry && ch1Entry.available);
    const ch2Ok = Boolean(providers.slot2Url) && sfStatus !== false;
    const ch3Ok = Boolean(providers.slot3Url) && sbAvailable;

    const availableChannels: Array<1 | 2 | 3> = [];
    if (ch1Ok) availableChannels.push(1);
    if (ch2Ok) availableChannels.push(2);
    if (ch3Ok) availableChannels.push(3);

    const report: ChannelAvailabilityReport = {
      availableChannels,
      recommendedChannel: availableChannels[0] ?? null,
      channels: {
        1: ch1Ok,
        2: ch2Ok,
        3: ch3Ok,
      },
    };

    if (availabilityCache.size > 600) {
      const oldest = availabilityCache.keys().next().value;
      if (oldest) availabilityCache.delete(oldest);
    }
    availabilityCache.set(key, {
      report,
      expiresAt: Date.now() + AVAILABILITY_CACHE_TTL_MS,
    });

    return report;
  })();

  inFlightAvailability.set(key, work);
  try {
    return await work;
  } finally {
    inFlightAvailability.delete(key);
  }
}

/**
 * Stage 3: Automatic Channel Fallback
 * Resolves the requested channel; if unavailable for this title/episode, automatically
 * falls back to the next working channel in [1, 2, 3] order so playback never hits a dead end.
 */
export async function resolveStreamWithFallback(params: {
  type: 'movie' | 'tvshow';
  imdb: string;
  tmdbId?: string;
  season: string;
  episode: string;
  channel: 1 | 2 | 3;
  warmOnly?: boolean;
  allowFallback?: boolean;
}): Promise<SuperCdnResolvedEntry> {
  const primary = await resolveSuperCdnChannel(params);
  if (primary.available || params.warmOnly || params.allowFallback === false) {
    return primary;
  }

  const fallbackOrder: Array<1 | 2 | 3> = ([1, 2, 3] as const).filter(
    (c) => c !== params.channel
  );

  for (const altChannel of fallbackOrder) {
    const candidate = await resolveSuperCdnChannel({
      ...params,
      channel: altChannel,
    });
    if (candidate.available) {
      return candidate;
    }
  }

  return {
    kind: 'html',
    available: false,
    resolvedChannel: params.channel,
    html: renderStatusHtml(
      'Conteúdo temporariamente indisponível',
      'Este episódio ou título ainda não está disponível nos servidores de transmissão no momento.'
    ),
    expiresAt: Date.now() + 30 * 1000,
  };
}
