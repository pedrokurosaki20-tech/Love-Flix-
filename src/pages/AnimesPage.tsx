import React, { useCallback, useEffect, useState } from 'react';
import { HeroBanner } from '../components/HeroBanner';
import { AsyncCarouselRow } from '../components/AsyncCarouselRow';
import { type TMDBMediaItem } from '../types/tmdb';
import { tmdbService } from '../services/tmdb';

export const AnimesPage: React.FC = () => {
  const [formatTab, setFormatTab] = useState<'tv' | 'movie'>('tv');
  const [heroAnimes, setHeroAnimes] = useState<TMDBMediaItem[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setHeroLoading(true);
    tmdbService
      .discoverAnimes(formatTab, { sortBy: 'popularity.desc' })
      .then((res) => {
        if (!cancelled) setHeroAnimes(res.results || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHeroLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formatTab]);

  const fetchPopular = useCallback(
    () => tmdbService.discoverAnimes(formatTab, { sortBy: 'popularity.desc' }),
    [formatTab]
  );

  const fetchTrendingAnimes = useCallback(
    () =>
      tmdbService.discoverAnimes(
        formatTab,
        { sortBy: 'popularity.desc', minVotes: '40' },
        formatTab === 'tv'
          ? { 'first_air_date.gte': '2023-01-01' }
          : { 'primary_release_date.gte': '2022-01-01' }
      ),
    [formatTab]
  );

  const fetchTopRated = useCallback(
    () =>
      tmdbService.discoverAnimes(formatTab, {
        sortBy: 'vote_average.desc',
        minVotes: '250',
      }),
    [formatTab]
  );

  const fetchAction = useCallback(
    () =>
      tmdbService.discoverAnimes(formatTab, {
        genre: formatTab === 'tv' ? '10759' : '28',
        sortBy: 'popularity.desc',
      }),
    [formatTab]
  );

  const fetchAdventure = useCallback(
    () =>
      tmdbService.discoverAnimes(
        formatTab,
        {
          genre: formatTab === 'tv' ? '10759' : '12',
          sortBy: 'vote_count.desc',
        }
      ),
    [formatTab]
  );

  const fetchRomance = useCallback(
    () =>
      tmdbService.discoverAnimes(
        formatTab,
        {
          genre: formatTab === 'tv' ? '18' : '10749',
          sortBy: 'popularity.desc',
        },
        formatTab === 'tv' ? { with_keywords: '9840|210024' } : {}
      ),
    [formatTab]
  );

  const fetchFantasy = useCallback(
    () =>
      tmdbService.discoverAnimes(formatTab, {
        genre: formatTab === 'tv' ? '10765' : '14',
        sortBy: 'popularity.desc',
      }),
    [formatTab]
  );

  const fetchComedy = useCallback(
    () =>
      tmdbService.discoverAnimes(formatTab, {
        genre: '35',
        sortBy: 'popularity.desc',
      }),
    [formatTab]
  );

  const fetchSuspense = useCallback(
    () =>
      tmdbService.discoverAnimes(formatTab, {
        genre: formatTab === 'tv' ? '9648' : '53',
        sortBy: 'popularity.desc',
      }),
    [formatTab]
  );

  const fetchClassics = useCallback(
    () =>
      tmdbService.discoverAnimes(
        formatTab,
        {
          sortBy: 'vote_average.desc',
          minVotes: '180',
        },
        formatTab === 'tv'
          ? { 'first_air_date.lte': '2008-12-31' }
          : { 'primary_release_date.lte': '2008-12-31' }
      ),
    [formatTab]
  );

  const fetchRecent = useCallback(
    () =>
      tmdbService.discoverAnimes(
        formatTab,
        {
          sortBy: formatTab === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc',
          minVotes: '15',
        },
        formatTab === 'tv'
          ? { 'first_air_date.lte': '2026-12-31', 'first_air_date.gte': '2024-01-01' }
          : { 'primary_release_date.lte': '2026-12-31', 'primary_release_date.gte': '2023-01-01' }
      ),
    [formatTab]
  );

  return (
    <div className="pb-10">
      <HeroBanner
        items={heroAnimes}
        loading={heroLoading}
        sectionKicker="Animes Japoneses · Curadoria Oficial"
      />

      {/* Page Title & Format Switcher */}
      <div className="px-4 sm:px-6 lg:px-10 mt-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Animes
            </h2>
          </div>

          {/* Interactive Format Segmented Control */}
          <div className="inline-flex items-center p-1 rounded-xl bg-[#141414] border border-white/[0.08] self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setFormatTab('tv')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                formatTab === 'tv'
                  ? 'bg-[#E50914] text-white shadow-md'
                  : 'text-[#A1A1A1] hover:text-white'
              }`}
            >
              Séries de Anime
            </button>
            <button
              type="button"
              onClick={() => setFormatTab('movie')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                formatTab === 'movie'
                  ? 'bg-[#E50914] text-white shadow-md'
                  : 'text-[#A1A1A1] hover:text-white'
              }`}
            >
              Filmes de Anime
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <AsyncCarouselRow
          title="Animes populares"
          fetcher={fetchPopular}
          depsKey={formatTab}
          eager
        />
        <AsyncCarouselRow
          title="Animes em alta"
          fetcher={fetchTrendingAnimes}
          depsKey={formatTab}
          eager
        />
        <AsyncCarouselRow
          title="Animes mais bem avaliados"
          fetcher={fetchTopRated}
          depsKey={formatTab}
          eager
        />
        <AsyncCarouselRow title="Animes de ação" fetcher={fetchAction} depsKey={formatTab} />
        <AsyncCarouselRow
          title="Animes de aventura"
          fetcher={fetchAdventure}
          depsKey={formatTab}
        />
        <AsyncCarouselRow title="Animes de romance" fetcher={fetchRomance} depsKey={formatTab} />
        <AsyncCarouselRow title="Animes de fantasia" fetcher={fetchFantasy} depsKey={formatTab} />
        <AsyncCarouselRow title="Animes de comédia" fetcher={fetchComedy} depsKey={formatTab} />
        <AsyncCarouselRow
          title="Animes de suspense"
          fetcher={fetchSuspense}
          depsKey={formatTab}
        />
        <AsyncCarouselRow
          title="Animes clássicos"
          fetcher={fetchClassics}
          depsKey={formatTab}
        />
        <AsyncCarouselRow title="Animes recentes" fetcher={fetchRecent} depsKey={formatTab} />
      </div>
    </div>
  );
};
