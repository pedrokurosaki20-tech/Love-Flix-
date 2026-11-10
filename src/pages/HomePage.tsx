import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HeroBanner } from '../components/HeroBanner';
import { MediaCarousel } from '../components/MediaCarousel';
import { AsyncCarouselRow } from '../components/AsyncCarouselRow';
import { formatReleaseDate, getMediaTitle, tmdbService } from '../services/tmdb';
import { useUserData } from '../context/UserDataContext';
import type { TMDBMediaItem } from '../types/tmdb';

export const HomePage: React.FC = () => {
  const [heroItems, setHeroItems] = useState<TMDBMediaItem[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  const {
    profile,
    continueWatching,
    history,
    favorites,
    removeFromContinueWatching,
  } = useUserData();

  useEffect(() => {
    let cancelled = false;
    setHeroLoading(true);
    tmdbService
      .getTrending('all', 'day', 1)
      .then((res) => {
        if (!cancelled) setHeroItems(res.results || []);
      })
      .catch(() => {
        if (!cancelled) setHeroItems([]);
      })
      .finally(() => {
        if (!cancelled) setHeroLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const anchorSeedItem = useMemo(() => {
    if (history.length > 0) return history[0];
    if (favorites.length > 0) return favorites[0];
    return null;
  }, [history, favorites]);

  const preferredGenresParam = useMemo(() => {
    const movieGenreIds = profile.favoriteGenreIds.filter((id) => id < 10000);
    return movieGenreIds.length > 0 ? movieGenreIds.slice(0, 2).join('|') : '28|878';
  }, [profile.favoriteGenreIds]);

  const fetchBecauseYouWatched = useCallback(() => {
    if (!anchorSeedItem) {
      return tmdbService.getTrending('movie', 'week', 1);
    }
    return tmdbService.getRecommendations(anchorSeedItem.media_type, anchorSeedItem.id, 1);
  }, [anchorSeedItem]);

  const fetchRecommendedForYou = useCallback(
    () =>
      tmdbService.discoverMovies({
        genre: preferredGenresParam,
        minRating: '7',
        sortBy: 'popularity.desc',
      }),
    [preferredGenresParam]
  );

  const fetchTrendingDay = useCallback(() => tmdbService.getTrending('all', 'day', 1), []);
  const fetchPopularWeek = useCallback(() => tmdbService.getTrending('all', 'week', 1), []);
  const fetchTrendingMovies = useCallback(() => tmdbService.getTrending('movie', 'week', 1), []);
  const fetchPopularSeries = useCallback(() => tmdbService.getTVList('popular', 1), []);
  const fetchPopularAnimes = useCallback(
    () => tmdbService.discoverAnimes('tv', { sortBy: 'popularity.desc' }),
    []
  );
  const fetchRecentReleases = useCallback(() => tmdbService.getRecentDigitalReleases(1), []);
  const fetchTopRated = useCallback(() => tmdbService.getMoviesList('top_rated', 1), []);
  const fetchMostPopularTMDB = useCallback(() => tmdbService.getMoviesList('popular', 1), []);
  const fetchActionMovies = useCallback(
    () => tmdbService.discoverMovies({ genre: '28', sortBy: 'popularity.desc' }),
    []
  );
  const fetchRomanceMovies = useCallback(
    () => tmdbService.discoverMovies({ genre: '10749', sortBy: 'popularity.desc' }),
    []
  );
  const fetchHorrorThriller = useCallback(
    () => tmdbService.discoverMovies({ genre: '27|53', sortBy: 'popularity.desc' }),
    []
  );
  const fetchSciFi = useCallback(
    () => tmdbService.discoverMovies({ genre: '878', sortBy: 'popularity.desc' }),
    []
  );
  const fetchComedies = useCallback(
    () => tmdbService.discoverMovies({ genre: '35', sortBy: 'popularity.desc' }),
    []
  );
  const fetchHiddenGems = useCallback(
    () =>
      tmdbService.discoverMovies(
        {
          minRating: '7.6',
          sortBy: 'vote_average.desc',
        },
        {
          'vote_count.gte': 280,
          'vote_count.lte': 2200,
        }
      ),
    []
  );
  const fetchCinemaClassics = useCallback(
    () =>
      tmdbService.discoverMovies(
        {
          minRating: '7.8',
          sortBy: 'vote_average.desc',
        },
        {
          'primary_release_date.lte': '1999-12-31',
          'vote_count.gte': 1500,
        }
      ),
    []
  );

  return (
    <div className="pb-6">
      <HeroBanner
        items={heroItems}
        loading={heroLoading}
        sectionKicker="Destaques em Alta"
      />

      <div className="mt-4 space-y-1">
        {continueWatching.length > 0 && (
          <MediaCarousel
            title="Continue assistindo"
            items={continueWatching}
            getItemSubtitle={(item) => {
              const found = continueWatching.find(
                (c) => c.id === item.id && c.media_type === item.media_type
              );
              if (!found) return undefined;
              if (found.trackedSeason && found.trackedEpisode) {
                return `T${found.trackedSeason} · Ep. ${found.trackedEpisode}`;
              }
              return `Acessado em ${formatReleaseDate(found.visitedAt.slice(0, 10))}`;
            }}
            onRemoveItem={(item) =>
              removeFromContinueWatching(
                item.id,
                item.media_type === 'tv' ? 'tv' : 'movie'
              )
            }
          />
        )}

        <AsyncCarouselRow
          title="Tendências do momento"
          fetcher={fetchTrendingDay}
          eager
          maxItems={10}
          showRankNumbers
        />

        {anchorSeedItem && (
          <AsyncCarouselRow
            title={`Porque você assistiu ${getMediaTitle(anchorSeedItem)}`}
            fetcher={fetchBecauseYouWatched}
            eager
            depsKey={`${anchorSeedItem.media_type}-${anchorSeedItem.id}`}
          />
        )}

        <AsyncCarouselRow
          title="Recomendados para você"
          fetcher={fetchRecommendedForYou}
          eager
          depsKey={preferredGenresParam}
        />

        <AsyncCarouselRow title="Filmes em alta" fetcher={fetchTrendingMovies} eager />
        <AsyncCarouselRow title="Séries populares" fetcher={fetchPopularSeries} />
        <AsyncCarouselRow title="Animes populares" fetcher={fetchPopularAnimes} />
        <AsyncCarouselRow title="Lançamentos recentes" fetcher={fetchRecentReleases} />
        <AsyncCarouselRow title="Produções populares da semana" fetcher={fetchPopularWeek} />
        <AsyncCarouselRow title="Mais bem avaliados" fetcher={fetchTopRated} />
        <AsyncCarouselRow title="Os mais populares da TMDB" fetcher={fetchMostPopularTMDB} />
        <AsyncCarouselRow title="Filmes de ação" fetcher={fetchActionMovies} />
        <AsyncCarouselRow title="Ficção científica" fetcher={fetchSciFi} />
        <AsyncCarouselRow title="Filmes de romance" fetcher={fetchRomanceMovies} />
        <AsyncCarouselRow title="Terror e suspense" fetcher={fetchHorrorThriller} />
        <AsyncCarouselRow title="Comédias" fetcher={fetchComedies} />
        <AsyncCarouselRow title="Joias escondidas" fetcher={fetchHiddenGems} />
        <AsyncCarouselRow title="Clássicos do cinema" fetcher={fetchCinemaClassics} />
      </div>
    </div>
  );
};
