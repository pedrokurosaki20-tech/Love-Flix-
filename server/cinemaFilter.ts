import { BROWSER_USER_AGENT, FALLBACK_SERVER_KEY } from './hlsEngine.js';
import { getSuperFlixCatalogIndex } from './catalogAvailability.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const CACHE_TTL_MS = 15 * 60 * 1000;
const DIGITAL_RELEASE_TYPES = new Set([4]); // TMDb: digital release (not physical media or TV)
const CLASSIC_MOVIE_AGE_MS = 540 * 24 * 60 * 60 * 1000;

interface CinemaFilterState {
  cinemaOnlyIds: Set<string>;
  theatricalCandidates: Map<string, { title: string; releaseDate: string }>;
  lastUpdated: number;
}

interface MovieEvaluationCacheEntry {
  isCinemaOnly: boolean;
  isExcluded: boolean;
  expiresAt: number;
}

let cachedCinemaState: CinemaFilterState | null = null;
let inFlightCinemaCheck: Promise<CinemaFilterState> | null = null;
const movieEvaluationCache = new Map<string, MovieEvaluationCacheEntry>();
const inFlightEvaluations = new Map<string, Promise<MovieEvaluationCacheEntry>>();
const channelProbeCache = new Map<string, { available: boolean; expiresAt: number }>();
const CHANNEL_PROBE_TTL_MS = 5 * 60 * 1000;

async function fetchTmdbList(endpoint: string, params: Record<string, string> = {}): Promise<any[]> {
  const apiKey = process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
  if (!apiKey) return [];
  const url = new URL(`${TMDB_BASE_URL}/${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'pt-BR');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: any[] };
    return Array.isArray(json.results) ? json.results : [];
  } catch {
    return [];
  }
}

/** A digital release is recognized only from a past TMDb type-4 release date. */
async function evaluateTmdbMovieDigitalRelease(
  tmdbId: string
): Promise<{ isCinemaOnly: boolean; releaseDate: string }> {
  const apiKey = process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
  if (!apiKey) throw new Error('TMDB API key is unavailable');

  const url = new URL(`${TMDB_BASE_URL}/movie/${encodeURIComponent(tmdbId)}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('append_to_response', 'release_dates');
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`TMDB movie lookup failed: ${res.status}`);

  const movie = (await res.json()) as {
    status?: string;
    release_date?: string;
    release_dates?: { results?: Array<{ release_dates?: Array<{ type?: number; release_date?: string }> }> };
  };
  const releaseDate = movie.release_date || '';
  const today = new Date().toISOString().slice(0, 10);
  const status = (movie.status || '').toLowerCase();
  if (['in production', 'post production', 'planned'].includes(status)) {
    return { isCinemaOnly: true, releaseDate };
  }
  if (releaseDate && releaseDate > today) return { isCinemaOnly: true, releaseDate };

  const hasReleasedDigitalDate = (movie.release_dates?.results || []).some((country) =>
    (country.release_dates || []).some((entry) => {
      const date = String(entry.release_date || '').slice(0, 10);
      return DIGITAL_RELEASE_TYPES.has(Number(entry.type)) && Boolean(date) && date <= today;
    })
  );
  if (hasReleasedDigitalDate) return { isCinemaOnly: false, releaseDate };

  // TMDb often omits old digital-release records. Only treat old titles as past their
  // theatrical window; they still must pass an actual channel availability check below.
  const isClassic = Boolean(
    releaseDate && Date.now() - new Date(`${releaseDate}T00:00:00Z`).getTime() > CLASSIC_MOVIE_AGE_MS
  );
  return { isCinemaOnly: !isClassic, releaseDate };
}

async function probeChannelOne(tmdbId: string): Promise<boolean> {
  const url = `https://vaiquecol.com/embed2/${encodeURIComponent(tmdbId)}`;
  const cached = channelProbeCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.available;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(3500),
    });
    const body = res.ok ? await res.text() : '';
    const unavailable = /conte[uú]do\s+indispon[ií]vel|n[aã]o\s+encontrado|404\s+not\s+found/i.test(body);
    const available = res.ok && !unavailable;
    channelProbeCache.set(url, { available, expiresAt: Date.now() + CHANNEL_PROBE_TTL_MS });
    return available;
  } catch {
    return false;
  }
}

async function hasAnyWorkingChannel(tmdbId: string): Promise<boolean> {
  const [catalog, channel1, channel3] = await Promise.all([
    getSuperFlixCatalogIndex(),
    probeChannelOne(tmdbId),
    probeStreamBetter(tmdbId),
  ]);
  return (catalog.loadedOk && catalog.movieTmdbIds.has(tmdbId)) || channel1 || channel3;
}

async function probeStreamBetter(tmdbId: string): Promise<boolean> {
  const url = `https://streambetter.lol/filme/${encodeURIComponent(tmdbId)}`;
  const cached = channelProbeCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.available;
  try {
    const res = await fetch(`${url}?key=${encodeURIComponent('sb_pk_49d645d49ff1a48b6bba90db256a9ea5c308fd26acabb415')}`, {
      headers: { 'User-Agent': BROWSER_USER_AGENT, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(3500),
    });
    const body = res.ok ? await res.text() : '';
    const unavailable = /content-unavailable-page|conte[uú]do\s+indispon[ií]vel|n[aã]o\s+encontrado/i.test(body);
    const available = res.ok && !unavailable;
    channelProbeCache.set(url, { available, expiresAt: Date.now() + CHANNEL_PROBE_TTL_MS });
    return available;
  } catch {
    return false;
  }
}

export async function getCinemaFilterState(): Promise<CinemaFilterState> {
  if (cachedCinemaState && Date.now() - cachedCinemaState.lastUpdated < CACHE_TTL_MS) {
    return cachedCinemaState;
  }
  if (inFlightCinemaCheck) return inFlightCinemaCheck;

  inFlightCinemaCheck = (async () => {
    try {
      const pages = ['1', '2', '3', '4'];
      const fetchJobs: Promise<any[]>[] = [];
      for (const page of pages) {
        fetchJobs.push(
          fetchTmdbList('movie/now_playing', { region: 'BR', page }),
          fetchTmdbList('movie/now_playing', { page }),
          fetchTmdbList('movie/upcoming', { region: 'BR', page }),
          fetchTmdbList('movie/upcoming', { page }),
          fetchTmdbList('trending/movie/week', { page })
        );
      }
      const lists = await Promise.all(fetchJobs);
      const theatricalCandidates = new Map<string, { title: string; releaseDate: string }>();
      for (const list of lists) {
        for (const movie of list) {
          if (!movie?.id) continue;
          const id = String(movie.id);
          if (!theatricalCandidates.has(id)) {
            theatricalCandidates.set(id, {
              title: movie.title || movie.original_title || '',
              releaseDate: movie.release_date || '',
            });
          }
        }
      }

      const cinemaOnlyIds = new Set<string>();
      await Promise.all(Array.from(theatricalCandidates.keys()).map(async (id) => {
        try {
          if ((await evaluateTmdbMovieDigitalRelease(id)).isCinemaOnly) cinemaOnlyIds.add(id);
        } catch {
          // Unknown status is not added to the bulk cinema list; per-item exclusion fails closed.
        }
      }));
      const state = { cinemaOnlyIds, theatricalCandidates, lastUpdated: Date.now() };
      cachedCinemaState = state;
      return state;
    } catch {
      if (cachedCinemaState) return cachedCinemaState;
      return { cinemaOnlyIds: new Set<string>(), theatricalCandidates: new Map(), lastUpdated: Date.now() };
    } finally {
      inFlightCinemaCheck = null;
    }
  })();
  return inFlightCinemaCheck;
}

export async function isMovieCinemaOnly(tmdbId: string | number): Promise<boolean> {
  const id = String(tmdbId).trim();
  if (!/^\d+$/.test(id)) return false;
  const cached = movieEvaluationCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.isCinemaOnly;
  const state = await getCinemaFilterState();
  if (state.cinemaOnlyIds.has(id)) return true;
  try {
    const result = await evaluateTmdbMovieDigitalRelease(id);
    if (result.isCinemaOnly) state.cinemaOnlyIds.add(id);
    return result.isCinemaOnly;
  } catch {
    // Do not claim a title is cinema-only solely because TMDb is temporarily unreachable.
    return false;
  }
}

/**
 * Excludes movies unless they have left the theatrical-only window and are verifiably
 * present on at least one of the three configured channels. TV/person results pass through.
 */
export async function isMovieExcludedFromPlatform(item: {
  id?: number | string;
  release_date?: string;
  media_type?: string;
}): Promise<boolean> {
  if (!item || !item.id || item.media_type === 'tv' || item.media_type === 'person') return false;
  const id = String(item.id).trim();
  if (!/^\d+$/.test(id)) return true;
  const today = new Date().toISOString().slice(0, 10);
  if (item.release_date && item.release_date > today) return true;

  const cached = movieEvaluationCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.isExcluded;
  const inflight = inFlightEvaluations.get(id);
  if (inflight) return (await inflight).isExcluded;

  const task = (async (): Promise<MovieEvaluationCacheEntry> => {
    try {
      const cinemaState = await getCinemaFilterState();
      if (cinemaState.cinemaOnlyIds.has(id)) {
        return { isCinemaOnly: true, isExcluded: true, expiresAt: Date.now() + 10 * 60 * 1000 };
      }
      const digital = await evaluateTmdbMovieDigitalRelease(id);
      if (digital.isCinemaOnly) {
        cinemaState.cinemaOnlyIds.add(id);
        return { isCinemaOnly: true, isExcluded: true, expiresAt: Date.now() + 10 * 60 * 1000 };
      }
      const available = await hasAnyWorkingChannel(id);
      return {
        isCinemaOnly: false,
        isExcluded: !available,
        expiresAt: Date.now() + (available ? 60 * 60 * 1000 : 10 * 60 * 1000),
      };
    } catch {
      // Fail closed: if digital-release or channel status cannot be verified, do not list it.
      return { isCinemaOnly: false, isExcluded: true, expiresAt: Date.now() + 60 * 1000 };
    }
  })();
  inFlightEvaluations.set(id, task);
  try {
    const result = await task;
    movieEvaluationCache.set(id, result);
    return result.isExcluded;
  } finally {
    inFlightEvaluations.delete(id);
  }
}
