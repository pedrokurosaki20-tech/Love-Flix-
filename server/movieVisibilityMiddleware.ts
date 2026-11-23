import type { NextFunction, Request, Response } from 'express';
import { isMovieExcludedFromPlatform } from './cinemaFilter.js';
import { checkTvSearchAvailability } from './supercdnResolver.js';

type TmdbListPayload = {
  results?: Array<Record<string, unknown> | null>;
  [key: string]: unknown;
};

function getTmdbPath(req: Request): string {
  const path = req.originalUrl.split('?')[0] || req.path;
  return path.replace(/^\/api\//, '').replace(/^\//, '');
}

function isMovieListEndpoint(path: string): boolean {
  return (
    path.startsWith('search/movie') ||
    path.startsWith('movie/') ||
    path.startsWith('discover/movie') ||
    path.startsWith('trending/movie/') ||
    path.startsWith('genre/movie/')
  );
}

function isTvSearchEndpoint(path: string): boolean {
  return path.startsWith('search/tv');
}

function isMixedSearchEndpoint(path: string): boolean {
  return path.startsWith('search/multi') || path.startsWith('trending/all/') || path.startsWith('trending/tv/');
}

/**
 * Final response-level guard for TMDB list responses. Excludes cinema-only movies
 * and hides search/trending titles absent from all three configured channels (Canal 1, 2 e 3).
 */
export function filterTmdbMovieLists(req: Request, res: Response, next: NextFunction): void {
  const path = getTmdbPath(req);
  if (!path.startsWith('tmdb/')) {
    next();
    return;
  }
  const endpoint = path.slice('tmdb/'.length);
  const movieOnly = isMovieListEndpoint(endpoint);
  const tvSearch = isTvSearchEndpoint(endpoint);
  const mixed = isMixedSearchEndpoint(endpoint);
  if (!movieOnly && !tvSearch && !mixed) {
    next();
    return;
  }

  const sendJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (!body || typeof body !== 'object' || !Array.isArray((body as TmdbListPayload).results)) {
      return sendJson(body);
    }

    const payload = body as TmdbListPayload;
    const items = payload.results || [];
    const today = new Date().toISOString().slice(0, 10);

    void Promise.all(
      items.map(async (item) => {
        if (!item || typeof item !== 'object') return false;
        const rawMediaType = typeof item.media_type === 'string' ? item.media_type : undefined;
        const resolvedType =
          rawMediaType || (movieOnly ? 'movie' : tvSearch ? 'tv' : undefined);

        if (resolvedType === 'person') return true;

        if (resolvedType === 'tv') {
          const firstAirDate =
            typeof item.first_air_date === 'string' ? item.first_air_date : '';
          if (firstAirDate && firstAirDate > today) return false;
          if (!item.id) return false;
          try {
            return await checkTvSearchAvailability(String(item.id));
          } catch {
            return false;
          }
        }

        if (resolvedType !== 'movie') return true;
        try {
          return !(await isMovieExcludedFromPlatform({
            id: item.id as number | string | undefined,
            release_date: typeof item.release_date === 'string' ? item.release_date : undefined,
            media_type: 'movie',
          }));
        } catch {
          return false;
        }
      })
    )
      .then((visible) => {
        payload.results = items.filter((_item, index) => visible[index]);
        sendJson(payload);
      })
      .catch(() => {
        payload.results = items.filter(
          (item) => item && typeof item === 'object' && item.media_type === 'person'
        );
        sendJson(payload);
      });
    return res;
  }) as Response['json'];
  next();
}
