import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HeroBanner } from '../components/HeroBanner';
import { FilterBar } from '../components/FilterBar';
import { AsyncCarouselRow } from '../components/AsyncCarouselRow';
import { MediaCard } from '../components/MediaCard';
import {
  COUNTRIES_LIST,
  TV_GENRES,
  type DiscoverFilterParams,
  type TMDBMediaItem,
} from '../types/tmdb';
import { tmdbService } from '../services/tmdb';
import { useNavigation } from '../context/NavigationContext';

export const SeriesPage: React.FC = () => {
  const { route } = useNavigation();

  const [heroSeries, setHeroSeries] = useState<TMDBMediaItem[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  const [filters, setFilters] = useState<DiscoverFilterParams>(() => ({
    genre: route.genreId || undefined,
    sortBy: 'popularity.desc',
    page: 1,
  }));
  const [filteredResults, setFilteredResults] = useState<TMDBMediaItem[]>([]);
  const [filteredTotalPages, setFilteredTotalPages] = useState(1);
  const [filteredLoading, setFilteredLoading] = useState(false);

  const [selectedGenreTab, setSelectedGenreTab] = useState<string>('18');
  const [selectedCountryTab, setSelectedCountryTab] = useState<string>('US');

  useEffect(() => {
    if (route.genreId) {
      setFilters((prev) => ({ ...prev, genre: route.genreId, page: 1 }));
    }
  }, [route.genreId]);

  const hasActiveFilters = Boolean(
    filters.genre ||
      filters.year ||
      filters.decade ||
      filters.minRating ||
      filters.country ||
      filters.status ||
      (filters.sortBy && filters.sortBy !== 'popularity.desc')
  );

  useEffect(() => {
    let cancelled = false;
    setHeroLoading(true);
    tmdbService
      .getTrending('tv', 'week', 1)
      .then((res) => {
        if (!cancelled) setHeroSeries(res.results || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHeroLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasActiveFilters) return;
    let cancelled = false;
    setFilteredLoading(true);

    tmdbService
      .discoverTV(filters)
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
  }, [filters, hasActiveFilters]);

  const fetchPopular = useCallback(() => tmdbService.getTVList('popular', 1), []);
  const fetchTrending = useCallback(() => tmdbService.getTrending('tv', 'week', 1), []);
  const fetchTopRated = useCallback(() => tmdbService.getTVList('top_rated', 1), []);
  const fetchNewReleases = useCallback(
    () =>
      tmdbService.discoverTV(
        { sortBy: 'first_air_date.desc', minVotes: '25' },
        { 'first_air_date.lte': '2026-12-31', 'first_air_date.gte': '2024-06-01' }
      ),
    []
  );
  const fetchOngoingSeries = useCallback(
    () => tmdbService.discoverTV({ status: '0', sortBy: 'popularity.desc' }),
    []
  );
  const fetchEndedSeries = useCallback(
    () => tmdbService.discoverTV({ status: '3', minVotes: '400', sortBy: 'vote_average.desc' }),
    []
  );
  const fetchRecommendedSeries = useCallback(
    () =>
      tmdbService.discoverTV({
        minRating: '8',
        minVotes: '500',
        sortBy: 'popularity.desc',
      }),
    []
  );

  const fetchByGenre = useCallback(
    () => tmdbService.discoverTV({ genre: selectedGenreTab, sortBy: 'popularity.desc' }),
    [selectedGenreTab]
  );

  const fetchByCountry = useCallback(
    () => tmdbService.discoverTV({ country: selectedCountryTab, sortBy: 'popularity.desc' }),
    [selectedCountryTab]
  );

  return (
    <div className="pb-10">
      <HeroBanner
        items={heroSeries}
        loading={heroLoading}
        sectionKicker="Séries & Produções Episódicas"
      />

      <div className="px-4 sm:px-6 lg:px-10 mt-8 mb-6">
        <div className="mb-4">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Séries
          </h2>
        </div>

        <FilterBar
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters({ sortBy: 'popularity.desc', page: 1 })}
          genres={TV_GENRES}
          mediaMode="tv"
        />
      </div>

      {hasActiveFilters ? (
        <section className="px-4 sm:px-6 lg:px-10 mt-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-lg sm:text-xl font-bold text-white">
              Séries Filtradas
            </h3>
            <span className="text-xs font-mono tabular-nums text-[#A1A1A1]">
              {filteredResults.length} séries exibidas
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
                Nenhuma série corresponde aos filtros aplicados
              </p>
              <p className="text-xs sm:text-sm text-[#A1A1A1] mb-4">
                Tente remover o filtro de situação ou escolher outro país de origem.
              </p>
              <button
                type="button"
                onClick={() => setFilters({ sortBy: 'popularity.desc', page: 1 })}
                className="px-5 py-2.5 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-xs font-bold text-white cursor-pointer"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                {filteredResults.map((tv, idx) => (
                  <MediaCard key={`${tv.id}-${idx}`} item={tv} />
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
                    <span>Carregar mais séries</span>
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <div className="space-y-1">
          <AsyncCarouselRow title="Séries em alta" fetcher={fetchTrending} eager />
          <AsyncCarouselRow title="Séries populares" fetcher={fetchPopular} eager />
          <AsyncCarouselRow title="Séries mais bem avaliadas" fetcher={fetchTopRated} eager />
          <AsyncCarouselRow title="Séries recém-lançadas" fetcher={fetchNewReleases} />
          <AsyncCarouselRow title="Séries em andamento" fetcher={fetchOngoingSeries} />
          <AsyncCarouselRow title="Séries finalizadas" fetcher={fetchEndedSeries} />

          {/* Séries por gênero */}
          <div className="pt-2">
            <div className="px-4 sm:px-6 lg:px-10 mb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {TV_GENRES.map((g) => {
                const active = selectedGenreTab === String(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGenreTab(String(g.id))}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#E50914] text-white'
                        : 'bg-[#141414] hover:bg-[#1f1f1f] text-[#A1A1A1] hover:text-white border border-white/[0.07]'
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
            <AsyncCarouselRow
              title="Séries por gênero"
              fetcher={fetchByGenre}
              depsKey={selectedGenreTab}
              eager
            />
          </div>

          {/* Séries por país */}
          <div className="pt-2">
            <div className="px-4 sm:px-6 lg:px-10 mb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {COUNTRIES_LIST.slice(0, 8).map((c) => {
                const active = selectedCountryTab === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setSelectedCountryTab(c.code)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#E50914] text-white'
                        : 'bg-[#141414] hover:bg-[#1f1f1f] text-[#A1A1A1] hover:text-white border border-white/[0.07]'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
            <AsyncCarouselRow
              title="Séries por país"
              fetcher={fetchByCountry}
              depsKey={selectedCountryTab}
              eager
            />
          </div>

          <AsyncCarouselRow title="Séries recomendadas" fetcher={fetchRecommendedSeries} />
        </div>
      )}
    </div>
  );
};
