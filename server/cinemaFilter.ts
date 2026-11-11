import { BROWSER_USER_AGENT, FALLBACK_SERVER_KEY } from './hlsEngine.js';
import {
  getSuperFlixCatalogIndex,
  probeStreamBetterAvailable,
  STREAMBETTER_PUBLIC_KEY,
} from './catalogAvailability.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes bulk cache

interface CinemaFilterState {
  cinemaOnlyIds: Set<string>;
  theatricalCandidates: Map<string, { title: string; releaseDate: string }>;
  lastUpdated: number;
}

let cachedCinemaState: CinemaFilterState | null = null;
let inFlightCinemaCheck: Promise<CinemaFilterState> | null = null;

// Individual movie cache: stores whether a movie is cinema-only and whether it is excluded from the platform
interface MovieEvaluationCacheEntry {
  isCinemaOnly: boolean;
  isExcluded: boolean;
  expiresAt: number;
}

const movieEvaluationCache = new Map<string, MovieEvaluationCacheEntry>();
const inFlightEvaluations = new Map<string, Promise<MovieEvaluationCacheEntry>>();

async function fetchTmdbList(endpoint: string, params: Record<string, string> = {}): Promise<any[]> {
  const apiKey = process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
  if (!apiKey) return [];

  const url = new URL(`${TMDB_BASE_URL}/${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'pt-BR');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: any[] };
    return json.results || [];
  } catch {
    return [];
  }
}

/**
 * Evaluates whether a TMDb movie ID is exclusively in cinemas or has an active digital release.
 * Checks TMDb release_dates (Types 4/5/6: Digital/Physical/TV vs Types 1/2/3: Premiere/Theatrical).
 */
async function evaluateTmdbMovieDigitalRelease(
  tmdbId: string
): Promise<{ isCinemaOnly: boolean; releaseDate: string }> {
  const apiKey = process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
  const todayStr = new Date().toISOString().slice(0, 10);

  if (!apiKey) {
    return { isCinemaOnly: false, releaseDate: '' };
  }

  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${apiKey}&language=pt-BR&append_to_response=release_dates`,
      {
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) {
      return { isCinemaOnly: false, releaseDate: '' };
    }

    const movie = await res.json();
    const relDate: string = movie.release_date || '';

    // Unreleased status or future release date -> Strictly cinema-only / unreleased
    if (movie.status && ['In Production', 'Post Production', 'Planned'].includes(movie.status)) {
      return { isCinemaOnly: true, releaseDate: relDate };
    }
    if (relDate && relDate > todayStr) {
      return { isCinemaOnly: true, releaseDate: relDate };
    }

    let hasDigitalOrPhysical = false;
    let earliestDigital = '';
    let hasTheatrical = false;

    if (movie.release_dates?.results && Array.isArray(movie.release_dates.results)) {
      for (const country of movie.release_dates.results) {
        for (const rd of country.release_dates || []) {
          if (rd.type === 2 || rd.type === 3) {
            hasTheatrical = true;
          }
          if (rd.type === 4 || rd.type === 5 || rd.type === 6) {
            const d = rd.release_date ? String(rd.release_date).slice(0, 10) : '';
            if (d) {
              if (!earliestDigital || d < earliestDigital) {
                earliestDigital = d;
              }
              if (d <= todayStr) {
                hasDigitalOrPhysical = true;
              }
            }
          }
        }
      }
    }

    // Classic library title (older than 18 months): already long completed theatrical cycle
    const isPast18Months =
      relDate &&
      relDate <
        new Date(Date.now() - 540 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // If it only had theatrical distribution and no digital date, or earliest digital is in the future
    const isCinemaOnly =
      (!hasDigitalOrPhysical && !isPast18Months) ||
      Boolean(earliestDigital && earliestDigital > todayStr);

    return { isCinemaOnly, releaseDate: relDate };
  } catch {
    return { isCinemaOnly: false, releaseDate: '' };
  }
}

/**
 * Intelligent Cinema-Only Verification & Auto-Exclusion Filter:
 * Gathers current theatrical & upcoming releases across multiple pages and regions,
 * and cross-references them against Love Flix's active streaming catalog index.
 * 
 * - If a movie is currently in theaters and NOT in streaming index -> CINEMA ONLY (excluded from catalog).
 * - As soon as a movie is released to digital streaming platforms and indexed in our channels,
 *   it is AUTOMATICALLY recognized and released into the Love Flix catalog without any manual step.
 */
export async function getCinemaFilterState(): Promise<CinemaFilterState> {
  const now = Date.now();
  if (cachedCinemaState && now - cachedCinemaState.lastUpdated < CACHE_TTL_MS) {
    return cachedCinemaState;
  }

  if (inFlightCinemaCheck) {
    return inFlightCinemaCheck;
  }

  inFlightCinemaCheck = (async (): Promise<CinemaFilterState> => {
    try {
      // 1. Load active streaming catalog index (24,000+ titles from SuperFlix / StreamBetter)
      const catalogIndex = await getSuperFlixCatalogIndex();
      const streamingMovieIds = catalogIndex.movieTmdbIds;

      // 2. Fetch movies currently in theaters (now_playing) and upcoming theatrical releases (pages 1 to 4)
      const pages = ['1', '2', '3', '4'];
      const fetchJobs: Array<Promise<any[]>> = [];

      for (const p of pages) {
        fetchJobs.push(
          fetchTmdbList('movie/now_playing', { region: 'BR', page: p }),
          fetchTmdbList('movie/now_playing', { page: p }),
          fetchTmdbList('movie/upcoming', { region: 'BR', page: p }),
          fetchTmdbList('movie/upcoming', { page: p }),
          fetchTmdbList('trending/movie/week', { page: p })
        );
      }

      const results = await Promise.all(fetchJobs);
      const theatricalCandidates = new Map<string, { title: string; releaseDate: string }>();
      const cinemaOnlyIds = new Set<string>();

      for (const list of results) {
        if (!Array.isArray(list)) continue;
        for (const mov of list) {
          if (!mov?.id) continue;
          const idStr = String(mov.id);
          if (!theatricalCandidates.has(idStr)) {
            theatricalCandidates.set(idStr, {
              title: mov.title || mov.original_title || '',
              releaseDate: mov.release_date || '',
            });
          }
        }
      }

      const todayStr = new Date().toISOString().slice(0, 10);

      // Evaluate candidates in parallel
      const candidateEntries = Array.from(theatricalCandidates.entries());
      const evalTasks = candidateEntries.map(async ([idStr, info]) => {
        // If release_date is in the future -> Cinema Only
        if (info.releaseDate && info.releaseDate > todayStr) {
          cinemaOnlyIds.add(idStr);
          return;
        }

        const digitalEval = await evaluateTmdbMovieDigitalRelease(idStr);
        if (digitalEval.isCinemaOnly) {
          cinemaOnlyIds.add(idStr);
        }
      });

      await Promise.all(evalTasks);

      const state: CinemaFilterState = {
        cinemaOnlyIds,
        theatricalCandidates,
        lastUpdated: Date.now(),
      };

      cachedCinemaState = state;
      return state;
    } catch {
      if (cachedCinemaState) return cachedCinemaState;
      return {
        cinemaOnlyIds: new Set<string>(),
        theatricalCandidates: new Map(),
        lastUpdated: Date.now(),
      };
    } finally {
      inFlightCinemaCheck = null;
    }
  })();

  return inFlightCinemaCheck;
}

/**
 * Checks if a specific TMDb movie ID is currently exclusive to movie theaters.
 */
export async function isMovieCinemaOnly(tmdbId: string | number): Promise<boolean> {
  const idStr = String(tmdbId).trim();
  if (!idStr || !/^\d+$/.test(idStr)) return false;

  const cached = movieEvaluationCache.get(idStr);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isCinemaOnly;
  }

  // Check known bulk cinema set
  const state = await getCinemaFilterState();
  if (state.cinemaOnlyIds.has(idStr)) {
    return true;
  }

  // Deep evaluation via TMDb release_dates
  const { isCinemaOnly } = await evaluateTmdbMovieDigitalRelease(idStr);
  if (isCinemaOnly) {
    state.cinemaOnlyIds.add(idStr);
    movieEvaluationCache.set(idStr, {
      isCinemaOnly: true,
      isExcluded: true,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return true;
  }

  return false;
}

/**
 * Core Exclusion Filter:
 * Evaluates whether a movie item should be completely hidden from Love Flix.
 * 
 * Rules:
 * 1. If TV show or person -> NEVER excluded (visible).
 * 2. If movie release date is in the future -> ALWAYS excluded (cinema only / unreleased).
 * 3. If movie is currently in theaters without a released digital edition -> ALWAYS excluded.
 * 4. If movie has 0 available channels on Love Flix (neither SuperFlix nor StreamBetter) -> ALWAYS excluded.
 * 5. As soon as a movie is released to digital platforms AND enters at least 1 of our 3 channels,
 *    it is AUTOMATICALLY allowed and displayed across the entire platform.
 */
export async function isMovieExcludedFromPlatform(item: {
  id?: number | string;
  release_date?: string;
  media_type?: string;
}): Promise<boolean> {
  if (!item || !item.id) return false;
  if (item.media_type === 'tv' || item.media_type === 'person') return false;

  const idStr = String(item.id).trim();
  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. Future release -> 100% cinema-only / unreleased
  if (item.release_date && item.release_date > todayStr) {
    return true;
  }

  // 2. Check in-memory evaluation cache
  const cached = movieEvaluationCache.get(idStr);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isExcluded;
  }

  // 3. Check in-flight promise to avoid duplicate parallel lookups for the same movie
  const inflight = inFlightEvaluations.get(idStr);
  if (inflight) {
    const res = await inflight;
    return res.isExcluded;
  }

  const evaluationTask = (async (): Promise<MovieEvaluationCacheEntry> => {
    try {
      // Check bulk theatrical set first
      const cinemaState = await getCinemaFilterState();
      if (cinemaState.cinemaOnlyIds.has(idStr)) {
        return {
          isCinemaOnly: true,
          isExcluded: true,
          expiresAt: Date.now() + 10 * 60 * 1000,
        };
      }

      // Deep TMDb digital release evaluation
      const digitalEval = await evaluateTmdbMovieDigitalRelease(idStr);
      if (digitalEval.isCinemaOnly) {
        cinemaState.cinemaOnlyIds.add(idStr);
        return {
          isCinemaOnly: true,
          isExcluded: true,
          expiresAt: Date.now() + 10 * 60 * 1000,
        };
      }

      // Check channel availability: Must be available in at least 1 of the 3 channels
      const catalog = await getSuperFlixCatalogIndex();
      const inSuperFlix = catalog.loadedOk && catalog.movieTmdbIds.has(idStr);
      let inStreamBetter = false;

      if (!inSuperFlix) {
        inStreamBetter = await probeStreamBetterAvailable(
          `https://streambetter.lol/filme/${idStr}?key=${STREAMBETTER_PUBLIC_KEY}`
        );
      }

      const hasWorkingChannel = inSuperFlix || inStreamBetter;
      if (!hasWorkingChannel) {
        return {
          isCinemaOnly: false,
          isExcluded: true,
          expiresAt: Date.now() + 10 * 60 * 1000,
        };
      }

      // Valid digital release AND available in at least one channel -> ALLOW
      return {
        isCinemaOnly: false,
        isExcluded: false,
        expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour for verified titles
      };
    } catch {
      return {
        isCinemaOnly: false,
        isExcluded: false,
        expiresAt: Date.now() + 60 * 1000,
      };
    }
  })();

  inFlightEvaluations.set(idStr, evaluationTask);
  try {
    const result = await evaluationTask;
    movieEvaluationCache.set(idStr, result);
    return result.isExcluded;
  } finally {
    inFlightEvaluations.delete(idStr);
  }
}
