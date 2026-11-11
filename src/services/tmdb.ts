import {
  ALL_GENRES_MAP,
  DECADES_LIST,
  type DiscoverFilterParams,
  type MediaType,
  type TMDBCollectionDetail,
  type TMDBMediaDetail,
  type TMDBMediaItem,
  type TMDBPaginatedResponse,
  type TMDBPersonDetail,
  type TMDBSeasonDetail,
  type TMDBVideo,
} from '../types/tmdb';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

interface ClientCacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
}

const clientCache = new Map<string, ClientCacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();
const CLIENT_CACHE_TTL = 10 * 60 * 1000;

export function getPosterUrl(
  path: string | null | undefined,
  size: 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function getBackdropUrl(
  path: string | null | undefined,
  size: 'w780' | 'w1280' | 'original' = 'w1280'
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function getProfileUrl(
  path: string | null | undefined,
  size: 'w185' | 'h632' | 'original' = 'w185'
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function getStillUrl(
  path: string | null | undefined,
  size: 'w300' | 'w500' | 'original' = 'w500'
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function getMediaTitle(item: Partial<TMDBMediaItem>): string {
  return item.title || item.name || item.original_title || item.original_name || 'Sem título';
}

export function getOriginalMediaTitle(item: Partial<TMDBMediaItem>): string {
  return item.original_title || item.original_name || getMediaTitle(item);
}

export function getMediaYear(item: Partial<TMDBMediaItem>): string {
  const raw = item.release_date || item.first_air_date || '';
  return raw ? raw.slice(0, 4) : '';
}

export function formatReleaseDate(dateStr?: string | null): string {
  if (!dateStr) return 'Data não informada';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatRuntime(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return '';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins} min`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export function resolveMediaType(item: Partial<TMDBMediaItem>, fallback: MediaType = 'movie'): MediaType {
  if (item.media_type === 'movie' || item.media_type === 'tv' || item.media_type === 'person') {
    return item.media_type;
  }
  if (item.first_air_date !== undefined || (item.name && !item.title)) {
    return 'tv';
  }
  return fallback;
}

export function isAnimeItem(item: Partial<TMDBMediaItem>): boolean {
  const genreIds = item.genre_ids || item.genres?.map((g) => g.id) || [];
  const hasAnimation = genreIds.includes(16);
  const isJapanese =
    item.original_language === 'ja' || Boolean(item.origin_country?.includes('JP'));
  return hasAnimation && isJapanese;
}

export function isDoramaItem(item: Partial<TMDBMediaItem>): boolean {
  const genreIds = item.genre_ids || item.genres?.map((g) => g.id) || [];
  if (genreIds.includes(16) || genreIds.includes(99)) return false;
  const doramaLangs = ['ko', 'zh', 'th'];
  const doramaCountries = ['KR', 'TW', 'CN', 'TH'];
  if (item.original_language && doramaLangs.includes(item.original_language)) return true;
  if (item.origin_country?.some((c) => doramaCountries.includes(c))) return true;
  if (item.original_language === 'ja' && genreIds.includes(18)) return true;
  return false;
}

export function getMediaTypeBadgeText(item: Partial<TMDBMediaItem>, fallback: MediaType = 'movie'): string {
  const resolved = resolveMediaType(item, fallback);
  if (resolved === 'person') return 'Artista';
  const genreIds = item.genre_ids || item.genres?.map((g) => g.id) || [];
  if (genreIds.includes(99)) return 'Documentário';
  if (isAnimeItem(item)) return 'Anime';
  if (isDoramaItem(item) && resolved === 'tv') return 'Dorama';
  return resolved === 'tv' ? 'Série' : 'Filme';
}

export function getGenreNames(item: Partial<TMDBMediaItem>, limit = 3): string[] {
  if (item.genres && item.genres.length > 0) {
    return item.genres.slice(0, limit).map((g) => g.name);
  }
  if (item.genre_ids && item.genre_ids.length > 0) {
    return item.genre_ids
      .map((id) => ALL_GENRES_MAP[id])
      .filter(Boolean)
      .slice(0, limit);
  }
  return [];
}

export function extractCertification(detail: Partial<TMDBMediaDetail> | null): string | null {
  if (!detail) return null;
  // Check Movie release_dates
  if (detail.release_dates?.results) {
    const br = detail.release_dates.results.find((r) => r.iso_3166_1 === 'BR');
    const us = detail.release_dates.results.find((r) => r.iso_3166_1 === 'US');
    const brCert = br?.release_dates.find((d) => d.certification)?.certification;
    if (brCert) return brCert === 'L' ? 'Livre' : `${brCert} anos`;
    const usCert = us?.release_dates.find((d) => d.certification)?.certification;
    if (usCert) return usCert;
  }
  // Check TV content_ratings
  if (detail.content_ratings?.results) {
    const br = detail.content_ratings.results.find((r) => r.iso_3166_1 === 'BR');
    const us = detail.content_ratings.results.find((r) => r.iso_3166_1 === 'US');
    if (br?.rating) return br.rating === 'L' ? 'Livre' : `${br.rating} anos`;
    if (us?.rating) return us.rating;
  }
  return null;
}

export function pickBestTrailer(videos?: TMDBVideo[]): TMDBVideo | null {
  if (!videos || videos.length === 0) return null;
  const ytVideos = videos.filter((v) => v.site === 'YouTube' && v.key);
  if (ytVideos.length === 0) return null;

  const ptOfficialTrailer = ytVideos.find(
    (v) => v.iso_639_1 === 'pt' && v.type === 'Trailer' && v.official
  );
  if (ptOfficialTrailer) return ptOfficialTrailer;

  const ptTrailer = ytVideos.find((v) => v.iso_639_1 === 'pt' && v.type === 'Trailer');
  if (ptTrailer) return ptTrailer;

  const officialTrailer = ytVideos.find((v) => v.type === 'Trailer' && v.official);
  if (officialTrailer) return officialTrailer;

  const anyTrailer = ytVideos.find((v) => v.type === 'Trailer');
  if (anyTrailer) return anyTrailer;

  const anyTeaser = ytVideos.find((v) => v.type === 'Teaser');
  if (anyTeaser) return anyTeaser;

  return ytVideos[0];
}

async function fetchTMDB<T>(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  const searchParams = new URLSearchParams();

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v) !== '') {
      searchParams.set(k, String(v));
    }
  }

  const queryString = searchParams.toString();
  const url = `/api/tmdb/${cleanEndpoint}${queryString ? `?${queryString}` : ''}`;

  const isSearchEndpoint = cleanEndpoint.startsWith('search/');
  const cached = clientCache.get(url);
  if (!isSearchEndpoint && cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  const existingPromise = inFlightRequests.get(url);
  if (existingPromise) {
    return existingPromise as Promise<T>;
  }

  const requestPromise = (async () => {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        let errorMessage = `Erro ${response.status} ao consultar catálogo.`;
        try {
          const errJson = await response.json();
          if (errJson?.status_message) errorMessage = errJson.status_message;
          else if (errJson?.error) errorMessage = errJson.error;
        } catch {
          // ignore parse error
        }
        throw new Error(errorMessage);
      }

      const data = (await response.json()) as T;
      clientCache.set(url, {
        data,
        expiresAt: Date.now() + (isSearchEndpoint ? 5 * 1000 : CLIENT_CACHE_TTL),
      });
      return data;
    } finally {
      inFlightRequests.delete(url);
    }
  })();

  inFlightRequests.set(url, requestPromise);
  return requestPromise;
}

function tagMediaType(
  response: TMDBPaginatedResponse<TMDBMediaItem>,
  defaultType: MediaType
): TMDBPaginatedResponse<TMDBMediaItem> {
  return {
    ...response,
    results: (response.results || []).map((item) => ({
      ...item,
      media_type: item.media_type || defaultType,
    })),
  };
}

let cachedCinemaOnlyIds: Set<string> | null = null;
let cinemaOnlyExpiresAt = 0;
let inFlightCinemaFilter: Promise<Set<string>> | null = null;

export async function getCinemaOnlyIds(): Promise<Set<string>> {
  if (cachedCinemaOnlyIds && cinemaOnlyExpiresAt > Date.now()) {
    return cachedCinemaOnlyIds;
  }
  if (inFlightCinemaFilter) {
    return inFlightCinemaFilter;
  }
  inFlightCinemaFilter = (async () => {
    try {
      const res = await fetch('/api/supercdn/cinema-filter');
      if (res.ok) {
        const json = (await res.json()) as { ok: boolean; cinemaOnlyIds?: (string | number)[] };
        const set = new Set<string>((json.cinemaOnlyIds || []).map(String));
        cachedCinemaOnlyIds = set;
        cinemaOnlyExpiresAt = Date.now() + 10 * 60 * 1000;
        return set;
      }
    } catch {
      // ignore
    }
    return cachedCinemaOnlyIds || new Set<string>();
  })();

  try {
    return await inFlightCinemaFilter;
  } finally {
    inFlightCinemaFilter = null;
  }
}

export async function isCinemaOnlyMovie(tmdbId: string | number): Promise<boolean> {
  const idStr = String(tmdbId).trim();
  if (!idStr || !/^\d+$/.test(idStr)) return false;

  const ids = await getCinemaOnlyIds();
  if (ids.has(idStr)) return true;

  // Verify single movie in real-time with backend
  try {
    const res = await fetch(`/api/supercdn/cinema-status?tmdbId=${idStr}`);
    if (res.ok) {
      const data = (await res.json()) as { ok?: boolean; isCinemaOnly?: boolean };
      if (data.isCinemaOnly) {
        ids.add(idStr);
        return true;
      }
    }
  } catch {
    // ignore
  }

  return false;
}

async function sanitizeMediaList(
  response: TMDBPaginatedResponse<TMDBMediaItem>,
  defaultType?: MediaType
): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
  const tagged = defaultType ? tagMediaType(response, defaultType) : response;
  const cinemaIds = await getCinemaOnlyIds();
  const today = new Date().toISOString().slice(0, 10);

  const cleanResults = (tagged.results || []).filter((item) => {
    if (!item || !item.id) return false;
    const resolvedType = resolveMediaType(item, defaultType);
    if (resolvedType === 'tv' || resolvedType === 'person') {
      return true;
    }
    // Filter out movies strictly in theaters without digital stream
    if (cinemaIds.has(String(item.id))) {
      return false;
    }
    // Filter out unreleased future movies
    if (item.release_date && item.release_date > today) {
      return false;
    }
    return true;
  });

  return {
    ...tagged,
    results: cleanResults,
  };
}

export const tmdbService = {
  // Check if a specific movie is currently exclusive to movie theaters
  async isCinemaOnly(tmdbId: string | number): Promise<boolean> {
    return isCinemaOnlyMovie(tmdbId);
  },

  async getCinemaOnlyIds(): Promise<Set<string>> {
    return getCinemaOnlyIds();
  },

  // Recent Digital / Streaming Releases (movies with confirmed digital releases in HD)
  async getRecentDigitalReleases(page = 1): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const today = new Date();
    const windowStart = new Date(today.getTime() - 120 * 24 * 60 * 60 * 1000);
    const todayStr = today.toISOString().slice(0, 10);
    const pastStr = windowStart.toISOString().slice(0, 10);

    return this.discoverMovies(
      {
        sortBy: 'popularity.desc',
        page,
      },
      {
        'primary_release_date.gte': pastStr,
        'primary_release_date.lte': todayStr,
        with_release_type: '4|5',
      }
    );
  },

  // Trending (sanitized: cinema-only movies filtered out)
  async getTrending(
    mediaType: 'all' | 'movie' | 'tv' = 'all',
    timeWindow: 'day' | 'week' = 'week',
    page = 1
  ): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const res = await fetchTMDB<TMDBPaginatedResponse<TMDBMediaItem>>(
      `trending/${mediaType}/${timeWindow}`,
      { page }
    );
    if (mediaType === 'movie' || mediaType === 'tv') {
      return sanitizeMediaList(res, mediaType);
    }
    const nonPerson = {
      ...res,
      results: (res.results || []).filter((item) => item.media_type !== 'person'),
    };
    return sanitizeMediaList(nonPerson);
  },

  // Standard Movie Lists (sanitized: cinema-only movies filtered out)
  async getMoviesList(
    category: 'popular' | 'now_playing' | 'upcoming' | 'top_rated',
    page = 1,
    region = 'BR'
  ): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const res = await fetchTMDB<TMDBPaginatedResponse<TMDBMediaItem>>(`movie/${category}`, {
      page,
      region,
    });
    return sanitizeMediaList(res, 'movie');
  },

  // Standard TV Lists
  async getTVList(
    category: 'popular' | 'top_rated' | 'on_the_air' | 'airing_today',
    page = 1
  ): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const res = await fetchTMDB<TMDBPaginatedResponse<TMDBMediaItem>>(`tv/${category}`, {
      page,
    });
    return tagMediaType(res, 'tv');
  },

  // Advanced Movie Discovery (sanitized: cinema-only movies filtered out)
  async discoverMovies(
    filters: DiscoverFilterParams = {},
    extraParams: Record<string, string | number | undefined> = {}
  ): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const params: Record<string, string | number | undefined> = {
      sort_by: filters.sortBy || 'popularity.desc',
      page: filters.page || 1,
      ...extraParams,
    };

    if (filters.genre) params.with_genres = filters.genre;
    if (filters.withoutGenres) params.without_genres = filters.withoutGenres;
    if (filters.year) params.primary_release_year = filters.year;
    if (filters.decade) {
      const dec = DECADES_LIST.find((d) => d.value === filters.decade);
      if (dec) {
        params['primary_release_date.gte'] = dec.start;
        params['primary_release_date.lte'] = dec.end;
      }
    }
    if (filters.minRating) {
      params['vote_average.gte'] = filters.minRating;
      if (!filters.minVotes && !params['vote_count.gte']) {
        params['vote_count.gte'] = 120;
      }
    }
    if (filters.minVotes) params['vote_count.gte'] = filters.minVotes;
    if (filters.language) params.with_original_language = filters.language;
    if (filters.country) params.with_origin_country = filters.country;

    // Ensure top rated sorting always has enough votes to be meaningful
    if (params.sort_by === 'vote_average.desc' && !params['vote_count.gte']) {
      params['vote_count.gte'] = 300;
    }

    const res = await fetchTMDB<TMDBPaginatedResponse<TMDBMediaItem>>('discover/movie', params);
    return sanitizeMediaList(res, 'movie');
  },

  // Advanced TV Discovery
  async discoverTV(
    filters: DiscoverFilterParams = {},
    extraParams: Record<string, string | number | undefined> = {}
  ): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const params: Record<string, string | number | undefined> = {
      sort_by: filters.sortBy || 'popularity.desc',
      page: filters.page || 1,
      ...extraParams,
    };

    if (filters.genre) params.with_genres = filters.genre;
    if (filters.withoutGenres) params.without_genres = filters.withoutGenres;
    if (filters.year) params.first_air_date_year = filters.year;
    if (filters.decade) {
      const dec = DECADES_LIST.find((d) => d.value === filters.decade);
      if (dec) {
        params['first_air_date.gte'] = dec.start;
        params['first_air_date.lte'] = dec.end;
      }
    }
    if (filters.minRating) {
      params['vote_average.gte'] = filters.minRating;
      if (!filters.minVotes && !params['vote_count.gte']) {
        params['vote_count.gte'] = 80;
      }
    }
    if (filters.minVotes) params['vote_count.gte'] = filters.minVotes;
    if (filters.language) params.with_original_language = filters.language;
    if (filters.country) params.with_origin_country = filters.country;
    if (filters.status) params.with_status = filters.status;

    if (params.sort_by === 'vote_average.desc' && !params['vote_count.gte']) {
      params['vote_count.gte'] = 200;
    }

    const res = await fetchTMDB<TMDBPaginatedResponse<TMDBMediaItem>>('discover/tv', params);
    return tagMediaType(res, 'tv');
  },

  // Dedicated Japanese Anime fetcher (never mixes Western animation)
  async discoverAnimes(
    mediaType: 'tv' | 'movie' = 'tv',
    filters: DiscoverFilterParams = {},
    extraParams: Record<string, string | number | undefined> = {}
  ): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const combinedGenres = filters.genre ? `16,${filters.genre}` : '16';
    const baseFilters: DiscoverFilterParams = {
      ...filters,
      genre: combinedGenres,
      country: 'JP',
      language: 'ja',
    };
    if (mediaType === 'movie') {
      return this.discoverMovies(baseFilters, extraParams);
    }
    return this.discoverTV(baseFilters, extraParams);
  },

  // Dedicated Dorama fetcher (curated against real multi-channel streaming availability)
  async discoverDoramas(
    filters: DiscoverFilterParams = {},
    extraParams: Record<string, string | number | undefined> = {}
  ): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const baseFilters: DiscoverFilterParams = {
      ...filters,
      country: filters.country || 'KR',
      withoutGenres: '16,99,10763,10764,10767',
      genre: filters.genre || '18',
    };

    const queryParams = new URLSearchParams();
    queryParams.set('sort_by', baseFilters.sortBy || 'popularity.desc');
    queryParams.set('page', String(baseFilters.page || 1));
    if (baseFilters.genre) queryParams.set('with_genres', baseFilters.genre);
    if (baseFilters.withoutGenres) queryParams.set('without_genres', baseFilters.withoutGenres);
    if (baseFilters.year) queryParams.set('first_air_date_year', baseFilters.year);
    if (baseFilters.decade) {
      const dec = DECADES_LIST.find((d) => d.value === baseFilters.decade);
      if (dec) {
        queryParams.set('first_air_date.gte', dec.start);
        queryParams.set('first_air_date.lte', dec.end);
      }
    }
    if (baseFilters.minRating) {
      queryParams.set('vote_average.gte', baseFilters.minRating);
      if (!baseFilters.minVotes && !extraParams['vote_count.gte']) {
        queryParams.set('vote_count.gte', '80');
      }
    }
    if (baseFilters.minVotes) queryParams.set('vote_count.gte', baseFilters.minVotes);
    if (baseFilters.language) queryParams.set('with_original_language', baseFilters.language);
    if (baseFilters.country) queryParams.set('with_origin_country', baseFilters.country);
    if (baseFilters.status) queryParams.set('with_status', baseFilters.status);

    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== null && String(v) !== '') {
        queryParams.set(k, String(v));
      }
    }

    if (queryParams.get('sort_by') === 'vote_average.desc' && !queryParams.has('vote_count.gte')) {
      queryParams.set('vote_count.gte', '200');
    }

    const url = `/api/supercdn/doramas?${queryParams.toString()}`;
    const cached = clientCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as TMDBPaginatedResponse<TMDBMediaItem>;
    }

    const existing = inFlightRequests.get(url);
    if (existing) {
      return existing as Promise<TMDBPaginatedResponse<TMDBMediaItem>>;
    }

    const reqPromise = (async (): Promise<TMDBPaginatedResponse<TMDBMediaItem>> => {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('Curated doramas unavailable');
        const json = (await res.json()) as TMDBPaginatedResponse<TMDBMediaItem>;
        const tagged = tagMediaType(json, 'tv');
        clientCache.set(url, { data: tagged, expiresAt: Date.now() + CLIENT_CACHE_TTL });
        return tagged;
      } catch {
        return this.discoverTV(baseFilters, extraParams);
      } finally {
        inFlightRequests.delete(url);
      }
    })();

    inFlightRequests.set(url, reqPromise);
    return reqPromise;
  },

  // Real-time 3-channel availability check + Canal 1 pre-warm
  async getChannelAvailability(params: {
    mediaType: 'movie' | 'tv';
    id: number;
    imdbId?: string | null;
    season?: number;
    episode?: number;
  }): Promise<{
    availableChannels: Array<1 | 2 | 3>;
    recommendedChannel: 1 | 2 | 3 | null;
  }> {
    const search = new URLSearchParams({
      type: params.mediaType === 'tv' ? 'tvshow' : 'movie',
      tmdbId: String(params.id),
    });
    if (params.imdbId && /^tt\d+/i.test(params.imdbId)) {
      search.set('imdb', params.imdbId);
    }
    if (params.mediaType === 'tv') {
      search.set('season', String(params.season || 1));
      search.set('episode', String(params.episode || 1));
    }

    const url = `/api/supercdn/availability?${search.toString()}`;
    const cached = clientCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as {
        availableChannels: Array<1 | 2 | 3>;
        recommendedChannel: 1 | 2 | 3 | null;
      };
    }

    const existing = inFlightRequests.get(url);
    if (existing) {
      return existing as Promise<{
        availableChannels: Array<1 | 2 | 3>;
        recommendedChannel: 1 | 2 | 3 | null;
      }>;
    }

    const reqPromise = (async () => {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('Availability check failed');
        const data = (await res.json()) as {
          availableChannels?: Array<1 | 2 | 3>;
          recommendedChannel?: 1 | 2 | 3 | null;
        };
        const result = {
          availableChannels: Array.isArray(data.availableChannels)
            ? data.availableChannels
            : ([1, 2, 3] as Array<1 | 2 | 3>),
          recommendedChannel:
            data.recommendedChannel !== undefined ? data.recommendedChannel : 1,
        };
        clientCache.set(url, {
          data: result,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
        return result;
      } catch {
        return {
          availableChannels: [1, 2, 3] as Array<1 | 2 | 3>,
          recommendedChannel: 1 as const,
        };
      } finally {
        inFlightRequests.delete(url);
      }
    })();

    inFlightRequests.set(url, reqPromise);
    return reqPromise;
  },

  // Full Movie Details (including credits, videos, recommendations, similar, release_dates, external_ids)
  async getMovieDetails(movieId: number): Promise<TMDBMediaDetail> {
    const detail = await fetchTMDB<TMDBMediaDetail>(`movie/${movieId}`, {
      append_to_response: 'credits,videos,recommendations,similar,release_dates,external_ids',
    });

    // If no Portuguese videos were returned, also check English/original videos so trailers are always available
    if (!detail.videos?.results?.length) {
      try {
        const fallbackVideos = await fetchTMDB<{ results: TMDBVideo[] }>(`movie/${movieId}/videos`, {
          language: 'en-US',
        });
        detail.videos = fallbackVideos;
      } catch {
        // ignore fallback failure
      }
    }

    return {
      ...detail,
      imdb_id: detail.imdb_id || detail.external_ids?.imdb_id || null,
      media_type: 'movie',
      recommendations: detail.recommendations
        ? tagMediaType(detail.recommendations, 'movie')
        : undefined,
      similar: detail.similar ? tagMediaType(detail.similar, 'movie') : undefined,
    };
  },

  // Full TV Details (including credits, videos, recommendations, similar, content_ratings, external_ids)
  async getTVDetails(seriesId: number): Promise<TMDBMediaDetail> {
    const detail = await fetchTMDB<TMDBMediaDetail>(`tv/${seriesId}`, {
      append_to_response: 'credits,videos,recommendations,similar,content_ratings,external_ids',
    });

    if (!detail.videos?.results?.length) {
      try {
        const fallbackVideos = await fetchTMDB<{ results: TMDBVideo[] }>(`tv/${seriesId}/videos`, {
          language: 'en-US',
        });
        detail.videos = fallbackVideos;
      } catch {
        // ignore fallback failure
      }
    }

    return {
      ...detail,
      imdb_id: detail.external_ids?.imdb_id || detail.imdb_id || null,
      media_type: 'tv',
      recommendations: detail.recommendations
        ? tagMediaType(detail.recommendations, 'tv')
        : undefined,
      similar: detail.similar ? tagMediaType(detail.similar, 'tv') : undefined,
    };
  },

  // Resolve IMDb ID (tt...) for SuperCDN streaming player
  async getImdbId(mediaType: 'movie' | 'tv', id: number): Promise<string | null> {
    try {
      const ext = await fetchTMDB<{ imdb_id?: string | null }>(`${mediaType}/${id}/external_ids`);
      if (ext?.imdb_id && /^tt\d+/i.test(ext.imdb_id)) {
        return ext.imdb_id;
      }
      if (mediaType === 'movie') {
        const movie = await fetchTMDB<{ imdb_id?: string | null }>(`movie/${id}`);
        if (movie?.imdb_id && /^tt\d+/i.test(movie.imdb_id)) {
          return movie.imdb_id;
        }
      }
      return null;
    } catch {
      return null;
    }
  },

  // Fetch Videos Only
  async getMediaVideos(mediaType: 'movie' | 'tv', id: number): Promise<TMDBVideo[]> {
    const pt = await fetchTMDB<{ results: TMDBVideo[] }>(`${mediaType}/${id}/videos`, {
      language: 'pt-BR',
    });
    if (pt.results && pt.results.length > 0) return pt.results;

    const en = await fetchTMDB<{ results: TMDBVideo[] }>(`${mediaType}/${id}/videos`, {
      language: 'en-US',
    });
    return en.results || [];
  },

  // Fetch TV Season Episodes
  async getTVSeasonDetails(seriesId: number, seasonNumber: number): Promise<TMDBSeasonDetail> {
    return fetchTMDB<TMDBSeasonDetail>(`tv/${seriesId}/season/${seasonNumber}`);
  },

  // Fetch Recommendations for "Porque você assistiu..."
  async getRecommendations(
    mediaType: 'movie' | 'tv',
    id: number,
    page = 1
  ): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const res = await fetchTMDB<TMDBPaginatedResponse<TMDBMediaItem>>(
      `${mediaType}/${id}/recommendations`,
      { page }
    );
    return sanitizeMediaList(res, mediaType);
  },

  // Fetch Collection / Franchise
  async getCollectionDetails(collectionId: number): Promise<TMDBCollectionDetail> {
    const col = await fetchTMDB<TMDBCollectionDetail>(`collection/${collectionId}`);
    return {
      ...col,
      parts: (col.parts || [])
        .map((p) => ({ ...p, media_type: 'movie' as MediaType }))
        .sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999')),
    };
  },

  // Fetch Artist / Person Details
  async getPersonDetails(personId: number): Promise<TMDBPersonDetail> {
    const person = await fetchTMDB<TMDBPersonDetail>(`person/${personId}`, {
      append_to_response: 'combined_credits',
    });
    if (!person.biography) {
      try {
        const enPerson = await fetchTMDB<TMDBPersonDetail>(`person/${personId}`, {
          language: 'en-US',
        });
        if (enPerson.biography) {
          person.biography = enPerson.biography;
        }
      } catch {
        // ignore fallback
      }
    }
    return person;
  },

  // Global & Scoped Search
  async searchMulti(query: string, page = 1): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const res = await fetchTMDB<TMDBPaginatedResponse<TMDBMediaItem>>('search/multi', {
      query,
      page,
    });
    return sanitizeMediaList(res);
  },

  async searchMovies(query: string, page = 1): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const res = await fetchTMDB<TMDBPaginatedResponse<TMDBMediaItem>>('search/movie', {
      query,
      page,
    });
    return sanitizeMediaList(res, 'movie');
  },

  async searchTV(query: string, page = 1): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const res = await fetchTMDB<TMDBPaginatedResponse<TMDBMediaItem>>('search/tv', {
      query,
      page,
    });
    return tagMediaType(res, 'tv');
  },

  async searchPerson(query: string, page = 1): Promise<TMDBPaginatedResponse<TMDBMediaItem>> {
    const res = await fetchTMDB<TMDBPaginatedResponse<TMDBMediaItem>>('search/person', {
      query,
      page,
    });
    return tagMediaType(res, 'person');
  },
};
