import crypto from 'node:crypto';

export const FALLBACK_SERVER_KEY = '4b50180f870c7d5977cee36f9da052ec';
export const SUPERCDN_BASE_URL = 'https://plenoflu.com';
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface SubtitleTrackItem {
  label: string;
  lang: string;
  src: string;
  isDefault?: boolean;
}

export interface CachedHlsManifest {
  body: string;
  isVod: boolean;
  expiresAt: number;
}

export interface CachedHlsSegment {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
}

interface IndexedMediaPlaylist {
  origin: string;
  segments: string[];
  lookaheadCount: number;
  updatedAt: number;
}

const hlsManifestCache = new Map<string, CachedHlsManifest>();
const MAX_MANIFEST_CACHE_ENTRIES = 60;

const hlsSegmentCache = new Map<string, CachedHlsSegment>();
let hlsSegmentCacheBytes = 0;
const MAX_SEGMENT_CACHE_BYTES = 180 * 1024 * 1024; // 180 MB bounded server RAM cache
const SEGMENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const inFlightSegmentFetches = new Map<string, Promise<CachedHlsSegment | null>>();

const playlistSegmentsIndex = new Map<string, IndexedMediaPlaylist>();
const segmentToPlaylistPos = new Map<string, { playlistKey: string; index: number }>();
const MAX_INDEXED_PLAYLISTS = 80;
const MAX_INDEXED_SEGMENT_POS = 30000;
let activeBgWarmFetches = 0;
const MAX_BG_WARM_CONCURRENCY = 28;

// Deterministic HMAC secret across serverless instances (Vercel & Cloud Run)
export function getHlsProxySecret(): string {
  const seed = process.env.HLS_PROXY_SECRET || process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
  return crypto.createHash('sha256').update(`loveflix-hls-v1:${seed}`).digest('hex');
}

function pruneManifestCache(): void {
  const now = Date.now();
  for (const [k, v] of hlsManifestCache.entries()) {
    if (v.expiresAt <= now) hlsManifestCache.delete(k);
  }
  while (hlsManifestCache.size > MAX_MANIFEST_CACHE_ENTRIES) {
    const oldestKey = hlsManifestCache.keys().next().value;
    if (!oldestKey) break;
    hlsManifestCache.delete(oldestKey);
  }
}

function putCachedSegment(key: string, buffer: Buffer, contentType: string): void {
  if (buffer.byteLength === 0 || buffer.byteLength > 8 * 1024 * 1024) return;
  const now = Date.now();
  const existing = hlsSegmentCache.get(key);
  if (existing) {
    hlsSegmentCacheBytes -= existing.buffer.byteLength;
    hlsSegmentCache.delete(key);
  }
  for (const [k, v] of hlsSegmentCache.entries()) {
    if (v.expiresAt <= now) {
      hlsSegmentCacheBytes -= v.buffer.byteLength;
      hlsSegmentCache.delete(k);
    }
  }
  while (
    hlsSegmentCache.size > 0 &&
    hlsSegmentCacheBytes + buffer.byteLength > MAX_SEGMENT_CACHE_BYTES
  ) {
    const oldestKey = hlsSegmentCache.keys().next().value;
    if (!oldestKey) break;
    const oldest = hlsSegmentCache.get(oldestKey);
    if (oldest) hlsSegmentCacheBytes -= oldest.buffer.byteLength;
    hlsSegmentCache.delete(oldestKey);
  }
  hlsSegmentCache.set(key, {
    buffer,
    contentType,
    expiresAt: now + SEGMENT_CACHE_TTL_MS,
  });
  hlsSegmentCacheBytes += buffer.byteLength;
}

function getCachedSegment(key: string): CachedHlsSegment | null {
  const entry = hlsSegmentCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    hlsSegmentCacheBytes -= entry.buffer.byteLength;
    hlsSegmentCache.delete(key);
    return null;
  }
  return entry;
}

export function signHlsProxyTarget(url: string, origin: string, kind: string): string {
  return crypto
    .createHmac('sha256', getHlsProxySecret())
    .update(`${kind}|${origin}|${url}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyHlsProxySignature(
  url: string,
  origin: string,
  kind: string,
  sig: string
): boolean {
  if (!sig || sig.length !== 32) return false;
  const expected = signHlsProxyTarget(url, origin, kind);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function buildHlsProxyPath(
  targetUrl: string,
  origin: string,
  kind: 'manifest' | 'segment' | 'subtitle'
): string {
  const sig = signHlsProxyTarget(targetUrl, origin, kind);
  const params = new URLSearchParams({
    kind,
    u: targetUrl,
    o: origin,
    s: sig,
  });
  return `/api/supercdn/hls-proxy?${params.toString()}`;
}

export function rewriteHlsManifest(
  manifestText: string,
  manifestUrl: string,
  origin: string
): string {
  const rawLines = manifestText.split(/\r?\n/);
  const hasPortugueseAudio = rawLines.some(
    (line) =>
      line.startsWith('#EXT-X-MEDIA:') &&
      /TYPE=AUDIO/i.test(line) &&
      (/LANGUAGE="(por|pt|pt-BR)"/i.test(line) || /NAME="[^"]*(Portug|Dublado|Brasil)/i.test(line))
  );

  let nextBareUrlIsVariant = false;

  const rewritten = rawLines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith('#')) {
      if (trimmed.startsWith('#EXT-X-STREAM-INF:')) {
        nextBareUrlIsVariant = true;
      } else if (trimmed.startsWith('#EXTINF:')) {
        nextBareUrlIsVariant = false;
      }

      let updatedTag = line;

      if (hasPortugueseAudio && trimmed.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/i.test(trimmed)) {
        const isPt =
          /LANGUAGE="(por|pt|pt-BR)"/i.test(trimmed) ||
          /NAME="[^"]*(Portug|Dublado|Brasil)/i.test(trimmed);
        if (isPt) {
          updatedTag = updatedTag.replace(/DEFAULT=NO/gi, 'DEFAULT=YES');
          if (!/DEFAULT=/i.test(updatedTag)) {
            updatedTag += ',DEFAULT=YES';
          }
          updatedTag = updatedTag.replace(/AUTOSELECT=NO/gi, 'AUTOSELECT=YES');
          if (!/AUTOSELECT=/i.test(updatedTag)) {
            updatedTag += ',AUTOSELECT=YES';
          }
        } else {
          updatedTag = updatedTag.replace(/DEFAULT=YES/gi, 'DEFAULT=NO');
          updatedTag = updatedTag.replace(/AUTOSELECT=YES/gi, 'AUTOSELECT=NO');
        }
      }

      if (/URI="[^"]+"/i.test(updatedTag)) {
        const childKind: 'manifest' | 'segment' =
          trimmed.startsWith('#EXT-X-MEDIA:') || trimmed.startsWith('#EXT-X-I-FRAME-STREAM-INF:')
            ? 'manifest'
            : 'segment';

        updatedTag = updatedTag.replace(/URI="([^"]+)"/gi, (_full, rawUri: string) => {
          try {
            const absUrl = new URL(rawUri.trim(), manifestUrl).toString();
            return `URI="${buildHlsProxyPath(absUrl, origin, childKind)}"`;
          } catch {
            return _full;
          }
        });
      }

      return updatedTag;
    }

    const lineKind: 'manifest' | 'segment' = nextBareUrlIsVariant ? 'manifest' : 'segment';
    nextBareUrlIsVariant = false;

    try {
      const absUrl = new URL(trimmed, manifestUrl).toString();
      return buildHlsProxyPath(absUrl, origin, lineKind);
    } catch {
      return line;
    }
  });

  return rewritten.join('\n');
}

export async function fetchUpstreamWithRetry(
  targetUrl: string,
  headers: Record<string, string>,
  timeoutMs: number,
  maxAttempts = 2
): Promise<globalThis.Response> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok || res.status === 206 || attempt === maxAttempts || res.status < 500) {
        return res;
      }
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt === maxAttempts) throw err;
    }
    await new Promise((r) => setTimeout(r, 180));
  }
  throw lastError || new Error('Upstream fetch failed');
}

function indexMediaPlaylistSegments(
  playlistKey: string,
  manifestText: string,
  manifestUrl: string,
  origin: string
): void {
  if (!manifestText.includes('#EXTINF:')) return;

  const lines = manifestText.split(/\r?\n/);
  const segments: string[] = [];
  let totalExtInfSec = 0;
  let extInfCount = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#EXTINF:')) {
      const durMatch = trimmed.match(/^#EXTINF:\s*([\d.]+)/);
      if (durMatch?.[1]) {
        const d = Number(durMatch[1]);
        if (Number.isFinite(d) && d > 0) {
          totalExtInfSec += d;
          extInfCount += 1;
        }
      }
      continue;
    }
    if (trimmed.startsWith('#')) continue;
    try {
      segments.push(new URL(trimmed, manifestUrl).toString());
    } catch {
      // ignore malformed URI
    }
  }

  if (segments.length === 0) return;

  const avgDur = extInfCount > 0 ? totalExtInfSec / extInfCount : 2;
  const lookaheadCount = avgDur >= 6 ? 5 : 28;

  while (playlistSegmentsIndex.size >= MAX_INDEXED_PLAYLISTS) {
    const oldestKey = playlistSegmentsIndex.keys().next().value;
    if (!oldestKey) break;
    playlistSegmentsIndex.delete(oldestKey);
  }
  playlistSegmentsIndex.set(playlistKey, {
    origin,
    segments,
    lookaheadCount,
    updatedAt: Date.now(),
  });

  if (segmentToPlaylistPos.size + segments.length > MAX_INDEXED_SEGMENT_POS) {
    segmentToPlaylistPos.clear();
  }
  for (let idx = 0; idx < segments.length; idx++) {
    segmentToPlaylistPos.set(`${origin}|${segments[idx]}`, { playlistKey, index: idx });
  }
}

export async function getOrFetchRewrittenManifest(
  targetUrl: string,
  origin: string
): Promise<{ body: string; isVod: boolean; rawText?: string } | null> {
  const cacheKey = `${origin}|${targetUrl}`;
  const cached = hlsManifestCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { body: cached.body, isVod: cached.isVod };
  }

  const upstream = await fetchUpstreamWithRetry(
    targetUrl,
    {
      Origin: origin,
      Referer: `${origin}/`,
      'User-Agent': BROWSER_USER_AGENT,
      Accept: '*/*',
    },
    12000,
    2
  );

  if (!upstream.ok) return null;
  const text = await upstream.text();
  if (!text.trimStart().startsWith('#EXTM3U')) return null;

  const isVod = text.includes('#EXT-X-ENDLIST');
  const rewritten = rewriteHlsManifest(text, targetUrl, origin);

  indexMediaPlaylistSegments(cacheKey, text, targetUrl, origin);

  pruneManifestCache();
  hlsManifestCache.set(cacheKey, {
    body: rewritten,
    isVod,
    expiresAt: Date.now() + (isVod ? 10 * 60 * 1000 : 2 * 60 * 1000),
  });

  return { body: rewritten, isVod, rawText: text };
}

export function inferSegmentContentType(targetUrl: string, upstreamContentType: string): string {
  const lowerCt = upstreamContentType.toLowerCase();
  if (lowerCt.includes('mp4') || /\.m4s(\?|$)/i.test(targetUrl)) {
    return upstreamContentType || 'video/mp4';
  }
  if (lowerCt.includes('aac') || /\.aac(\?|$)/i.test(targetUrl)) {
    return 'audio/aac';
  }
  return 'video/mp2t';
}

export async function getOrFetchCachedSegment(
  targetUrl: string,
  origin: string
): Promise<CachedHlsSegment | null> {
  const cacheKey = `${origin}|${targetUrl}`;
  const hit = getCachedSegment(cacheKey);
  if (hit) return hit;

  const existingFlight = inFlightSegmentFetches.get(cacheKey);
  if (existingFlight) return existingFlight;

  const flight = (async (): Promise<CachedHlsSegment | null> => {
    try {
      const upstream = await fetchUpstreamWithRetry(
        targetUrl,
        {
          Origin: origin,
          Referer: `${origin}/`,
          'User-Agent': BROWSER_USER_AGENT,
          Accept: '*/*',
        },
        30000,
        2
      );
      if (!upstream.ok) return null;
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.byteLength === 0) return null;
      const ct = inferSegmentContentType(targetUrl, upstream.headers.get('content-type') || '');
      putCachedSegment(cacheKey, buf, ct);
      return {
        buffer: buf,
        contentType: ct,
        expiresAt: Date.now() + SEGMENT_CACHE_TTL_MS,
      };
    } catch {
      return null;
    } finally {
      inFlightSegmentFetches.delete(cacheKey);
    }
  })();

  inFlightSegmentFetches.set(cacheKey, flight);
  return flight;
}

export function triggerServerReadAhead(targetUrl: string, origin: string): void {
  const pos = segmentToPlaylistPos.get(`${origin}|${targetUrl}`);
  if (!pos) return;
  const pl = playlistSegmentsIndex.get(pos.playlistKey);
  if (!pl) return;

  const dynamicLookahead =
    pl.lookaheadCount <= 5 ? pl.lookaheadCount : pos.index < 6 ? 10 : 24;
  const maxIdx = Math.min(pl.segments.length - 1, pos.index + dynamicLookahead);
  for (let i = pos.index + 1; i <= maxIdx; i++) {
    if (activeBgWarmFetches >= MAX_BG_WARM_CONCURRENCY) break;
    const nextUrl = pl.segments[i];
    const nextKey = `${origin}|${nextUrl}`;
    if (getCachedSegment(nextKey) || inFlightSegmentFetches.has(nextKey)) {
      continue;
    }
    activeBgWarmFetches += 1;
    void getOrFetchCachedSegment(nextUrl, origin).finally(() => {
      activeBgWarmFetches = Math.max(0, activeBgWarmFetches - 1);
    });
  }
}

export async function warmInitialHlsStream(
  masterHlsUrl: string,
  origin: string,
  awaitPlaylistsOnly = false
): Promise<void> {
  try {
    const master = await getOrFetchRewrittenManifest(masterHlsUrl, origin);
    if (!master) return;

    let rawMaster = master.rawText || '';
    if (!rawMaster) {
      const res = await fetchUpstreamWithRetry(
        masterHlsUrl,
        {
          Origin: origin,
          Referer: `${origin}/`,
          'User-Agent': BROWSER_USER_AGENT,
          Accept: '*/*',
        },
        8000,
        1
      );
      if (res.ok) rawMaster = await res.text();
    }
    if (!rawMaster) return;

    const lines = rawMaster.split(/\r?\n/);
    let ptAudioPlaylistUrl = '';
    let fallbackAudioPlaylistUrl = '';
    let firstVideoVariantUrl = '';

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/i.test(trimmed)) {
        const uriMatch = trimmed.match(/URI="([^"]+)"/i);
        if (uriMatch?.[1]) {
          const absAudio = new URL(uriMatch[1], masterHlsUrl).toString();
          if (
            /LANGUAGE="(por|pt|pt-BR)"/i.test(trimmed) ||
            /NAME="[^"]*(Portug|Dublado|Brasil)/i.test(trimmed)
          ) {
            ptAudioPlaylistUrl = absAudio;
          } else if (!fallbackAudioPlaylistUrl) {
            fallbackAudioPlaylistUrl = absAudio;
          }
        }
      } else if (!trimmed.startsWith('#') && !firstVideoVariantUrl) {
        firstVideoVariantUrl = new URL(trimmed, masterHlsUrl).toString();
      }
    }

    const chosenAudioUrl = ptAudioPlaylistUrl || fallbackAudioPlaylistUrl;
    await Promise.all([
      firstVideoVariantUrl
        ? getOrFetchRewrittenManifest(firstVideoVariantUrl, origin)
        : Promise.resolve(null),
      chosenAudioUrl
        ? getOrFetchRewrittenManifest(chosenAudioUrl, origin)
        : Promise.resolve(null),
    ]);

    const initialSegments: string[] = [];
    if (chosenAudioUrl) {
      const audioIndexed = playlistSegmentsIndex.get(`${origin}|${chosenAudioUrl}`);
      if (audioIndexed) {
        initialSegments.push(...audioIndexed.segments.slice(0, 2));
      }
    }
    if (firstVideoVariantUrl) {
      const videoIndexed = playlistSegmentsIndex.get(`${origin}|${firstVideoVariantUrl}`);
      if (videoIndexed) {
        initialSegments.push(...videoIndexed.segments.slice(0, 10));
      }
    }

    if (initialSegments.length === 0) return;

    const warmAllPromise = Promise.allSettled(
      initialSegments.map((segUrl) => getOrFetchCachedSegment(segUrl, origin))
    );

    if (awaitPlaylistsOnly) {
      await Promise.race([
        warmAllPromise,
        new Promise((resolve) => setTimeout(resolve, 3500)),
      ]);
    } else {
      void warmAllPromise;
    }
  } catch {
    // non-fatal background optimization
  }
}
