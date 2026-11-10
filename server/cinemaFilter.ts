import { BROWSER_USER_AGENT, FALLBACK_SERVER_KEY } from './hlsEngine.js';
import { getSuperFlixCatalogIndex } from './catalogAvailability.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes cache

interface CinemaFilterState {
  cinemaOnlyIds: Set<string>;
  theatricalCandidates: Map<string, { title: string; releaseDate: string }>;
  lastUpdated: number;
}

let cachedCinemaState: CinemaFilterState | null = null;
let inFlightCinemaCheck: Promise<CinemaFilterState> | null = null;

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
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: any[] };
    return json.results || [];
  } catch {
    return [];
  }
}

/**
 * Stage 1: Build the real-time Set of Movie IDs that are EXCLUSIVELY in Theaters
 * (Cinema-only, not yet released on Digital / Streaming platforms).
 * 
 * A movie is considered cinema-only if:
 * 1. It is currently in TMDb's "now_playing" or "upcoming" theatrical window, or has a release date within the current theatrical window (or future date).
 * 2. AND it is NOT yet indexed in our streaming catalog (e.g. SuperFlix 24,000+ catalog).
 * 
 * As soon as digital distribution happens and the movie enters the streaming index,
 * it is automatically removed from this set and immediately appears in Love Flix.
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
      // 1. Load active streaming catalog index (24,000+ titles)
      const catalogIndex = await getSuperFlixCatalogIndex();
      const streamingMovieIds = catalogIndex.movieTmdbIds;

      // 2. Fetch movies currently in theaters (now_playing) and upcoming theatrical releases
      const [nowPlayingBR, nowPlayingGlobal, upcomingBR] = await Promise.all([
        fetchTmdbList('movie/now_playing', { region: 'BR', page: '1' }),
        fetchTmdbList('movie/now_playing', { page: '1' }),
        fetchTmdbList('movie/upcoming', { region: 'BR', page: '1' }),
      ]);

      const theatricalCandidates = new Map<string, { title: string; releaseDate: string }>();
      const cinemaOnlyIds = new Set<string>();

      const allTheatrical = [...nowPlayingBR, ...nowPlayingGlobal, ...upcomingBR];
      for (const mov of allTheatrical) {
        if (!mov?.id) continue;
        const idStr = String(mov.id);
        if (!theatricalCandidates.has(idStr)) {
          theatricalCandidates.set(idStr, {
            title: mov.title || mov.original_title || '',
            releaseDate: mov.release_date || '',
          });
        }
      }

      const todayStr = new Date().toISOString().slice(0, 10);

      for (const [idStr, info] of theatricalCandidates.entries()) {
        const isAlreadyInStreaming = streamingMovieIds.has(idStr);

        // If the movie is already available on digital streaming servers in high quality,
        // it is NOT cinema-only! It can be shown and enjoyed.
        if (isAlreadyInStreaming) {
          continue;
        }

        // If it is NOT in streaming, check release date:
        // Future release or within current theatrical exclusive window -> CINEMA ONLY
        cinemaOnlyIds.add(idStr);
      }

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

  const state = await getCinemaFilterState();
  return state.cinemaOnlyIds.has(idStr);
}
