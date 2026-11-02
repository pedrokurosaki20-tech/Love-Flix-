import React, { useCallback, useEffect, useState } from 'react';
import { HeroBanner } from '../components/HeroBanner';
import { AsyncCarouselRow } from '../components/AsyncCarouselRow';
import type { TMDBMediaItem } from '../types/tmdb';
import { tmdbService } from '../services/tmdb';

export const DoramasPage: React.FC = () => {
  const [heroItems, setHeroItems] = useState<TMDBMediaItem[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setHeroLoading(true);
    tmdbService
      .discoverDoramas({ country: 'KR', sortBy: 'popularity.desc' })
      .then((res) => {
        if (!cancelled) setHeroItems(res.results || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHeroLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPopularKDramas = useCallback(
    () => tmdbService.discoverDoramas({ country: 'KR', sortBy: 'popularity.desc' }),
    []
  );
  const fetchTopRatedDoramas = useCallback(
    () =>
      tmdbService.discoverDoramas({
        country: 'KR|JP|CN',
        sortBy: 'vote_average.desc',
        minVotes: '150',
      }),
    []
  );
  const fetchRomanticComedies = useCallback(
    () =>
      tmdbService.discoverDoramas({
        country: 'KR',
        genre: '18,35',
        sortBy: 'popularity.desc',
      }),
    []
  );
  const fetchThrillerCrime = useCallback(
    () =>
      tmdbService.discoverDoramas({
        country: 'KR',
        genre: '18,9648|80',
        sortBy: 'popularity.desc',
      }),
    []
  );
  const fetchFantasyDoramas = useCallback(
    () =>
      tmdbService.discoverDoramas({
        country: 'KR|CN',
        genre: '18,10765',
        sortBy: 'popularity.desc',
      }),
    []
  );
  const fetchJDramas = useCallback(
    () => tmdbService.discoverDoramas({ country: 'JP', sortBy: 'popularity.desc' }),
    []
  );
  const fetchCDramas = useCallback(
    () => tmdbService.discoverDoramas({ country: 'CN', sortBy: 'popularity.desc' }),
    []
  );
  const fetchRecentDoramas = useCallback(
    () =>
      tmdbService.discoverDoramas(
        {
          country: 'KR|JP|CN',
          sortBy: 'first_air_date.desc',
          minVotes: '15',
        },
        { 'first_air_date.lte': '2026-12-31', 'first_air_date.gte': '2024-01-01' }
      ),
    []
  );

  return (
    <div className="pb-10">
      <HeroBanner
        items={heroItems}
        loading={heroLoading}
        sectionKicker="Doramas · K-Dramas, J-Dramas & C-Dramas"
      />

      <div className="px-4 sm:px-6 lg:px-10 mt-8 mb-3">
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Doramas
        </h2>
      </div>

      <div className="space-y-1">
        <AsyncCarouselRow title="K-Dramas populares" fetcher={fetchPopularKDramas} eager />
        <AsyncCarouselRow
          title="Doramas mais bem avaliados"
          fetcher={fetchTopRatedDoramas}
          eager
        />
        <AsyncCarouselRow
          title="Comédias românticas e paixões"
          fetcher={fetchRomanticComedies}
          eager
        />
        <AsyncCarouselRow title="Suspense, investigação e mistério" fetcher={fetchThrillerCrime} />
        <AsyncCarouselRow title="Fantasia, épicos e sobrenatural" fetcher={fetchFantasyDoramas} />
        <AsyncCarouselRow title="J-Dramas japoneses em destaque" fetcher={fetchJDramas} />
        <AsyncCarouselRow title="C-Dramas chineses aclamados" fetcher={fetchCDramas} />
        <AsyncCarouselRow title="Lançamentos recentes de doramas" fetcher={fetchRecentDoramas} />
      </div>
    </div>
  );
};
