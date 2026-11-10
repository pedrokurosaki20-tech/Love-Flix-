import { BROWSER_USER_AGENT, FALLBACK_SERVER_KEY } from './hlsEngine.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const STREAMBETTER_PUBLIC_KEY = 'sb_pk_49d645d49ff1a48b6bba90db256a9ea5c308fd26acabb415';

interface SuperFlixCatalogState {
  tvTmdbIds: Set<string>;
  movieTmdbIds: Set<string>;
  movieImdbIds: Set<string>;
  loadedOk: boolean;
  expiresAt: number;
}

let superFlixCatalog: SuperFlixCatalogState | null = null;
let inFlightCatalogLoad: Promise<SuperFlixCatalogState> | null = null;
const SUPERFLIX_CATALOG_TTL_MS = 30 * 60 * 1000; // 30 minutes

const streamBetterProbeCache = new Map<string, { available: boolean; expiresAt: number }>();
const inFlightStreamBetterProbes = new Map<string, Promise<boolean>>();
const STREAMBETTER_PROBE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_PROBE_CACHE_ENTRIES = 1500;

interface CuratedDoramasCacheEntry {
  payload: {
    page: number;
    results: Record<string, unknown>[];
    total_pages: number;
    total_results: number;
  };
  expiresAt: number;
}

const curatedDoramasCache = new Map<string, CuratedDoramasCacheEntry>();
const inFlightCuratedDoramas = new Map<
  string,
  Promise<CuratedDoramasCacheEntry['payload'] | null>
>();
const CURATED_DORAMAS_TTL_MS = 15 * 60 * 1000; // 15 minutes

async function fetchSuperFlixList(
  category: 'dorama' | 'serie' | 'anime' | 'filme',
  type: 'tmdb' | 'imdb'
): Promise<string[] | null> {
  try {
    const res = await fetch(
      `https://superflixapi.fun/lista?category=${category}&type=${type}&format=json`,
      {
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Referer: 'https://superflixapi.fun/',
          Accept: 'application/json, text/plain, */*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(7000),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) return null;
    return json.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return null;
  }
}

export async function getSuperFlixCatalogIndex(): Promise<SuperFlixCatalogState> {
  if (superFlixCatalog && superFlixCatalog.expiresAt > Date.now()) {
    return superFlixCatalog;
  }
  if (inFlightCatalogLoad) {
    return inFlightCatalogLoad;
  }

  inFlightCatalogLoad = (async (): Promise<SuperFlixCatalogState> => {
    try {
      const [doramas, series, animes, moviesTmdb, moviesImdb] = await Promise.all([
        fetchSuperFlixList('dorama', 'tmdb'),
        fetchSuperFlixList('serie', 'tmdb'),
        fetchSuperFlixList('anime', 'tmdb'),
        fetchSuperFlixList('filme', 'tmdb'),
        fetchSuperFlixList('filme', 'imdb'),
      ]);

      const tvTmdbIds = new Set<string>();
      for (const list of [doramas, series, animes]) {
        if (list) {
          for (const id of list) tvTmdbIds.add(id);
        }
      }

      const movieTmdbIds = new Set<string>();
      if (moviesTmdb) {
        for (const id of moviesTmdb) movieTmdbIds.add(id);
      }

      const movieImdbIds = new Set<string>();
      if (moviesImdb) {
        for (const id of moviesImdb) movieImdbIds.add(id.toLowerCase());
      }

      const loadedOk = tvTmdbIds.size > 0 || movieTmdbIds.size > 0 || movieImdbIds.size > 0;
      const state: SuperFlixCatalogState = {
        tvTmdbIds,
        movieTmdbIds,
        movieImdbIds,
        loadedOk,
        expiresAt: Date.now() + (loadedOk ? SUPERFLIX_CATALOG_TTL_MS : 60 * 1000),
      };
      superFlixCatalog = state;
      return state;
    } finally {
      inFlightCatalogLoad = null;
    }
  })();

  return inFlightCatalogLoad;
}

export async function checkSuperFlixCatalogAvailable(params: {
  type: 'movie' | 'tvshow';
  tmdbId?: string;
  imdb?: string;
}): Promise<boolean | 'unknown'> {
  const index = await getSuperFlixCatalogIndex();
  if (!index.loadedOk) return 'unknown';

  const cleanTmdb = (params.tmdbId || '').replace(/\D/g, '');
  const cleanImdb = (params.imdb || '').trim().toLowerCase();

  if (params.type === 'tvshow') {
    if (!cleanTmdb) return 'unknown';
    return index.tvTmdbIds.has(cleanTmdb);
  }

  if (cleanTmdb && index.movieTmdbIds.has(cleanTmdb)) return true;
  if (cleanImdb && index.movieImdbIds.has(cleanImdb)) return true;
  if (!cleanTmdb && !cleanImdb) return 'unknown';
  return false;
}

export async function probeStreamBetterAvailable(slot3Url: string): Promise<boolean> {
  if (!slot3Url) return false;
  const cached = streamBetterProbeCache.get(slot3Url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.available;
  }

  const inflight = inFlightStreamBetterProbes.get(slot3Url);
  if (inflight) return inflight;

  const task = (async (): Promise<boolean> => {
    try {
      const res = await fetch(slot3Url, {
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(3000),
      });

      if (res.status === 404 || res.status === 410) {
        saveProbeCache(slot3Url, false);
        return false;
      }

      if (res.status >= 500) {
        return true;
      }

      const text = await res.text();
      const isUnavailable =
        text.includes('content-unavailable-page') ||
        /conte[uú]do\s+indispon[ií]vel|n[aã]o\s+encontrado/i.test(text);

      const available = res.ok && !isUnavailable;
      saveProbeCache(slot3Url, available);
      return available;
    } catch {
      // Fail-open on transient network timeout so a working channel is never wrongly hidden
      return true;
    } finally {
      inFlightStreamBetterProbes.delete(slot3Url);
    }
  })();

  inFlightStreamBetterProbes.set(slot3Url, task);
  return task;
}

function saveProbeCache(url: string, available: boolean): void {
  if (streamBetterProbeCache.size >= MAX_PROBE_CACHE_ENTRIES) {
    const oldest = streamBetterProbeCache.keys().next().value;
    if (oldest) streamBetterProbeCache.delete(oldest);
  }
  streamBetterProbeCache.set(url, {
    available,
    expiresAt: Date.now() + STREAMBETTER_PROBE_TTL_MS,
  });
}

async function fetchTmdbDiscoverTvPage(
  params: URLSearchParams,
  apiKey: string
): Promise<{
  results: Array<Record<string, unknown>>;
  total_pages: number;
  total_results: number;
} | null> {
  const url = new URL(`${TMDB_BASE_URL}/discover/tv`);
  params.forEach((v, k) => url.searchParams.set(k, v));
  url.searchParams.set('api_key', apiKey);
  if (!url.searchParams.has('language')) url.searchParams.set('language', 'pt-BR');
  if (!url.searchParams.has('include_adult')) url.searchParams.set('include_adult', 'false');

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<Record<string, unknown>>;
      total_pages?: number;
      total_results?: number;
    };
    return {
      results: Array.isArray(data.results) ? data.results : [],
      total_pages: Number(data.total_pages) || 1,
      total_results: Number(data.total_results) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Stage 1: Curated Doramas Discovery
 * Combines BR-distributed Doramas + global TMDB Dorama pages and filters against real
 * multi-channel availability (SuperFlix dorama/serie index + StreamBetter live check),
 * keeping every Dorama available in 1, 2, or all 3 channels while removing dead 0/3 titles.
 */
export async function discoverCuratedDoramas(
  rawQuery: Record<string, unknown>
): Promise<CuratedDoramasCacheEntry['payload'] | null> {
  const apiKey = process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
  if (!apiKey) return null;

  const baseParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawQuery)) {
    if (key.toLowerCase() === 'api_key') continue;
    if (Array.isArray(value)) {
      if (value[0] !== undefined) baseParams.set(key, String(value[0]));
    } else if (value !== undefined && value !== null && String(value) !== '') {
      baseParams.set(key, String(value));
    }
  }

  if (!baseParams.has('with_origin_country')) baseParams.set('with_origin_country', 'KR');
  if (!baseParams.has('with_genres')) baseParams.set('with_genres', '18');
  if (!baseParams.has('without_genres')) {
    baseParams.set('without_genres', '16,99,10763,10764,10767');
  }
  if (!baseParams.has('sort_by')) baseParams.set('sort_by', 'popularity.desc');

  const requestedPage = Math.max(1, Number(baseParams.get('page')) || 1);
  baseParams.set('page', String(requestedPage));

  const sortedEntries = [...baseParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const cacheKey = new URLSearchParams(sortedEntries).toString();

  const cached = curatedDoramasCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const inflight = inFlightCuratedDoramas.get(cacheKey);
  if (inflight) return inflight;

  const work = (async (): Promise<CuratedDoramasCacheEntry['payload'] | null> => {
    try {
      // Build parallel queries:
      // 1) BR Watch Region pool (surfaces famous localized K-Dramas / J-Dramas / C-Dramas)
      const brParams = new URLSearchParams(baseParams);
      brParams.set('watch_region', 'BR');
      brParams.set('with_watch_monetization_types', 'flatrate|free|ads');

      // 2) Global Page N and Page N+1 (captures brand-new 2025/2026 Doramas not yet tagged in BR)
      const globalPage1 = new URLSearchParams(baseParams);
      globalPage1.set('page', String((requestedPage - 1) * 2 + 1));

      const globalPage2 = new URLSearchParams(baseParams);
      globalPage2.set('page', String((requestedPage - 1) * 2 + 2));

      const [sfIndex, brData, global1Data, global2Data] = await Promise.all([
        getSuperFlixCatalogIndex(),
        fetchTmdbDiscoverTvPage(brParams, apiKey),
        fetchTmdbDiscoverTvPage(globalPage1, apiKey),
        fetchTmdbDiscoverTvPage(globalPage2, apiKey),
      ]);

      if (!brData && !global1Data && !global2Data) {
        return null;
      }

      const sortBy = baseParams.get('sort_by') || 'popularity.desc';
      const isDateDesc = sortBy === 'first_air_date.desc';

      // Merge pools: for newest releases keep chronological global order first; otherwise prioritize BR-localized + global
      const rawPools = isDateDesc
        ? [global1Data?.results || [], brData?.results || [], global2Data?.results || []]
        : [brData?.results || [], global1Data?.results || [], global2Data?.results || []];

      const candidates: Array<Record<string, unknown>> = [];
      const seenIds = new Set<number>();

      for (const pool of rawPools) {
        for (const item of pool) {
          const id = Number(item.id);
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);
          candidates.push({
            ...item,
            media_type: 'tv',
          });
        }
      }

      if (!sfIndex.loadedOk) {
        const fallbackPayload = {
          page: requestedPage,
          results: candidates.slice(0, 20),
          total_pages: Math.max(
            1,
            Math.min(20, global1Data?.total_pages || brData?.total_pages || 1)
          ),
          total_results: global1Data?.total_results || brData?.total_results || candidates.length,
        };
        return fallbackPayload;
      }

      // Partition into instant SuperFlix hits (100% playable) vs candidates needing StreamBetter check
      const verified: Array<Record<string, unknown>> = [];
      const needsSecondaryProbe: Array<{ idx: number; item: Record<string, unknown> }> = [];
      const acceptedByIndex = new Map<number, Record<string, unknown>>();

      candidates.forEach((item, idx) => {
        const idStr = String(item.id);
        if (sfIndex.tvTmdbIds.has(idStr)) {
          acceptedByIndex.set(idx, item);
        } else if (needsSecondaryProbe.length < 14) {
          needsSecondaryProbe.push({ idx, item });
        }
      });

      // Probe StreamBetter in parallel (capped at 2.6s) so Doramas available ONLY on Canal 3 are preserved!
      if (needsSecondaryProbe.length > 0 && acceptedByIndex.size < 22) {
        await Promise.race([
          Promise.allSettled(
            needsSecondaryProbe.map(async ({ idx, item }) => {
              const idStr = String(item.id);
              const sbUrl = `https://streambetter.lol/serie/${idStr}/1/1?key=${STREAMBETTER_PUBLIC_KEY}`;
              const ok = await probeStreamBetterAvailable(sbUrl);
              if (ok) {
                acceptedByIndex.set(idx, item);
              }
            })
          ),
          new Promise((resolve) => setTimeout(resolve, 2600)),
        ]);
      }

      const orderedIndices = [...acceptedByIndex.keys()].sort((a, b) => a - b);
      for (const idx of orderedIndices) {
        const item = acceptedByIndex.get(idx);
        if (item) verified.push(item);
        if (verified.length >= 20) break;
      }

      // Safety net: if fewer than 6 items matched (e.g. ultra-narrow filter combination), top up from BR/global candidates
      if (verified.length < 6) {
        const verifiedIds = new Set(verified.map((v) => Number(v.id)));
        for (const item of candidates) {
          const id = Number(item.id);
          if (!verifiedIds.has(id)) {
            verifiedIds.add(id);
            verified.push(item);
          }
          if (verified.length >= 12) break;
        }
      }

      const payload: CuratedDoramasCacheEntry['payload'] = {
        page: requestedPage,
        results: verified,
        total_pages: Math.max(
          1,
          Math.min(
            25,
            Math.ceil((global1Data?.total_pages || brData?.total_pages || 1) / 2)
          )
        ),
        total_results: Math.max(
          verified.length,
          brData?.total_results || global1Data?.total_results || verified.length
        ),
      };

      if (curatedDoramasCache.size > 120) {
        const oldest = curatedDoramasCache.keys().next().value;
        if (oldest) curatedDoramasCache.delete(oldest);
      }
      curatedDoramasCache.set(cacheKey, {
        payload,
        expiresAt: Date.now() + CURATED_DORAMAS_TTL_MS,
      });

      return payload;
    } finally {
      inFlightCuratedDoramas.delete(cacheKey);
    }
  })();

  inFlightCuratedDoramas.set(cacheKey, work);
  return work;
}
