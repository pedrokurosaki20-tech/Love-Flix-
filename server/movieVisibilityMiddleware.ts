import type { NextFunction, Request, Response } from 'express';
import { isMovieExcludedFromPlatform } from './cinemaFilter.js';

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

function isMixedSearchEndpoint(path: string): boolean {
  return path.startsWith('search/multi') || path.startsWith('trending/all/');
}

/**
 * Final response-level guard for every TMDB list response. It complements the client
 * sanitation and route-specific filtering, so new list pages cannot accidentally expose
 * cinema-only movies or titles absent from all three configured channels.
 */
export function filterTmdbMovieLists(req: Request, res: Response, next: NextFunction): void {
  const path = getTmdbPath(req);
  if (!path.startsWith('tmdb/')) {
    next();
    return;
  }
  const endpoint = path.slice('tmdb/'.length);
  const movieOnly = isMovieListEndpoint(endpoint);
  const mixed = isMixedSearchEndpoint(endpoint);
  if (!movieOnly && !mixed) {
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
    void Promise.all(items.map(async (item) => {
      if (!item || typeof item !== 'object') return false;
      const mediaType = item.media_type;
      if (mediaType === 'tv' || mediaType === 'person') return true;
      if (mixed && mediaType !== 'movie') return true;
      if (!movieOnly && mediaType !== 'movie') return true;
      try {
        return !(await isMovieExcludedFromPlatform({
          id: item.id as number | string | undefined,
          release_date: typeof item.release_date === 'string' ? item.release_date : undefined,
          media_type: typeof mediaType === 'string' ? mediaType : (movieOnly ? 'movie' : undefined),
        }));
      } catch {
        // If verification fails, do not expose a movie whose digital/channel status is unknown.
        return false;
      }
    })).then((visible) => {
      payload.results = items.filter((_item, index) => visible[index]);
      sendJson(payload);
    }).catch(() => {
      // Fail closed on unexpected processing errors while preserving non-movie mixed results.
      payload.results = items.filter((item) =>
        item && typeof item === 'object' && (item.media_type === 'tv' || item.media_type === 'person')
      );
      sendJson(payload);
    });
    return res;
  }) as Response['json'];
  next();
}
