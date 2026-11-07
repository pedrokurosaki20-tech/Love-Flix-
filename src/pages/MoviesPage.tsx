import React, { useCallback, useEffect, useState } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import { HeroBanner } from '../components/HeroBanner';
import { AsyncCarouselRow } from '../components/AsyncCarouselRow';
import { MediaCard } from '../components/MediaCard';
import { ResilientImage } from '../components/ResilientImage';
import {
  COUNTRIES_LIST,
  DECADES_LIST,
  MOVIE_GENRES,
  POPULAR_COLLECTION_IDS,
  type TMDBCollectionDetail,
  type TMDBMediaItem,
} from '../types/tmdb';
import { getBackdropUrl, getPosterUrl, tmdbService } from '../services/tmdb';
import { useNavigation } from '../context/NavigationContext';

export const MoviesPage: React.FC = () => {
  const { route, navigate, openCollectionDetail } = useNavigation();

  const [heroMovies, setHeroMovies] = useState<TMDBMediaItem[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  // Genre filtered view if navigated via genre tag
  const [genreResults, setGenreResults] = useState<TMDBMediaItem[]>([]);
  const [genrePage, setGenrePage] = useState(1);
  const [genreTotalPages, setGenreTotalPages] = useState(1);
  const [genreLoading, setGenreLoading] = useState(false);

  // Interactive Tabs for Genre, Decade, and Country Spotlights
  const [selectedGenreTab, setSelectedGenreTab] = useState<string>('28');
  const [selectedDecadeTab, setSelectedDecadeTab] = useState<string>('2020');
  const [selectedCountryTab, setSelectedCountryTab] = useState<string>('BR');

  // Popular Franchises / Collections
  const [collections, setCollections] = useState<TMDBCollectionDetail[]>([]);

  const activeGenre = route.genreId
    ? MOVIE_GENRES.find((g) => String(g.id) === String(route.genreId))
    : null;

  // Load Hero Movies + Collections
  useEffect(() => {
    let cancelled = false;
    setHeroLoading(true);
    tmdbService
      .getMoviesList('now_playing', 1)
      .then((res) => {
        if (!cancelled) setHeroMovies(res.results || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHeroLoading(false);
      });

    Promise.allSettled(
      POPULAR_COLLECTION_IDS.map((c) => tmdbService.getCollectionDetails(c.id))
    ).then((settled) => {
      if (cancelled) return;
      const valid = settled
        .filter((s): s is PromiseFulfilledResult<TMDBCollectionDetail> => s.status === 'fulfilled')
        .map((s) => s.value);
      setCollections(valid);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load Movies when a genre is selected from route
  useEffect(() => {
    if (!route.genreId) {
      setGenreResults([]);
      setGenrePage(1);
      return;
    }
    let cancelled = false;
    setGenreLoading(true);

    tmdbService
      .discoverMovies({ genre: route.genreId, sortBy: 'popularity.desc', page: genrePage })
      .then((res) => {
        if (cancelled) return;
        setGenreTotalPages(Math.min(res.total_pages || 1, 500));
        setGenreResults((prev) =>
          genrePage === 1 ? res.results : [...prev, ...res.results]
        );
      })
      .catch(() => {
        if (!cancelled && genrePage === 1) setGenreResults([]);
      })
      .finally(() => {
        if (!cancelled) setGenreLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [route.genreId, genrePage]);

  const fetchPopular = useCallback(() => tmdbService.getMoviesList('popular', 1), []);
  const fetchNowPlaying = useCallback(() => tmdbService.getMoviesList('now_playing', 1), []);
  const fetchUpcoming = useCallback(() => tmdbService.getMoviesList('upcoming', 1), []);
  const fetchTopRated = useCallback(() => tmdbService.getMoviesList('top_rated', 1), []);
  const fetchRecommended = useCallback(
    () =>
      tmdbService.discoverMovies({
        minRating: '7.4',
        minVotes: '1000',
        sortBy: 'popularity.desc',
      }),
    []
  );

  const fetchBySelectedGenre = useCallback(
    () => tmdbService.discoverMovies({ genre: selectedGenreTab, sortBy: 'popularity.desc' }),
    [selectedGenreTab]
  );

  const fetchBySelectedDecade = useCallback(
    () =>
      tmdbService.discoverMovies({
        decade: selectedDecadeTab,
        minVotes: '250',
        sortBy: 'vote_average.desc',
      }),
    [selectedDecadeTab]
  );

  const fetchBySelectedCountry = useCallback(
    () =>
      tmdbService.discoverMovies({
        country: selectedCountryTab,
        sortBy: 'popularity.desc',
      }),
    [selectedCountryTab]
  );

  return (
    <div className="pb-10">
      <HeroBanner
        items={heroMovies}
        loading={heroLoading}
        sectionKicker="Cinema & Longas-Metragens"
      />

      {/* Page Title Header */}
      <div className="px-4 sm:px-6 lg:px-10 mt-8 mb-4">
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Filmes
        </h2>
      </div>

      {/* Genre Filtered Results OR Curated Movie Hubs */}
      {activeGenre ? (
        <section className="px-4 sm:px-6 lg:px-10 mt-2">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <h3 className="font-display text-lg sm:text-xl font-bold text-white">
                Gênero: {activeGenre.name}
              </h3>
              <button
                type="button"
                onClick={() => navigate({ page: 'movies' })}
                className="text-xs text-[#FF253A] hover:underline cursor-pointer font-semibold"
              >
                ✕ Ver todos os filmes
              </button>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#A1A1A1]">
              {genreResults.length} filmes
            </span>
          </div>

          {genreLoading && genrePage === 1 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div
                  key={idx}
                  className="aspect-[2/3] rounded-xl bg-[#161616] animate-pulse border border-white/[0.05]"
                />
              ))}
            </div>
          ) : genreResults.length === 0 && !genreLoading ? (
            <div className="p-10 rounded-2xl bg-[#121212] border border-white/[0.08] text-center">
              <p className="text-base font-bold text-white mb-1">
                Nenhum filme encontrado para este gênero
              </p>
              <button
                type="button"
                onClick={() => navigate({ page: 'movies' })}
                className="mt-3 px-5 py-2.5 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-xs font-bold text-white cursor-pointer"
              >
                Voltar aos destaques
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                {genreResults.map((movie, idx) => (
                  <MediaCard key={`${movie.id}-${idx}`} item={movie} />
                ))}
              </div>

              {genrePage < genreTotalPages && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    disabled={genreLoading}
                    onClick={() => setGenrePage((prev) => prev + 1)}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#181818] hover:bg-[#222222] text-sm font-bold text-white border border-white/12 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {genreLoading && <Loader2 className="w-4 h-4 animate-spin text-[#E50914]" />}
                    <span>Carregar mais filmes</span>
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <div className="space-y-1">
          <AsyncCarouselRow title="Filmes populares" fetcher={fetchPopular} eager />
          <AsyncCarouselRow title="Filmes em cartaz" fetcher={fetchNowPlaying} eager />
          <AsyncCarouselRow title="Próximos lançamentos" fetcher={fetchUpcoming} eager />
          <AsyncCarouselRow title="Filmes mais bem avaliados" fetcher={fetchTopRated} />

          {/* Coleções e franquias populares */}
          {collections.length > 0 && (
            <section className="py-5 px-4 sm:px-6 lg:px-10">
              <div className="mb-3.5">
                <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">
                  Coleções e franquias populares
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {collections.map((col) => {
                  const bg =
                    getBackdropUrl(col.backdrop_path, 'w780') ||
                    getPosterUrl(col.poster_path, 'w500');
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => openCollectionDetail(col.id)}
                      className="group relative h-44 rounded-2xl overflow-hidden bg-[#121212] border border-white/[0.08] hover:border-[#E50914]/60 text-left transition-all cursor-pointer"
                    >
                      <ResilientImage
                        src={bg}
                        alt={col.name}
                        fallbackType="backdrop"
                        className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-4 flex flex-col justify-end">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FF253A] mb-1">
                          <Layers className="w-3.5 h-3.5" />
                          <span className="tabular-nums">{col.parts.length} filmes</span>
                        </div>
                        <h3 className="font-display text-base font-bold text-white line-clamp-1">
                          {col.name}
                        </h3>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Filmes por gênero */}
          <div className="pt-2">
            <div className="px-4 sm:px-6 lg:px-10 mb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {MOVIE_GENRES.slice(0, 10).map((g) => {
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
              title="Filmes por gênero"
              fetcher={fetchBySelectedGenre}
              depsKey={selectedGenreTab}
              eager
            />
          </div>

          {/* Filmes por década */}
          <div className="pt-2">
            <div className="px-4 sm:px-6 lg:px-10 mb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {DECADES_LIST.map((d) => {
                const active = selectedDecadeTab === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setSelectedDecadeTab(d.value)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#E50914] text-white'
                        : 'bg-[#141414] hover:bg-[#1f1f1f] text-[#A1A1A1] hover:text-white border border-white/[0.07]'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <AsyncCarouselRow
              title="Filmes por década"
              fetcher={fetchBySelectedDecade}
              depsKey={selectedDecadeTab}
              eager
            />
          </div>

          {/* Filmes por país */}
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
              title="Filmes por país"
              fetcher={fetchBySelectedCountry}
              depsKey={selectedCountryTab}
              eager
            />
          </div>

          <AsyncCarouselRow title="Filmes recomendados" fetcher={fetchRecommended} />
        </div>
      )}
    </div>
  );
};
