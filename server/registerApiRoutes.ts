import type { Express, Request, Response } from 'express';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import {
  FALLBACK_SERVER_KEY,
  BROWSER_USER_AGENT,
  verifyHlsProxySignature,
  fetchUpstreamWithRetry,
  getOrFetchRewrittenManifest,
  inferSegmentContentType,
  getOrFetchCachedSegment,
  triggerServerReadAhead,
} from './hlsEngine.js';
import { discoverCuratedDoramas } from './catalogAvailability.js';
import { renderStatusHtml } from './playerHtml.js';
import {
  checkTitleChannelAvailability,
  resolveStreamWithFallback,
} from './supercdnResolver.js';
import { registerExternalBridgeRoutes } from './externalRoomBridge.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

interface CacheEntry {
  status: number;
  data: unknown;
  expiresAt: number;
}

const tmdbServerCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_ENTRIES = 600;

function pruneCache(): void {
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
  app.use((req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    if (
      req.url.startsWith('/tmdb/') ||
      req.url.startsWith('/supercdn/') ||
      req.url.startsWith('/bridge/') ||
      req.url === '/health' ||
      req.url.startsWith('/health?')
    ) {
      req.url = `/api${req.url}`;
    }
    next();
  });

  registerExternalBridgeRoutes(app);

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

  // Stage 1: Curated Doramas Discovery Endpoint (filters out 0-channel Asian broadcast shows)
  app.get('/api/supercdn/doramas', async (req: Request, res: Response) => {
    try {
      const data = await discoverCuratedDoramas(req.query as Record<string, unknown>);
      if (!data) {
        res.status(502).json({ error: 'Não foi possível consultar o catálogo de doramas.' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=180, s-maxage=900');
      res.status(200).json(data);
    } catch {
      res.status(502).json({ error: 'Falha ao carregar catálogo curado de doramas.' });
    }
  });

  // Stage 2: Real-Time 3-Channel Availability Inspection + Canal 1 Pre-Warm
  app.get('/api/supercdn/availability', async (req: Request, res: Response) => {
    try {
      const rawType = String(req.query.type || 'movie').toLowerCase();
      const type: 'movie' | 'tvshow' =
        rawType === 'tv' || rawType === 'tvshow' ? 'tvshow' : 'movie';
      const imdb = String(req.query.imdb || '').trim();
      const tmdbId = String(req.query.tmdbId || '').replace(/\D/g, '');
      const season = String(Math.max(1, Number(req.query.season) || 1));
      const episode = String(Math.max(1, Number(req.query.episode) || 1));

      if (!/^tt\d{4,12}$/i.test(imdb) && !tmdbId) {
        res.status(200).json({
          ok: true,
          availableChannels: [],
          recommendedChannel: null,
          channels: { 1: false, 2: false, 3: false },
        });
        return;
      }

      const report = await checkTitleChannelAvailability({
        type,
        imdb,
        tmdbId: tmdbId || undefined,
        season,
        episode,
      });

      res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300');
      res.status(200).json({
        ok: true,
        ...report,
      });
    } catch {
      res.status(200).json({
        ok: false,
        availableChannels: [1, 2, 3],
        recommendedChannel: 1,
        channels: { 1: true, 2: true, 3: true },
      });
    }
  });

  // Stage 3: Stream Resolver with Optional IMDb + Automatic Channel Fallback
  app.get('/api/supercdn/stream', async (req: Request, res: Response) => {
    try {
      const rawType = String(req.query.type || 'movie').toLowerCase();
      const type: 'movie' | 'tvshow' =
        rawType === 'tv' || rawType === 'tvshow' ? 'tvshow' : 'movie';
      const imdb = String(req.query.imdb || '').trim();
      const tmdbId = String(req.query.tmdbId || '').replace(/\D/g, '');
      const season = String(Math.max(1, Number(req.query.season) || 1));
      const episode = String(Math.max(1, Number(req.query.episode) || 1));
      const rawChannel = Number(req.query.channel) || 1;
      const channel: 1 | 2 | 3 = rawChannel === 2 ? 2 : rawChannel === 3 ? 3 : 1;
      const warmOnly = req.query.warm === '1';
      const allowFallback = req.query.nofallback !== '1';

      if (!/^tt\d{4,12}$/i.test(imdb) && !tmdbId) {
        if (warmOnly) {
          res.status(204).end();
          return;
        }
        res
          .status(400)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .send(
            renderStatusHtml(
              'Identificador não encontrado',
              'Este título ainda não possui código vinculado para reprodução.'
            )
          );
        return;
      }

      const resolved = await resolveStreamWithFallback({
        type,
        imdb,
        tmdbId: tmdbId || undefined,
        season,
        episode,
        channel,
        warmOnly,
        allowFallback,
      });

      if (warmOnly) {
        res.status(200).json({
          ok: true,
          kind: resolved.kind,
          available: resolved.available,
          resolvedChannel: resolved.resolvedChannel,
        });
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
            'Alternando ou tentando outro canal você pode iniciar a reprodução imediatamente.'
          )
        );
    }
  });

  app.options('/api/supercdn/hls-warm-batch', (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
  });

  app.post('/api/supercdn/hls-warm-batch', async (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
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
          // ignore invalid url entry
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

      res.status(200).json({ ok: true, warmed: warmedIndices, count: warmedIndices.length });
    } catch {
      res.status(200).json({ ok: false, warmed: [], count: 0 });
    }
  });

  app.options('/api/supercdn/hls-proxy', (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.status(204).end();
  });

  app.get('/api/supercdn/hls-proxy', async (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
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

      triggerServerReadAhead(targetUrl, origin);

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
        const nodeStream = Readable.fromWeb(upstream.body as unknown as NodeWebReadableStream);
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
