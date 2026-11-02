import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HeroBanner } from '../components/HeroBanner';
import { FilterBar } from '../components/FilterBar';
import { AsyncCarouselRow } from '../components/AsyncCarouselRow';
import { MediaCard } from '../components/MediaCard';
import {
  MOVIE_GENRES,
  TV_GENRES,
  type DiscoverFilterParams,
  type TMDBMediaItem,
} from '../types/tmdb';
import { tmdbService } from '../services/tmdb';

export const AnimesPage: React.FC = () => {
  const [formatTab, setFormatTab] = useState<'tv' | 'movie'>('tv');
  const [heroAnimes, setHeroAnimes] = useState<TMDBMediaItem[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  const [filters, setFilters] = useState<DiscoverFilterParams>({
    sortBy: 'popularity.desc',
    page: 1,
  });
  const [filteredResults, setFilteredResults] = useState<TMDBMediaItem[]>([]);
  const [filteredTotalPages, setFilteredTotalPages] = useState(1);
  const [filteredLoading, setFilteredLoading] = useState(false);

  const hasActiveFilters = Boolean(
    filters.genre ||
      filters.year ||
      filters.decade ||
      filters.minRating ||
      filters.status ||
      (filters.sortBy && filters.sortBy !== 'popularity.desc')
  );

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

  useEffect(() => {
    if (!hasActiveFilters) return;
    let cancelled = false;
    setFilteredLoading(true);

    tmdbService
      .discoverAnimes(formatTab, filters)
      .then((res) => {
        if (cancelled) return;
        setFilteredTotalPages(Math.min(res.total_pages || 1, 500));
        setFilteredResults((prev) =>
          (filters.page || 1) === 1 ? res.results : [...prev, ...res.results]
        );
      })
      .catch(() => {
        if (!cancelled && (filters.page || 1) === 1) setFilteredResults([]);
      })
      .finally(() => {
        if (!cancelled) setFilteredLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [formatTab, filters, hasActiveFilters]);

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

  const animeSubgenres = (formatTab === 'tv' ? TV_GENRES : MOVIE_GENRES).filter(
    (g) => g.id !== 16
  );

  return (
    <div className="pb-10">
      <HeroBanner
        items={heroAnimes}
        loading={heroLoading}
        sectionKicker="Animes Japoneses · Curadoria Oficial"
      />

      <div className="px-4 sm:px-6 lg:px-10 mt-8 mb-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Animes
            </h2>
          </div>

          {/* Interactive Format Segmented Control */}
          <div className="inline-flex items-center p-1 rounded-xl bg-[#141414] border border-white/[0.08] self-start">
            <button
              type="button"
              onClick={() => {
                setFormatTab('tv');
                setFilters({ sortBy: 'popularity.desc', page: 1 });
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                formatTab === 'tv'
                  ? 'bg-[#E50914] text-white'
                  : 'text-[#A1A1A1] hover:text-white'
              }`}
            >
              Séries de Anime
            </button>
            <button
              type="button"
              onClick={() => {
                setFormatTab('movie');
                setFilters({ sortBy: 'popularity.desc', page: 1 });
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                formatTab === 'movie'
                  ? 'bg-[#E50914] text-white'
                  : 'text-[#A1A1A1] hover:text-white'
              }`}
            >
              Filmes de Anime
            </button>
          </div>
        </div>

        <FilterBar
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters({ sortBy: 'popularity.desc', page: 1 })}
          genres={animeSubgenres}
          mediaMode={formatTab}
          hideCountry
          hideLanguage
        />
      </div>

      {hasActiveFilters ? (
        <section className="px-4 sm:px-6 lg:px-10 mt-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-lg sm:text-xl font-bold text-white">
              Animes Filtrados
            </h3>
            <span className="text-xs font-mono tabular-nums text-[#A1A1A1]">
              {filteredResults.length} títulos exibidos
            </span>
          </div>

          {filteredLoading && (filters.page || 1) === 1 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div
                  key={idx}
                  className="aspect-[2/3] rounded-xl bg-[#161616] animate-pulse border border-white/[0.05]"
                />
              ))}
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[#121212] border border-white/[0.08] text-center">
              <p className="text-base font-bold text-white mb-1">
                Nenhum anime encontrado para essa combinação
              </p>
              <button
                type="button"
                onClick={() => setFilters({ sortBy: 'popularity.desc', page: 1 })}
                className="mt-3 px-5 py-2.5 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-xs font-bold text-white cursor-pointer"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                {filteredResults.map((anime, idx) => (
                  <MediaCard key={`${anime.id}-${idx}`} item={anime} />
                ))}
              </div>

              {(filters.page || 1) < filteredTotalPages && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    disabled={filteredLoading}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))
                    }
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#181818] hover:bg-[#222222] text-sm font-bold text-white border border-white/12 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {filteredLoading && <Loader2 className="w-4 h-4 animate-spin text-[#E50914]" />}
                    <span>Carregar mais animes</span>
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
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
      )}
    </div>
  );
};
