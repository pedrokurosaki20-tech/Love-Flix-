import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TMDBMediaItem, TMDBPaginatedResponse } from '../types/tmdb';
import { MediaCarousel } from './MediaCarousel';

interface AsyncCarouselRowProps {
  title: string;
  fetcher: () => Promise<TMDBPaginatedResponse<TMDBMediaItem> | TMDBMediaItem[]>;
  eager?: boolean;
  showRankNumbers?: boolean;
  maxItems?: number;
  depsKey?: string;
}

export const AsyncCarouselRow: React.FC<AsyncCarouselRowProps> = ({
  title,
  fetcher,
  eager = false,
  showRankNumbers = false,
  maxItems = 20,
  depsKey = 'default',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState<boolean>(eager);
  const [items, setItems] = useState<TMDBMediaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  useEffect(() => {
    if (eager || shouldLoad) return;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '500px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [eager, shouldLoad]);

  const executeFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      const rawList = Array.isArray(result) ? result : result.results || [];
      setItems(rawList.slice(0, maxItems));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar conteúdos.');
    } finally {
      setLoading(false);
    }
  }, [fetcher, maxItems]);

  useEffect(() => {
    if (!shouldLoad) return;
    executeFetch();
  }, [shouldLoad, depsKey, reloadCounter, executeFetch]);

  return (
    <div ref={containerRef}>
      <MediaCarousel
        title={title}
        items={items}
        loading={!shouldLoad || loading}
        error={error}
        onRetry={() => setReloadCounter((c) => c + 1)}
        showRankNumbers={showRankNumbers}
      />
    </div>
  );
};
