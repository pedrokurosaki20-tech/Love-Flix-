import express from 'express';
import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
// Server-side credential lookup: never exposed to client bundles
const FALLBACK_SERVER_KEY = '4b50180f870c7d5977cee36f9da052ec';

const SUPERCDN_BASE_URL = 'https://plenoflu.com';
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Deterministic HMAC secret across serverless instances (Vercel & Cloud Run)
function getHlsProxySecret(): string {
  const seed = process.env.HLS_PROXY_SECRET || process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
  return crypto.createHash('sha256').update(`loveflix-hls-v1:${seed}`).digest('hex');
}

interface CacheEntry {
  status: number;
  data: unknown;
  expiresAt: number;
}

const tmdbServerCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_ENTRIES = 600;

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of tmdbServerCache.entries()) {
    if (entry.expiresAt <= now) {
      tmdbServerCache.delete(key);
    }
  }
  if (tmdbServerCache.size > MAX_CACHE_ENTRIES) {
    const excess = tmdbServerCache.size - MAX_CACHE_ENTRIES;
    let removed = 0;
    for (const key of tmdbServerCache.keys()) {
      tmdbServerCache.delete(key);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

interface SuperCdnResolvedEntry {
  kind: 'redirect' | 'html';
  url?: string;
  html?: string;
  masterHlsUrl?: string;
  embedOrigin?: string;
  expiresAt: number;
}

interface SubtitleTrackItem {
  label: string;
  lang: string;
  src: string;
  isDefault?: boolean;
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
  expiresAt: number;
}

interface CachedHlsManifest {
  body: string;
  isVod: boolean;
  expiresAt: number;
}

interface CachedHlsSegment {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
}

const STREAMBETTER_PUBLIC_KEY = 'sb_pk_49d645d49ff1a48b6bba90db256a9ea5c308fd26acabb415';

const superCdnStreamCache = new Map<string, SuperCdnResolvedEntry>();
const SUPERCDN_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const inFlightChannelResolves = new Map<string, Promise<SuperCdnResolvedEntry>>();

const titleProvidersCache = new Map<string, TitleProvidersMap>();
const TITLE_PROVIDERS_TTL_MS = 3 * 60 * 1000; // 3 minutes
const inFlightTitleProviders = new Map<string, Promise<TitleProvidersMap>>();

const hlsManifestCache = new Map<string, CachedHlsManifest>();
const MAX_MANIFEST_CACHE_ENTRIES = 60;

const hlsSegmentCache = new Map<string, CachedHlsSegment>();
let hlsSegmentCacheBytes = 0;
const MAX_SEGMENT_CACHE_BYTES = 180 * 1024 * 1024; // 180 MB bounded server RAM cache
const SEGMENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const inFlightSegmentFetches = new Map<string, Promise<CachedHlsSegment | null>>();

interface IndexedMediaPlaylist {
  origin: string;
  segments: string[];
  lookaheadCount: number;
  updatedAt: number;
}

const playlistSegmentsIndex = new Map<string, IndexedMediaPlaylist>();
const segmentToPlaylistPos = new Map<string, { playlistKey: string; index: number }>();
const MAX_INDEXED_PLAYLISTS = 80;
const MAX_INDEXED_SEGMENT_POS = 30000;
let activeBgWarmFetches = 0;
const MAX_BG_WARM_CONCURRENCY = 28;

function pruneManifestCache() {
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

function putCachedSegment(key: string, buffer: Buffer, contentType: string) {
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

function signHlsProxyTarget(url: string, origin: string, kind: string): string {
  return crypto
    .createHmac('sha256', getHlsProxySecret())
    .update(`${kind}|${origin}|${url}`)
    .digest('hex')
    .slice(0, 32);
}

function verifyHlsProxySignature(
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

function buildHlsProxyPath(
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

function rewriteHlsManifest(manifestText: string, manifestUrl: string, origin: string): string {
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

async function fetchUpstreamWithRetry(
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
      if ((res.ok || res.status === 206) || attempt === maxAttempts || res.status < 500) {
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
  // ~56s lookahead for 2s video segments (28 segments), ~50s for 10s audio segments (5 segments)
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

async function getOrFetchRewrittenManifest(
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

function inferSegmentContentType(targetUrl: string, upstreamContentType: string): string {
  const lowerCt = upstreamContentType.toLowerCase();
  if (lowerCt.includes('mp4') || /\.m4s(\?|$)/i.test(targetUrl)) {
    return upstreamContentType || 'video/mp4';
  }
  if (lowerCt.includes('aac') || /\.aac(\?|$)/i.test(targetUrl)) {
    return 'audio/aac';
  }
  return 'video/mp2t';
}

async function getOrFetchCachedSegment(
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

function triggerServerReadAhead(targetUrl: string, origin: string): void {
  const pos = segmentToPlaylistPos.get(`${origin}|${targetUrl}`);
  if (!pos) return;
  const pl = playlistSegmentsIndex.get(pos.playlistKey);
  if (!pl) return;

  // Use a focused 10-segment burst at the very beginning for fastest startup, then full lookahead
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

async function warmInitialHlsStream(
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

    // Fast-start initial burst: 2 audio (20s) + 10 video (20s) = 12 segments (~2 per CDN shard)
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
      // Give serverless warm requests a 3.5s head-start on the 28 parallel segments
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

function renderStatusHtml(title: string, message: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      background: #080808;
      color: #ffffff;
      font-family: 'Nunito Sans', system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
    }
    .box {
      max-width: 440px;
      background: #121212;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 28px 24px;
    }
    .dot {
      width: 40px;
      height: 4px;
      border-radius: 999px;
      background: #E50914;
      margin: 0 auto 16px;
    }
    h1 { font-size: 18px; font-weight: 800; margin-bottom: 8px; }
    p { font-size: 14px; line-height: 1.55; color: #A1A1A1; }
  </style>
</head>
<body>
  <div class="box">
    <div class="dot"></div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

function renderDirectVideoHtml(
  streamUrl: string,
  captionTracks: SubtitleTrackItem[] = [],
  posterUrl?: string | null
): string {
  const safeStream = JSON.stringify(streamUrl);
  const safeTracks = JSON.stringify(captionTracks);
  const safePoster = posterUrl ? JSON.stringify(posterUrl) : 'null';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <meta name="referrer" content="no-referrer" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      background: #000000;
      color: #ffffff;
      font-family: 'Nunito Sans', system-ui, -apple-system, sans-serif;
      overflow: hidden;
      user-select: none;
    }
    .stage {
      position: relative;
      width: 100%;
      height: 100%;
      background: #000000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    video {
      width: 100%;
      height: 100%;
      background: #000000;
      outline: none;
    }
    .spinner-wrap {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: rgba(8, 8, 8, 0.55);
      pointer-events: none;
      z-index: 10;
      transition: opacity 0.2s ease;
    }
    .spinner-wrap.hidden {
      opacity: 0;
    }
    .ring {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 3px solid rgba(255, 255, 255, 0.16);
      border-top-color: #E50914;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .tap-play {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.45);
      z-index: 15;
      cursor: pointer;
    }
    .tap-play.visible {
      display: flex;
    }
    .tap-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 14px 26px;
      border-radius: 999px;
      border: none;
      background: #E50914;
      color: #ffffff;
      font-size: 15px;
      font-weight: 800;
      box-shadow: 0 10px 30px rgba(229, 9, 20, 0.45);
      cursor: pointer;
    }
    .audio-bar {
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 12;
      display: none;
      align-items: center;
      gap: 6px;
      background: rgba(18, 18, 18, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.14);
      padding: 4px;
      border-radius: 10px;
      backdrop-filter: blur(8px);
    }
    .audio-bar.visible {
      display: flex;
    }
    .audio-btn {
      border: none;
      background: transparent;
      color: #A1A1A1;
      font-size: 12px;
      font-weight: 700;
      padding: 5px 10px;
      border-radius: 7px;
      cursor: pointer;
    }
    .audio-btn.active {
      background: #E50914;
      color: #ffffff;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
</head>
<body>
  <div class="stage">
    <video id="v" controls autoplay playsinline preload="auto"></video>
    <div id="audioBar" class="audio-bar"></div>
    <div id="spinner" class="spinner-wrap">
      <div class="ring"></div>
    </div>
    <div id="tapPlay" class="tap-play">
      <button type="button" class="tap-btn">&#9654; Reproduzir</button>
    </div>
  </div>
  <script>
    (function() {
      const src = ${safeStream};
      const tracks = ${safeTracks};
      const poster = ${safePoster};
      const video = document.getElementById('v');
      const spinner = document.getElementById('spinner');
      const tapPlay = document.getElementById('tapPlay');
      const audioBar = document.getElementById('audioBar');

      if (poster) {
        video.poster = poster;
      }

      if (Array.isArray(tracks)) {
        tracks.forEach((t) => {
          if (!t || !t.src) return;
          const tr = document.createElement('track');
          tr.kind = 'subtitles';
          tr.label = t.label || 'Português';
          tr.srclang = t.lang || 'pt';
          tr.src = t.src;
          if (t.isDefault) tr.default = true;
          video.appendChild(tr);
        });
      }

      const MIN_START_BUFFER_SEC = 12;
      const MIN_REBUFFER_SEC = 10;

      let initialCushionDone = false;
      let gatePaused = false;
      let gateStartedAt = 0;
      let userPaused = false;
      let playPending = false;
      let streamEnded = false;
      let waitingTimer = null;

      const showSpinner = () => {
        spinner.classList.remove('hidden');
      };

      const hideSpinner = () => {
        if (waitingTimer) {
          clearTimeout(waitingTimer);
          waitingTimer = null;
        }
        if (!gatePaused) {
          spinner.classList.add('hidden');
        }
      };

      const getBufferedAhead = () => {
        const ct = video.currentTime || 0;
        const buf = video.buffered;
        let bestAhead = 0;
        for (let i = 0; i < buf.length; i++) {
          const start = buf.start(i);
          const end = buf.end(i);
          if (ct >= start - 0.85 && ct <= end + 0.15) {
            bestAhead = Math.max(bestAhead, Math.max(0, end - Math.max(ct, start)));
          }
        }
        return bestAhead;
      };

      const enterBufferGate = () => {
        if (gatePaused || userPaused || video.ended || streamEnded) return;
        gatePaused = true;
        gateStartedAt = Date.now();
        showSpinner();
        if (!playPending && !video.paused) {
          try {
            video.pause();
          } catch {}
        }
      };

      const safePlay = () => {
        if (playPending || userPaused || gatePaused) return;
        playPending = true;
        const p = video.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            playPending = false;
            tapPlay.classList.remove('visible');
            const ahead = getBufferedAhead();
            if (!initialCushionDone && ahead < MIN_START_BUFFER_SEC && !streamEnded) {
              enterBufferGate();
            } else {
              initialCushionDone = true;
              hideSpinner();
            }
          }).catch((err) => {
            playPending = false;
            if (err && err.name === 'NotAllowedError') {
              gatePaused = false;
              spinner.classList.add('hidden');
              tapPlay.classList.add('visible');
            }
          });
        } else {
          playPending = false;
        }
      };

      const evaluateBufferGate = () => {
        if (!gatePaused) return;
        if (userPaused) {
          gatePaused = false;
          spinner.classList.add('hidden');
          return;
        }
        const ahead = getBufferedAhead();
        const waitedMs = Date.now() - gateStartedAt;
        const targetSec = initialCushionDone ? MIN_REBUFFER_SEC : MIN_START_BUFFER_SEC;
        const ready =
          ahead >= targetSec ||
          streamEnded ||
          video.ended ||
          (ahead >= 6 && waitedMs > 9500) ||
          (ahead >= 3 && waitedMs > 16000);

        if (ready) {
          initialCushionDone = true;
          gatePaused = false;
          hideSpinner();
          safePlay();
        }
      };

      setInterval(evaluateBufferGate, 250);

      video.addEventListener('pause', () => {
        if (!gatePaused && !video.ended && !playPending) {
          userPaused = true;
          spinner.classList.add('hidden');
        }
      });

      video.addEventListener('play', () => {
        if (!gatePaused) {
          userPaused = false;
        }
      });

      video.addEventListener('playing', () => {
        tapPlay.classList.remove('visible');
        if (!gatePaused) {
          hideSpinner();
        }
      });

      video.addEventListener('progress', evaluateBufferGate);
      video.addEventListener('canplaythrough', evaluateBufferGate);
      video.addEventListener('ended', () => {
        streamEnded = true;
        gatePaused = false;
        hideSpinner();
      });

      video.addEventListener('waiting', () => {
        if (userPaused || video.ended || streamEnded) return;
        const ahead = getBufferedAhead();
        if (ahead < 1.5 && !playPending) {
          enterBufferGate();
          return;
        }
        if (!waitingTimer) {
          waitingTimer = setTimeout(() => {
            waitingTimer = null;
            if (!video.paused && video.readyState < 3) {
              showSpinner();
            }
          }, 400);
        }
      });

      tapPlay.addEventListener('click', () => {
        tapPlay.classList.remove('visible');
        userPaused = false;
        gatePaused = false;
        video.muted = false;
        safePlay();
      });

      const isHlsSource = src.includes('.m3u8') || src.includes('/api/supercdn/hls-proxy');

      if (isHlsSource && window.Hls && window.Hls.isSupported()) {
        // ====================================================================
        // Server-Side 28-Way Parallel Batch Warmer + Clean Native Sequential HLS
        // Eliminates browser 6-connection starvation & 4G saturation while
        // keeping the Node/Cloudflare cache ~100s ahead at >4x real-time speed.
        // ====================================================================
        const LOOKAHEAD_WINDOW_SEC = 110;
        const FAST_BURST_URLS = 12; // 2 audio (20s) + 10 video (20s) for fastest initial/seek start
        const CRUISE_BATCH_URLS = 14; // 2-3 audio + 11-12 video (~24s in ~6.8s = 3.5x speed, <10s Vercel Hobby limit)
        const WARM_TTL_MS = 210 * 1000;

        const warmedMap = new Map();
        let inFlightWarmCtrl = null;
        let warmPendingImmediate = false;
        let initialWarmTimer = null;
        let videoFrags = [];
        let audioFrags = [];

        const toProxyRelUrl = (rawUrl) => {
          try {
            const u = new URL(rawUrl, window.location.origin);
            if (!u.pathname.startsWith('/api/supercdn/hls-proxy')) return null;
            return u.pathname + u.search;
          } catch {
            return null;
          }
        };

        const pruneWarmedMap = () => {
          const cutoff = Date.now() - WARM_TTL_MS;
          for (const [k, ts] of warmedMap.entries()) {
            if (ts < cutoff) warmedMap.delete(k);
          }
        };

        const collectNextColdUrls = (anchorSec, urgentBurst) => {
          pruneWarmedMap();
          const maxTotal = urgentBurst ? FAST_BURST_URLS : CRUISE_BATCH_URLS;
          const maxAudio = urgentBurst ? 2 : 3;
          const windowEnd = anchorSec + (urgentBurst ? 24 : LOOKAHEAD_WINDOW_SEC);
          const batch = [];
          const seen = new Set();

          for (let i = 0; i < audioFrags.length; i++) {
            if (batch.length >= maxAudio) break;
            const f = audioFrags[i];
            const fStart = f.start || 0;
            const fEnd = fStart + (f.duration || 10);
            if (fEnd < anchorSec - 1) continue;
            if (fStart > anchorSec + 50) break;
            const rel = toProxyRelUrl(f.url);
            if (rel && !warmedMap.has(rel) && !seen.has(rel)) {
              seen.add(rel);
              batch.push(rel);
            }
          }

          for (let i = 0; i < videoFrags.length; i++) {
            if (batch.length >= maxTotal) break;
            const f = videoFrags[i];
            const fStart = f.start || 0;
            const fEnd = fStart + (f.duration || 2);
            if (fEnd < anchorSec - 0.5) continue;
            if (fStart > windowEnd) break;
            const rel = toProxyRelUrl(f.url);
            if (rel && !warmedMap.has(rel) && !seen.has(rel)) {
              seen.add(rel);
              batch.push(rel);
            }
          }

          return batch;
        };

        const pumpServerWarm = (forceResetInFlight) => {
          if (forceResetInFlight && inFlightWarmCtrl) {
            inFlightWarmCtrl.abort();
            inFlightWarmCtrl = null;
          }
          if (inFlightWarmCtrl) {
            warmPendingImmediate = true;
            return;
          }

          const anchor = video.currentTime || 0;
          const isUrgent = !initialCushionDone || gatePaused || getBufferedAhead() < 14;
          let batchUrls = collectNextColdUrls(anchor, isUrgent);
          if (batchUrls.length === 0 && isUrgent) {
            batchUrls = collectNextColdUrls(anchor, false);
          }
          if (batchUrls.length === 0) return;

          const ctrl = new AbortController();
          inFlightWarmCtrl = ctrl;
          const sentAt = Date.now();
          batchUrls.forEach((u) => warmedMap.set(u, sentAt));

          fetch('/api/supercdn/hls-warm-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: batchUrls }),
            signal: ctrl.signal,
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (!data || !Array.isArray(data.warmed)) {
                batchUrls.forEach((u) => warmedMap.delete(u));
                return;
              }
              const okSet = new Set(data.warmed);
              const doneAt = Date.now();
              batchUrls.forEach((u, idx) => {
                if (okSet.has(idx)) {
                  warmedMap.set(u, doneAt);
                } else {
                  warmedMap.delete(u);
                }
              });
            })
            .catch(() => {
              batchUrls.forEach((u) => warmedMap.delete(u));
            })
            .finally(() => {
              if (inFlightWarmCtrl === ctrl) {
                inFlightWarmCtrl = null;
              }
              const remaining = collectNextColdUrls(video.currentTime || 0, false);
              if (warmPendingImmediate || remaining.length >= 6) {
                warmPendingImmediate = false;
                setTimeout(() => pumpServerWarm(false), 60);
              }
            });
        };

        let initialPlaylistsReady = false;

        const scheduleInitialWarm = () => {
          if (initialWarmTimer) clearTimeout(initialWarmTimer);
          const hasAudioTracks = (hls.audioTracks || []).length > 0;
          const bothReady = videoFrags.length > 0 && (!hasAudioTracks || audioFrags.length > 0);
          if (bothReady) {
            initialPlaylistsReady = true;
            pumpServerWarm(false);
            return;
          }
          initialWarmTimer = setTimeout(() => {
            initialWarmTimer = null;
            initialPlaylistsReady = true;
            pumpServerWarm(false);
          }, 80);
        };

        video.addEventListener('seeking', () => {
          streamEnded = false;
          if (!userPaused && getBufferedAhead() < 2) {
            enterBufferGate();
          }
          pumpServerWarm(true);
        });

        let lastWarmTick = 0;
        video.addEventListener('timeupdate', () => {
          if (!gatePaused) hideSpinner();
          const now = Date.now();
          if (now - lastWarmTick > 3500) {
            lastWarmTick = now;
            pumpServerWarm(false);
          }
        });

        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 90,
          maxMaxBufferLength: 180,
          backBufferLength: 30,
          maxBufferSize: 120 * 1000 * 1000,
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.2,
          nudgeMaxRetry: 10,
          startFragPrefetch: true,
          fragLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 35000,
              maxLoadTimeMs: 45000,
              timeoutRetry: {
                maxNumRetry: 6,
                retryDelayMs: 500,
                maxRetryDelayMs: 4000,
              },
              errorRetry: {
                maxNumRetry: 6,
                retryDelayMs: 500,
                maxRetryDelayMs: 4000,
              },
            },
          },
          playlistLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 20000,
              maxLoadTimeMs: 25000,
              timeoutRetry: {
                maxNumRetry: 4,
                retryDelayMs: 400,
                maxRetryDelayMs: 3000,
              },
              errorRetry: {
                maxNumRetry: 4,
                retryDelayMs: 400,
                maxRetryDelayMs: 3000,
              },
            },
          },
          manifestLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 20000,
              maxLoadTimeMs: 25000,
              timeoutRetry: {
                maxNumRetry: 4,
                retryDelayMs: 400,
                maxRetryDelayMs: 3000,
              },
              errorRetry: {
                maxNumRetry: 4,
                retryDelayMs: 400,
                maxRetryDelayMs: 3000,
              },
            },
          },
        });

        let initialAudioSelected = false;

        const renderAudioButtons = () => {
          const list = hls.audioTracks || [];
          if (list.length <= 1) {
            audioBar.classList.remove('visible');
            return;
          }
          audioBar.innerHTML = '';
          list.forEach((track, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const rawName = (track.name || track.lang || ('Áudio ' + (idx + 1))).toLowerCase();
            let label = track.name || ('Áudio ' + (idx + 1));
            if (rawName.includes('por') || rawName.includes('pt')) label = 'Dublado (PT)';
            else if (rawName.includes('eng') || rawName.includes('en')) label = 'Original (EN)';
            else if (rawName.includes('jpn') || rawName.includes('ja')) label = 'Original (JP)';
            else if (rawName.includes('kor') || rawName.includes('ko')) label = 'Original (KR)';
            btn.textContent = label;
            btn.className = 'audio-btn' + (hls.audioTrack === idx ? ' active' : '');
            btn.addEventListener('click', () => {
              audioFrags = [];
              hls.audioTrack = idx;
              renderAudioButtons();
            });
            audioBar.appendChild(btn);
          });
          audioBar.classList.add('visible');
        };

        const preferPortugueseTrack = () => {
          const list = hls.audioTracks || [];
          if (!initialAudioSelected && list.length > 1) {
            const ptIdx = list.findIndex((t) => {
              const s = ((t.lang || '') + ' ' + (t.name || '')).toLowerCase();
              return s.includes('por') || s.includes('portug') || s === 'pt';
            });
            if (ptIdx >= 0 && hls.audioTrack !== ptIdx) {
              hls.audioTrack = ptIdx;
            }
            initialAudioSelected = true;
          }
          renderAudioButtons();
        };

        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          preferPortugueseTrack();
          safePlay();
        });

        hls.on(window.Hls.Events.LEVEL_LOADED, (_ev, data) => {
          if (data && data.details && Array.isArray(data.details.fragments)) {
            videoFrags = data.details.fragments;
            scheduleInitialWarm();
          }
        });

        hls.on(window.Hls.Events.AUDIO_TRACK_LOADED, (_ev, data) => {
          if (data && data.details && Array.isArray(data.details.fragments)) {
            audioFrags = data.details.fragments;
            if (!initialPlaylistsReady) {
              scheduleInitialWarm();
            } else {
              pumpServerWarm(true);
            }
          }
        });

        hls.on(window.Hls.Events.FRAG_BUFFERED, evaluateBufferGate);
        hls.on(window.Hls.Events.BUFFER_EOS, () => {
          streamEnded = true;
          evaluateBufferGate();
        });

        hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, preferPortugueseTrack);
        hls.on(window.Hls.Events.AUDIO_TRACK_SWITCHED, renderAudioButtons);

        hls.on(window.Hls.Events.ERROR, (_ev, data) => {
          if (!data || !data.fatal) return;
          if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        });
      } else {
        video.src = src;
        video.addEventListener('loadedmetadata', safePlay, { once: true });
        safePlay();
      }
    })();
  </script>
</body>
</html>`;
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

async function resolveAllTitleProviders(params: {
  type: 'movie' | 'tvshow';
  imdb: string;
  tmdbId?: string;
  season: string;
  episode: string;
}): Promise<TitleProvidersMap> {
  const { type, imdb, tmdbId, season, episode } = params;
  const mapKey = `${type}:${imdb}:${season}:${episode}:${tmdbId || ''}`;
  const cached = titleProvidersCache.get(mapKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const inflight = inFlightTitleProviders.get(mapKey);
  if (inflight) return inflight;

  const work = (async (): Promise<TitleProvidersMap> => {
    const superCdnPageUrl =
      type === 'movie'
        ? `${SUPERCDN_BASE_URL}/movie/${imdb}`
        : `${SUPERCDN_BASE_URL}/tvshow/${imdb}/${season}/${episode}`;

    const pageController = new AbortController();
    const pageTimeout = setTimeout(() => pageController.abort(), 12000);

    let html = '';
    let cookieHeader = '';
    let pageOk = false;

    try {
      const pageRes = await fetch(superCdnPageUrl, {
        method: 'GET',
        headers: {
          Referer: `${SUPERCDN_BASE_URL}/`,
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: pageController.signal,
      });
      pageOk = pageRes.ok;
      cookieHeader = extractCookieHeader(pageRes.headers);
      html = pageRes.ok ? await pageRes.text() : '';
    } catch {
      pageOk = false;
    } finally {
      clearTimeout(pageTimeout);
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
      // Extract grouped language blocks first so Dublado (data-target="1") always precedes Legendado (data-target="2")
      const groupRegex =
        /<div[^>]*class="[^"]*players_select_items[^"]*"[^>]*data-target="(\d+)"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*players_select_items|<div[^>]*class="[^"]*player_footer|<script|$)/gi;
      const dubGroups: string[] = [];
      const subGroups: string[] = [];

      for (const gMatch of html.matchAll(groupRegex)) {
        if (gMatch[1] === '1') dubGroups.push(gMatch[2]);
        else subGroups.push(gMatch[2]);
      }

      const itemRegex =
        /<div[^>]*class="[^"]*player_select_item[^"]*"[^>]*data-id="(\d+)"[^>]*>|<div[^>]*data-id="(\d+)"[^>]*class="[^"]*player_select_item[^"]*"[^>]*>/gi;

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
      // Fallback scan in case markup didn't wrap in players_select_items
      for (const m of html.matchAll(itemRegex)) {
        pushCandidate(m[1] || m[2] || '', true);
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
              signal: AbortSignal.timeout(8000),
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

    // Resolve all candidate videoIds in parallel so we can classify by actual provider domain
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
              signal: AbortSignal.timeout(8000),
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

    // Deterministic Channel Assignment (never swaps Canal 2 and Canal 3!)
    // Canal 1 -> Native SuperCDN / FirePlayer HLS
    const slot1 =
      resolvedOptions.find((o) => isNativeCdnProvider(o.url, o.host)) || null;

    // Canal 2 -> Always SuperFlix
    const superFlixOption = resolvedOptions.find((o) => isSuperFlixProvider(o.host));
    let slot2Url = superFlixOption?.url || '';
    if (!slot2Url) {
      if (type === 'movie') {
        slot2Url = `https://superflixapi.fun/filme/${imdb}#noEpList`;
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
        slot3Url = `https://streambetter.lol/filme/${tmdbId || imdb}?key=${STREAMBETTER_PUBLIC_KEY}`;
      } else if (tmdbId) {
        slot3Url = `https://streambetter.lol/serie/${tmdbId}/${season}/${episode}?key=${STREAMBETTER_PUBLIC_KEY}`;
      }
    }

    const mapped: TitleProvidersMap = {
      slot1,
      slot2Url,
      slot3Url,
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

async function resolveSuperCdnChannel(params: {
  type: 'movie' | 'tvshow';
  imdb: string;
  tmdbId?: string;
  season: string;
  episode: string;
  channel: 1 | 2 | 3;
  warmOnly?: boolean;
}): Promise<SuperCdnResolvedEntry> {
  const { type, imdb, tmdbId, season, episode, channel, warmOnly } = params;
  const cacheKey = `${type}:${imdb}:${season}:${episode}:${channel}`;
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
      if (!providers.slot2Url) {
        return {
          kind: 'html',
          html: renderStatusHtml(
            'Canal 2 indisponível para este título',
            'Selecione Canal 1 ou Canal 3 no topo do reprodutor para iniciar a transmissão.'
          ),
          expiresAt: Date.now() + 30 * 1000,
        };
      }
      const entry: SuperCdnResolvedEntry = {
        kind: 'redirect',
        url: providers.slot2Url,
        expiresAt: Date.now() + SUPERCDN_CACHE_TTL_MS,
      };
      superCdnStreamCache.set(cacheKey, entry);
      return entry;
    }

    if (channel === 3) {
      if (!providers.slot3Url) {
        return {
          kind: 'html',
          html: renderStatusHtml(
            'Canal 3 indisponível para este título',
            'Selecione Canal 1 ou Canal 2 no topo do reprodutor para iniciar a transmissão.'
          ),
          expiresAt: Date.now() + 30 * 1000,
        };
      }
      const entry: SuperCdnResolvedEntry = {
        kind: 'redirect',
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
        html: renderStatusHtml(
          'Canal 1 indisponível para este título',
          'Toque em Canal 2 ou Canal 3 no topo da tela para assistir imediatamente.'
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
        html: renderDirectVideoHtml(resolvedStreamUrl, captionTracks),
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
      const embedRes = await fetch(resolvedStreamUrl, {
        method: 'GET',
        headers: {
          Referer: `${SUPERCDN_BASE_URL}/`,
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (embedRes.ok) {
        const embedCookies = extractCookieHeader(embedRes.headers);
        const embedHtml = await embedRes.text();

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
                  const isEs = meta.includes('spa') || meta.includes('spanish') || meta.includes('espan');
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
              signal: AbortSignal.timeout(10000),
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
                html: playerHtml,
                masterHlsUrl,
                embedOrigin,
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
        }
      }

      return {
        kind: 'html',
        html: renderStatusHtml(
          'Canal 1 indisponível para este título',
          'Toque em Canal 2 ou Canal 3 no topo da tela para assistir imediatamente.'
        ),
        expiresAt: Date.now() + 30 * 1000,
      };
    }

    const entry: SuperCdnResolvedEntry = {
      kind: 'redirect',
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

const ALLOWED_PREFIXES = [
  'trending/',
  'movie/',
  'tv/',
  'discover/',
  'search/',
  'genre/',
  'person/',
  'collection/',
  'configuration',
];

export function registerApiRoutes(app: Express): void {
  // Normalize Vercel rewrite paths if /api prefix was stripped
  app.use((req, _res, next) => {
    if (
      req.url.startsWith('/tmdb/') ||
      req.url.startsWith('/supercdn/') ||
      req.url === '/health' ||
      req.url.startsWith('/health?')
    ) {
      req.url = `/api${req.url}`;
    }
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    const apiKey = process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
    res.json({ ok: true, tmdbConfigured: Boolean(apiKey) });
  });

  app.get('/api/tmdb/*', async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
      if (!apiKey) {
        res.status(500).json({
          error: 'TMDB_API_KEY não configurada no servidor.',
        });
        return;
      }

      const rawSubpath = (req.params as Record<string, string>)[0] || '';
      const cleanPath = rawSubpath.replace(/^\/+/, '').replace(/\.\./g, '');

      const isAllowed = ALLOWED_PREFIXES.some(
        (prefix) => cleanPath === prefix || cleanPath.startsWith(prefix)
      );

      if (!cleanPath || !isAllowed) {
        res.status(400).json({ error: 'Endpoint TMDB inválido ou não permitido.' });
        return;
      }

      const targetUrl = new URL(`${TMDB_BASE_URL}/${cleanPath}`);

      if (!req.query.language) {
        targetUrl.searchParams.set('language', 'pt-BR');
      }

      for (const [key, value] of Object.entries(req.query)) {
        if (key.toLowerCase() === 'api_key') continue;
        if (Array.isArray(value)) {
          targetUrl.searchParams.set(key, String(value[0]));
        } else if (value !== undefined && value !== null && String(value) !== '') {
          targetUrl.searchParams.set(key, String(value));
        }
      }

      if (!targetUrl.searchParams.has('include_adult')) {
        targetUrl.searchParams.set('include_adult', 'false');
      }

      const cacheKey = `${cleanPath}?${targetUrl.searchParams.toString()}`;
      const cached = tmdbServerCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.setHeader('X-LoveFlix-Cache', 'HIT');
        res.status(cached.status).json(cached.data);
        return;
      }

      targetUrl.searchParams.set('api_key', apiKey);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const upstream = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = upstream.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await upstream.json()
        : { error: await upstream.text() };

      if (upstream.ok) {
        pruneCache();
        tmdbServerCache.set(cacheKey, {
          status: upstream.status,
          data: payload,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
      }

      res.setHeader('X-LoveFlix-Cache', 'MISS');
      res.status(upstream.status).json(payload);
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'Tempo limite excedido ao consultar a TMDB.'
          : 'Falha de comunicação com o serviço da TMDB.';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/supercdn/stream', async (req: Request, res: Response) => {
    try {
      const rawType = String(req.query.type || 'movie').toLowerCase();
      const type: 'movie' | 'tvshow' = rawType === 'tv' || rawType === 'tvshow' ? 'tvshow' : 'movie';
      const imdb = String(req.query.imdb || '').trim();
      const tmdbId = String(req.query.tmdbId || '').replace(/\D/g, '');
      const season = String(Math.max(1, Number(req.query.season) || 1));
      const episode = String(Math.max(1, Number(req.query.episode) || 1));
      const rawChannel = Number(req.query.channel) || 1;
      const channel: 1 | 2 | 3 = rawChannel === 2 ? 2 : rawChannel === 3 ? 3 : 1;
      const warmOnly = req.query.warm === '1';

      if (!/^tt\d{4,12}$/i.test(imdb)) {
        if (warmOnly) {
          res.status(204).end();
          return;
        }
        res
          .status(400)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .send(
            renderStatusHtml(
              'Identificador IMDb não encontrado',
              'Este título ainda não possui código IMDb vinculado na base pública para reprodução.'
            )
          );
        return;
      }

      const resolved = await resolveSuperCdnChannel({
        type,
        imdb,
        tmdbId: tmdbId || undefined,
        season,
        episode,
        channel,
        warmOnly,
      });

      if (warmOnly) {
        res.status(200).json({ ok: true, kind: resolved.kind });
        return;
      }

      if (resolved.kind === 'redirect' && resolved.url) {
        res.redirect(302, resolved.url);
        return;
      }

      res
        .status(200)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(
          resolved.html ||
            renderStatusHtml(
              'Canal temporariamente indisponível',
              'Selecione outro canal no topo da tela para continuar assistindo.'
            )
        );
    } catch {
      if (req.query.warm === '1') {
        res.status(200).json({ ok: false });
        return;
      }
      res
        .status(502)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(
          renderStatusHtml(
            'Falha ao conectar ao servidor de vídeo',
            'Alternando ou tentando outro canal (Canal 1, Canal 2 ou Canal 3) você pode iniciar a reprodução imediatamente.'
          )
        );
    }
  });

  app.post('/api/supercdn/hls-warm-batch', async (req: Request, res: Response) => {
    try {
      const rawUrls: unknown[] = Array.isArray(req.body?.urls) ? req.body.urls : [];
      const validTargets: Array<{ idx: number; targetUrl: string; origin: string }> = [];

      for (let idx = 0; idx < Math.min(rawUrls.length, 32); idx++) {
        const raw = rawUrls[idx];
        if (typeof raw !== 'string' || !raw) continue;
        try {
          const parsed = new URL(raw, 'http://localhost');
          const kind = parsed.searchParams.get('kind') || 'segment';
          const targetUrl = parsed.searchParams.get('u') || '';
          const origin = parsed.searchParams.get('o') || 'https://vaiquecol.com';
          const sig = parsed.searchParams.get('s') || '';
          if (
            kind === 'segment' &&
            targetUrl &&
            /^https?:\/\//i.test(targetUrl) &&
            verifyHlsProxySignature(targetUrl, origin, 'segment', sig)
          ) {
            validTargets.push({ idx, targetUrl, origin });
          }
        } catch {
          // skip malformed entry
        }
      }

      if (validTargets.length === 0) {
        res.status(200).json({ ok: true, warmed: [], count: 0 });
        return;
      }

      const warmedIndices: number[] = [];
      const tasks = validTargets.map(async (item) => {
        const seg = await getOrFetchCachedSegment(item.targetUrl, item.origin);
        if (seg) {
          warmedIndices.push(item.idx);
        }
      });

      await Promise.race([
        Promise.allSettled(tasks),
        new Promise((resolve) => setTimeout(resolve, 8200)),
      ]);

      res.status(200).json({
        ok: true,
        warmed: warmedIndices,
        count: warmedIndices.length,
      });
    } catch {
      res.status(200).json({ ok: false, warmed: [], count: 0 });
    }
  });

  app.get('/api/supercdn/hls-proxy', async (req: Request, res: Response) => {
    try {
      const kind = String(req.query.kind || 'segment');
      const targetUrl = String(req.query.u || '');
      const origin = String(req.query.o || 'https://vaiquecol.com');
      const sig = String(req.query.s || '');

      if (
        !targetUrl ||
        !/^https?:\/\//i.test(targetUrl) ||
        (kind !== 'manifest' && kind !== 'segment' && kind !== 'subtitle') ||
        !verifyHlsProxySignature(targetUrl, origin, kind, sig)
      ) {
        res.status(403).end('Forbidden');
        return;
      }

      if (kind === 'manifest') {
        const manifest = await getOrFetchRewrittenManifest(targetUrl, origin);
        if (!manifest) {
          res.status(502).end();
          return;
        }
        res.status(200);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader(
          'Cache-Control',
          manifest.isVod ? 'public, max-age=300, s-maxage=1800' : 'public, max-age=60'
        );
        res.send(manifest.body);
        return;
      }

      if (kind === 'subtitle') {
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
        if (!upstream.ok) {
          res.status(upstream.status).end();
          return;
        }
        let subText = await upstream.text();
        if (!subText.trimStart().startsWith('WEBVTT')) {
          subText = `WEBVTT\n\n${subText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
        }
        res.status(200);
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        res.send(subText);
        return;
      }

      // Kick off automatic server-side parallel read-ahead (also covers iOS Safari native HLS)
      triggerServerReadAhead(targetUrl, origin);

      // Segment delivery: use deduplicated warm cache for standard full-segment requests
      if (!req.headers.range) {
        const seg = await getOrFetchCachedSegment(targetUrl, origin);
        if (!seg) {
          res.status(502).end();
          return;
        }
        res.status(200);
        res.setHeader('Content-Type', seg.contentType);
        res.setHeader(
          'Cache-Control',
          'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600'
        );
        res.setHeader('Content-Length', String(seg.buffer.byteLength));
        res.end(seg.buffer);
        return;
      }

      // Byte-range fallback stream
      const upstreamHeaders: Record<string, string> = {
        Origin: origin,
        Referer: `${origin}/`,
        'User-Agent': BROWSER_USER_AGENT,
        Accept: '*/*',
        Range: String(req.headers.range),
      };

      const upstream = await fetchUpstreamWithRetry(targetUrl, upstreamHeaders, 15000, 2);

      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).end();
        return;
      }

      res.status(upstream.status);
      res.setHeader(
        'Content-Type',
        inferSegmentContentType(targetUrl, upstream.headers.get('content-type') || '')
      );
      res.setHeader(
        'Cache-Control',
        'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600'
      );
      const contentLen = upstream.headers.get('content-length');
      if (contentLen) res.setHeader('Content-Length', contentLen);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);

      if (upstream.body) {
        const nodeStream = Readable.fromWeb(
          upstream.body as unknown as import('node:stream/web').ReadableStream
        );
        nodeStream.on('error', () => {
          if (!res.headersSent) res.status(502);
          res.end();
        });
        nodeStream.pipe(res);
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.end(buf);
      }
    } catch {
      if (!res.headersSent) {
        res.status(502);
      }
      res.end();
    }
  });
}

// Standalone Express app exported as default for Vercel Serverless Functions (/api/*)
const vercelApiApp = express();
vercelApiApp.disable('x-powered-by');
vercelApiApp.use(express.json({ limit: '256kb' }));
registerApiRoutes(vercelApiApp);

export default vercelApiApp;
