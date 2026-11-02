import React, { useCallback, useEffect, useState } from 'react';
import { HeroBanner } from '../components/HeroBanner';
import { AsyncCarouselRow } from '../components/AsyncCarouselRow';
import type { TMDBMediaItem } from '../types/tmdb';
import { tmdbService } from '../services/tmdb';

export const DocumentariesPage: React.FC = () => {
  const [formatTab, setFormatTab] = useState<'movie' | 'tv'>('movie');
  const [heroDocs, setHeroDocs] = useState<TMDBMediaItem[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setHeroLoading(true);
    const req =
      formatTab === 'movie'
        ? tmdbService.discoverMovies({ genre: '99', sortBy: 'popularity.desc' })
        : tmdbService.discoverTV({ genre: '99', sortBy: 'popularity.desc' });

    req
      .then((res) => {
        if (!cancelled) setHeroDocs(res.results || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHeroLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [formatTab]);

  const fetchPopularMovieDocs = useCallback(
    () => tmdbService.discoverMovies({ genre: '99', sortBy: 'popularity.desc' }),
    []
  );
  const fetchPopularDocuseries = useCallback(
    () => tmdbService.discoverTV({ genre: '99', sortBy: 'popularity.desc' }),
    []
  );
  const fetchTopRatedDocs = useCallback(
    () =>
      tmdbService.discoverMovies({
        genre: '99',
        sortBy: 'vote_average.desc',
        minVotes: '150',
      }),
    []
  );
  const fetchTrueCrime = useCallback(
    () =>
      tmdbService.discoverTV({
        genre: '99,80',
        sortBy: 'popularity.desc',
      }),
    []
  );
  const fetchHistoryDocs = useCallback(
    () =>
      tmdbService.discoverMovies({
        genre: '99,36',
        sortBy: 'popularity.desc',
      }),
    []
  );
  const fetchMusicDocs = useCallback(
    () =>
      tmdbService.discoverMovies({
        genre: '99,10402',
        sortBy: 'popularity.desc',
      }),
    []
  );
  const fetchBrazilianDocs = useCallback(
    () =>
      tmdbService.discoverMovies({
        genre: '99',
        country: 'BR',
        sortBy: 'popularity.desc',
      }),
    []
  );
  const fetchRecentDocs = useCallback(
    () =>
      tmdbService.discoverMovies(
        {
          genre: '99',
          sortBy: 'primary_release_date.desc',
          minVotes: '15',
        },
        { 'primary_release_date.lte': '2026-12-31', 'primary_release_date.gte': '2024-01-01' }
      ),
    []
  );

  return (
    <div className="pb-10">
      <HeroBanner
        items={heroDocs}
        loading={heroLoading}
        sectionKicker="Documentários & Histórias Reais"
      />

      <div className="px-4 sm:px-6 lg:px-10 mt-8 mb-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Documentários
            </h2>
          </div>

          <div className="inline-flex items-center p-1 rounded-xl bg-[#141414] border border-white/[0.08] self-start">
            <button
              type="button"
              onClick={() => setFormatTab('movie')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                formatTab === 'movie'
                  ? 'bg-[#E50914] text-white'
                  : 'text-[#A1A1A1] hover:text-white'
              }`}
            >
              Filmes Documentais
            </button>
            <button
              type="button"
              onClick={() => setFormatTab('tv')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                formatTab === 'tv'
                  ? 'bg-[#E50914] text-white'
                  : 'text-[#A1A1A1] hover:text-white'
              }`}
            >
              Docusséries
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <AsyncCarouselRow title="Documentários populares" fetcher={fetchPopularMovieDocs} eager />
        <AsyncCarouselRow title="Docusséries em alta" fetcher={fetchPopularDocuseries} eager />
        <AsyncCarouselRow title="Crime real e investigação" fetcher={fetchTrueCrime} eager />
        <AsyncCarouselRow title="Documentários mais bem avaliados" fetcher={fetchTopRatedDocs} />
        <AsyncCarouselRow title="Música, palcos e bastidores" fetcher={fetchMusicDocs} />
        <AsyncCarouselRow title="História, sociedade e biografias" fetcher={fetchHistoryDocs} />
        <AsyncCarouselRow title="Documentários brasileiros" fetcher={fetchBrazilianDocs} />
        <AsyncCarouselRow title="Lançamentos documentais recentes" fetcher={fetchRecentDocs} />
      </div>
    </div>
  );
};
