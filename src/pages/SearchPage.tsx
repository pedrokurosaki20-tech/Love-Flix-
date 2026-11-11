import React, { useEffect, useRef, useState } from 'react';
import {
  Clock,
  Flame,
  Loader2,
  Search as SearchIcon,
  Trash2,
  X,
} from 'lucide-react';
import { MediaCard } from '../components/MediaCard';
import { MediaCarousel } from '../components/MediaCarousel';
import type { TMDBMediaItem } from '../types/tmdb';
import { tmdbService } from '../services/tmdb';
import { getRecommendedMoviesForSearchHistory } from '../utils/searchRecommendations';
import { useNavigation } from '../context/NavigationContext';
import { useUserData } from '../context/UserDataContext';

export const SearchPage: React.FC = () => {
  const { route } = useNavigation();
  const {
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
  } = useUserData();

  const [inputValue, setInputValue] = useState<string>(route.query || '');
  const [debouncedQuery, setDebouncedQuery] = useState<string>(route.query || '');

  const [results, setResults] = useState<TMDBMediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [recommendedMovies, setRecommendedMovies] = useState<TMDBMediaItem[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(true);

  const [trendingNow, setTrendingNow] = useState<TMDBMediaItem[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    tmdbService
      .getTrending('all', 'day', 1)
      .then((res) => setTrendingNow(res.results.slice(0, 12)))
      .catch(() => {})
      .finally(() => setTrendingLoading(false));
  }, []);

  // Dynamically load ~10 recommended movies based on user's search history (or TMDB popular/top-rated/trending fallback)
  const recentSearchesKey = recentSearches.join('||');
  useEffect(() => {
    let cancelled = false;
    setRecommendedLoading(true);

    getRecommendedMoviesForSearchHistory(recentSearches, 10)
      .then((items) => {
        if (!cancelled) {
          setRecommendedMovies(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecommendedMovies([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRecommendedLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [recentSearchesKey]);

  useEffect(() => {
    if (route.query && route.query !== inputValue) {
      setInputValue(route.query);
      setDebouncedQuery(route.query);
    }
  }, [route.query]);

  // Debounce live search
  useEffect(() => {
    const trimmed = inputValue.trim();
    const timer = setTimeout(() => {
      setDebouncedQuery(trimmed);
      setPage(1);
    }, 320);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // Fetch main search results
  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      setTotalPages(1);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await tmdbService.searchMulti(debouncedQuery, page);
        if (cancelled) return;

        const filtered = (res.results || []).filter((item) => {
          if (!item || !item.id) return false;
          const today = new Date().toISOString().slice(0, 10);
          if (
            item.media_type !== 'tv' &&
            item.media_type !== 'person' &&
            item.release_date &&
            item.release_date > today
          ) {
            return false;
          }
          return true;
        });

        if (page === 1) {
          setResults(filtered);
        } else {
          setResults((prev) => [...prev, ...filtered]);
        }
        setTotalPages(Math.min(res.total_pages || 1, 500));
      } catch {
        if (!cancelled && page === 1) {
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, page]);

  // Capture settled live searches with real results so search history stays accurate
  useEffect(() => {
    if (debouncedQuery.length < 3 || loading || results.length === 0) return;
    const timer = setTimeout(() => {
      addRecentSearch(debouncedQuery);
    }, 1200);
    return () => clearTimeout(timer);
  }, [debouncedQuery, loading, results.length, addRecentSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputValue.trim();
    if (!clean) return;
    addRecentSearch(clean);
    setDebouncedQuery(clean);
    setPage(1);
  };

  const applyQuickTerm = (term: string) => {
    const clean = term.trim();
    setInputValue(clean);
    setDebouncedQuery(clean);
    addRecentSearch(clean);
    setPage(1);
  };

  return (
    <div className="py-6 sm:py-8 space-y-8">
      {/* Campo de Pesquisa */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10">
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="relative flex items-center">
            <SearchIcon className="absolute left-4 sm:left-5 w-5 h-5 text-[#FF253A] pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Digite o título de um filme, série, anime ou nome de um artista..."
              className="w-full h-14 pl-12 sm:pl-14 pr-28 rounded-2xl bg-[#121212] hover:bg-[#161616] focus:bg-[#161616] text-sm sm:text-base text-white placeholder:text-[#A1A1A1]/65 border border-white/15 focus:border-[#E50914] focus:outline-none shadow-xl transition-colors"
            />

            {inputValue && (
              <button
                type="button"
                onClick={() => {
                  setInputValue('');
                  setDebouncedQuery('');
                  inputRef.current?.focus();
                }}
                aria-label="Limpar pesquisa"
                className="absolute right-24 w-8 h-8 rounded-lg hover:bg-white/10 text-[#A1A1A1] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              type="submit"
              className="absolute right-2 h-10 px-4 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-xs sm:text-sm font-bold text-white transition-colors cursor-pointer"
            >
              Buscar
            </button>
          </div>
        </form>
      </div>

      {/* Discovery State (When Search Input is Empty) */}
      {!debouncedQuery ? (
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Carrossel "Recomendados para você" */}
          <MediaCarousel
            title="Recomendados para você"
            items={recommendedMovies}
            loading={recommendedLoading}
          />

          {/* Seção "Pesquisas em alta hoje" */}
          <section className="px-4 sm:px-6 lg:px-10">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-4 h-4 text-[#FF253A]" />
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                Pesquisas em alta hoje
              </h2>
            </div>

            {trendingLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="aspect-[2/3] rounded-xl bg-[#161616] animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-5">
                {trendingNow.map((item, idx) => (
                  <MediaCard key={`${item.id}-${idx}`} item={item} />
                ))}
              </div>
            )}
          </section>

          {/* Pesquisas recentes (quando houver histórico) */}
          {recentSearches.length > 0 && (
            <section className="px-4 sm:px-6 lg:px-10 pt-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#FF253A]" />
                  <h2 className="font-display text-base sm:text-lg font-bold text-white">
                    Pesquisas recentes
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A1A1A1] hover:text-[#FF253A] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar recentes</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term) => (
                  <div
                    key={term}
                    className="inline-flex items-center rounded-xl bg-[#121212] border border-white/10 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => applyQuickTerm(term)}
                      className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-white hover:text-[#FF253A] transition-colors cursor-pointer"
                    >
                      {term}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRecentSearch(term)}
                      aria-label={`Remover ${term}`}
                      className="px-2.5 py-2 text-[#A1A1A1] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        /* Search Results Grid (Without category filter tabs) */
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 space-y-6">
          {loading && page === 1 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div
                  key={idx}
                  className="aspect-[2/3] rounded-xl bg-[#161616] animate-pulse"
                />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="p-12 rounded-2xl bg-[#121212] border border-white/[0.08] text-center max-w-xl mx-auto">
              <p className="text-lg font-bold text-white mb-1.5">
                Nenhum resultado encontrado
              </p>
              <p className="text-xs sm:text-sm text-[#A1A1A1]">
                Verifique a grafia ou tente o título original.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
                {results.map((item, idx) => (
                  <MediaCard
                    key={`${item.media_type || 'multi'}-${item.id}-${idx}`}
                    item={item}
                  />
                ))}
              </div>

              {page < totalPages && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#181818] hover:bg-[#222222] text-sm font-bold text-white border border-white/12 transition-colors cursor-pointer"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin text-[#E50914]" />}
                    <span>Carregar mais resultados (Página {page + 1})</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
