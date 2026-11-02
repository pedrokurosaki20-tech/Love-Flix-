import { tmdbService } from '../services/tmdb';
import type { TMDBMediaItem } from '../types/tmdb';

const KEYWORD_TO_MOVIE_GENRES: Array<{ keywords: string[]; genreIds: number[] }> = [
  { keywords: ['acao', 'action', 'luta', 'combate', 'adrenalina'], genreIds: [28] },
  { keywords: ['aventura', 'adventure', 'exploracao'], genreIds: [12] },
  {
    keywords: ['terror', 'horror', 'assustador', 'sobrenatural', 'medo', 'slasher', 'zumbi'],
    genreIds: [27],
  },
  {
    keywords: ['ficcao', 'cientifica', 'scifi', 'sci-fi', 'espaco', 'futuro', 'cyberpunk', 'alien'],
    genreIds: [878],
  },
  { keywords: ['romance', 'romantico', 'amor', 'casal', 'paixao'], genreIds: [10749] },
  { keywords: ['comedia', 'comedy', 'engracado', 'humor'], genreIds: [35] },
  { keywords: ['suspense', 'thriller', 'tensao', 'psicologico'], genreIds: [53] },
  { keywords: ['misterio', 'investigacao', 'detetive', 'enigma'], genreIds: [9648] },
  { keywords: ['fantasia', 'fantasy', 'magia', 'medieval', 'dragao'], genreIds: [14] },
  { keywords: ['animacao', 'anime', 'desenho', 'ghibli'], genreIds: [16] },
  { keywords: ['drama', 'dramatico', 'emocionante'], genreIds: [18] },
  { keywords: ['crime', 'policial', 'mafia', 'assalto'], genreIds: [80] },
  { keywords: ['documentario', 'documentarios', 'biografia'], genreIds: [99] },
  { keywords: ['guerra', 'militar', 'batalha'], genreIds: [10752] },
  { keywords: ['historia', 'historico', 'epoca'], genreIds: [36] },
  { keywords: ['familia', 'infantil'], genreIds: [10751] },
  { keywords: ['faroeste', 'western'], genreIds: [37] },
];

const TV_TO_MOVIE_GENRE_BRIDGE: Record<number, number[]> = {
  10759: [28, 12],
  10765: [878, 14],
  10768: [10752, 18],
  10762: [10751, 16],
  16: [16],
  18: [18],
  35: [35],
  37: [37],
  80: [80],
  99: [99],
  9648: [9648],
  10751: [10751],
};

function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function toValidMovieItem(item: TMDBMediaItem): TMDBMediaItem | null {
  if (!item || !item.id || !item.poster_path) return null;
  if (item.media_type === 'person' || item.media_type === 'tv') return null;
  return {
    ...item,
    media_type: 'movie',
  };
}

export async function fetchFallbackMovieRecommendations(limit = 10): Promise<TMDBMediaItem[]> {
  const [trendingRes, popularRes, topRatedRes] = await Promise.allSettled([
    tmdbService.getTrending('movie', 'day', 1),
    tmdbService.getMoviesList('popular', 1),
    tmdbService.getMoviesList('top_rated', 1),
  ]);

  const pools: TMDBMediaItem[][] = [
    trendingRes.status === 'fulfilled' ? trendingRes.value.results || [] : [],
    popularRes.status === 'fulfilled' ? popularRes.value.results || [] : [],
    topRatedRes.status === 'fulfilled' ? topRatedRes.value.results || [] : [],
  ];

  const picked: TMDBMediaItem[] = [];
  const seenIds = new Set<number>();
  const maxLen = Math.max(...pools.map((p) => p.length), 0);

  for (let i = 0; i < maxLen && picked.length < limit; i++) {
    for (const pool of pools) {
      if (picked.length >= limit) break;
      const candidate = pool[i] ? toValidMovieItem(pool[i]) : null;
      if (candidate && !seenIds.has(candidate.id)) {
        seenIds.add(candidate.id);
        picked.push(candidate);
      }
    }
  }

  return picked;
}

export async function getRecommendedMoviesForSearchHistory(
  recentSearches: string[],
  limit = 10
): Promise<TMDBMediaItem[]> {
  const cleanTerms = recentSearches
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 6);

  if (cleanTerms.length === 0) {
    return fetchFallbackMovieRecommendations(limit);
  }

  const genreWeights = new Map<number, number>();
  const seedMovieIds: number[] = [];
  const exactMatchedMovieIds = new Set<number>();

  const addGenreWeight = (genreId: number, weight: number) => {
    genreWeights.set(genreId, (genreWeights.get(genreId) || 0) + weight);
  };

  // 1. Direct thematic/genre keyword extraction from search queries
  cleanTerms.forEach((term, index) => {
    const normalized = normalizeSearchText(term);
    const recencyFactor = Math.max(1, 2.2 - index * 0.22);

    for (const entry of KEYWORD_TO_MOVIE_GENRES) {
      if (entry.keywords.some((kw) => normalized.includes(kw))) {
        for (const gId of entry.genreIds) {
          addGenreWeight(gId, 2.6 * recencyFactor);
        }
      }
    }
  });

  // 2. Analyze top TMDB matches for the user's most recent searches
  const termsToInspect = cleanTerms.slice(0, 5);
  const searchInspections = await Promise.allSettled(
    termsToInspect.map((term) => tmdbService.searchMulti(term, 1))
  );

  searchInspections.forEach((outcome, termIdx) => {
    if (outcome.status !== 'fulfilled') return;
    const recencyFactor = Math.max(1, 2.0 - termIdx * 0.2);
    const normalizedTerm = normalizeSearchText(termsToInspect[termIdx]);
    const topMatches = (outcome.value.results || []).slice(0, 3);

    topMatches.forEach((match, rank) => {
      const rankWeight = rank === 0 ? 1.6 : rank === 1 ? 0.9 : 0.5;
      const mType =
        match.media_type ||
        (match.first_air_date && !match.release_date ? 'tv' : 'movie');

      if (mType === 'movie') {
        const matchTitle = normalizeSearchText(
          match.title || match.original_title || ''
        );
        if (rank === 0 && matchTitle === normalizedTerm) {
          exactMatchedMovieIds.add(match.id);
        }
        if (rank === 0 && seedMovieIds.length < 3 && !seedMovieIds.includes(match.id)) {
          seedMovieIds.push(match.id);
        }
        for (const gId of match.genre_ids || []) {
          addGenreWeight(gId, recencyFactor * rankWeight);
        }
      } else if (mType === 'tv') {
        for (const tvGenreId of match.genre_ids || []) {
          const mappedMovieGenres = TV_TO_MOVIE_GENRE_BRIDGE[tvGenreId] || [];
          for (const gId of mappedMovieGenres) {
            addGenreWeight(gId, recencyFactor * rankWeight * 0.85);
          }
        }
      } else if (mType === 'person' && Array.isArray(match.known_for)) {
        for (const work of match.known_for.slice(0, 3)) {
          if (work.media_type === 'movie' || work.release_date) {
            if (seedMovieIds.length < 3 && !seedMovieIds.includes(work.id)) {
              seedMovieIds.push(work.id);
            }
            for (const gId of work.genre_ids || []) {
              addGenreWeight(gId, recencyFactor * 0.9);
            }
          }
        }
      }
    });
  });

  const rankedGenres = Array.from(genreWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // If no genres or seed movies could be inferred from unusual queries, fallback gracefully
  if (rankedGenres.length === 0 && seedMovieIds.length === 0) {
    return fetchFallbackMovieRecommendations(limit);
  }

  // 3. Fetch related seed recommendations & top-interest genre discoveries in parallel
  const totalTopWeight = rankedGenres.reduce((acc, [, w]) => acc + w, 0);
  const dominantGenreId =
    rankedGenres.length > 0 && totalTopWeight > 0 && rankedGenres[0][1] / totalTopWeight >= 0.58
      ? rankedGenres[0][0]
      : null;

  const poolPromises: Array<Promise<{ poolId: string; boost: number; items: TMDBMediaItem[] }>> = [];

  for (const seedId of seedMovieIds.slice(0, 2)) {
    poolPromises.push(
      tmdbService
        .getRecommendations('movie', seedId, 1)
        .then((res) => ({
          poolId: `seed-${seedId}`,
          boost: 2,
          items: res.results || [],
        }))
        .catch(() => ({ poolId: `seed-${seedId}`, boost: 1, items: [] }))
    );
  }

  for (const [genreId, weight] of rankedGenres) {
    const isDominant = dominantGenreId === genreId;
    const relativeBoost = isDominant ? 3 : weight >= (rankedGenres[0]?.[1] || 1) * 0.65 ? 2 : 1;

    poolPromises.push(
      tmdbService
        .discoverMovies({
          genre: String(genreId),
          sortBy: 'popularity.desc',
          minVotes: '180',
        })
        .then((res) => ({
          poolId: `genre-${genreId}`,
          boost: relativeBoost,
          items: res.results || [],
        }))
        .catch(() => ({ poolId: `genre-${genreId}`, boost: 1, items: [] }))
    );
  }

  const settledPools = await Promise.all(poolPromises);
  const cursors = new Map<string, number>();
  settledPools.forEach((p) => cursors.set(p.poolId, 0));

  const recommended: TMDBMediaItem[] = [];
  const seenIds = new Set<number>(exactMatchedMovieIds);

  // Weighted round-robin selection across user's interest pools
  let addedInPass = true;
  while (recommended.length < limit && addedInPass) {
    addedInPass = false;

    for (const pool of settledPools) {
      if (recommended.length >= limit) break;

      let picksForThisPool = 0;
      let cursor = cursors.get(pool.poolId) || 0;

      while (
        picksForThisPool < pool.boost &&
        cursor < pool.items.length &&
        recommended.length < limit
      ) {
        const candidate = toValidMovieItem(pool.items[cursor]);
        cursor += 1;
        if (candidate && !seenIds.has(candidate.id)) {
          seenIds.add(candidate.id);
          recommended.push(candidate);
          picksForThisPool += 1;
          addedInPass = true;
        }
      }

      cursors.set(pool.poolId, cursor);
    }
  }

  // Top up to `limit` (~10 movies) if needed so the carousel is always complete
  if (recommended.length < limit) {
    const fallbackItems = await fetchFallbackMovieRecommendations(limit * 2);
    for (const item of fallbackItems) {
      if (recommended.length >= limit) break;
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        recommended.push(item);
      }
    }
  }

  return recommended.slice(0, limit);
}
