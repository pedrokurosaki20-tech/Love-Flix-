import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { TMDBMediaItem } from '../types/tmdb';
import { MediaCard } from './MediaCard';
import { useUserData } from '../context/UserDataContext';

interface MediaCarouselProps {
  title: string;
  items: TMDBMediaItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  showRankNumbers?: boolean;
  getItemSubtitle?: (item: TMDBMediaItem) => string | undefined;
  onRemoveItem?: (item: TMDBMediaItem) => void;
  removeTooltip?: string;
  emptyStateText?: string;
}

export const MediaCarousel: React.FC<MediaCarouselProps> = ({
  title,
  items,
  loading = false,
  error = null,
  onRetry,
  showRankNumbers = false,
  getItemSubtitle,
  onRemoveItem,
  removeTooltip,
  emptyStateText,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { profile } = useUserData();

  const scrollByViewport = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = Math.max(el.clientWidth * 0.82, 320);
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  if (!loading && !error && items.length === 0 && !emptyStateText) {
    return null;
  }

  const cardWidthClass = profile.compactCards
    ? 'w-[136px] sm:w-[154px] lg:w-[168px]'
    : 'w-[152px] sm:w-[176px] lg:w-[196px]';

  return (
    <section className="py-3.5 sm:py-4">
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-10 mb-3">
        <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight truncate">
          {title}
        </h2>

        {items.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => scrollByViewport('left')}
              aria-label={`Rolar ${title} para a esquerda`}
              className="w-8 h-8 rounded-lg bg-[#141414] hover:bg-[#222222] border border-white/[0.08] text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollByViewport('right')}
              aria-label={`Rolar ${title} para a direita`}
              className="w-8 h-8 rounded-lg bg-[#141414] hover:bg-[#222222] border border-white/[0.08] text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {error ? (
        <div className="mx-4 sm:mx-6 lg:mx-10 p-5 rounded-2xl bg-[#121212] border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-sm font-semibold text-white">
            Não foi possível carregar esta fileira agora.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1c1c1c] hover:bg-[#262626] text-xs font-semibold text-white border border-white/10 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tentar novamente</span>
            </button>
          )}
        </div>
      ) : loading ? (
        <div className="flex gap-3.5 sm:gap-4 overflow-hidden px-4 sm:px-6 lg:px-10">
          {Array.from({ length: 7 }).map((_, idx) => (
            <div key={idx} className={`${cardWidthClass} shrink-0`}>
              <div className="aspect-[2/3] w-full rounded-xl bg-[#161616] animate-pulse border border-white/[0.05]" />
              <div className="h-3.5 w-3/4 bg-[#181818] rounded animate-pulse mt-2.5" />
              <div className="h-3 w-1/2 bg-[#161616] rounded animate-pulse mt-1.5" />
            </div>
          ))}
        </div>
      ) : items.length === 0 && emptyStateText ? (
        <div className="mx-4 sm:mx-6 lg:mx-10 p-6 sm:p-7 rounded-2xl bg-[#121212] border border-white/[0.07]">
          <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">{emptyStateText}</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex gap-3.5 sm:gap-4 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory px-4 sm:px-6 lg:px-10 pb-2"
        >
          {items.map((item, idx) => (
            <div
              key={`${item.media_type || 'm'}-${item.id}-${idx}`}
              className={`${cardWidthClass} shrink-0 snap-start`}
            >
              <MediaCard
                item={item}
                rankNumber={showRankNumbers ? idx + 1 : undefined}
                subtitleNote={getItemSubtitle ? getItemSubtitle(item) : undefined}
                onRemoveCustom={onRemoveItem ? () => onRemoveItem(item) : undefined}
                removeTooltip={removeTooltip}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
