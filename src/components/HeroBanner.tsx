import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  Info,
  Play,
  Plus,
  Star,
} from 'lucide-react';
import type { TMDBMediaItem } from '../types/tmdb';
import {
  extractCertification,
  getBackdropUrl,
  getGenreNames,
  getMediaTitle,
  getMediaTypeBadgeText,
  getMediaYear,
  resolveMediaType,
  tmdbService,
} from '../services/tmdb';
import { useNavigation } from '../context/NavigationContext';
import { useUserData } from '../context/UserDataContext';
import { ResilientImage } from './ResilientImage';

interface HeroBannerProps {
  items: TMDBMediaItem[];
  loading?: boolean;
  sectionKicker?: string;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  items,
  loading = false,
  sectionKicker,
}) => {
  const heroItems = items.filter((i) => i.backdrop_path || i.poster_path).slice(0, 6);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [certifications, setCertifications] = useState<Record<string, string>>({});

  const { openMediaDetail, playTrailerForItem } = useNavigation();
  const { profile, isInMyList, toggleMyList, isFavorite, toggleFavorite } = useUserData();

  useEffect(() => {
    setActiveIndex(0);
  }, [items]);

  // Automatic rotation respecting user preference and hover pause
  useEffect(() => {
    if (!profile.autoplayHero || isPaused || heroItems.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % heroItems.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [profile.autoplayHero, isPaused, heroItems.length]);

  const current = heroItems[activeIndex];

  // Fetch official certification for the active banner item when available
  useEffect(() => {
    if (!current) return;
    const mediaType = resolveMediaType(current, 'movie') === 'tv' ? 'tv' : 'movie';
    const key = `${mediaType}_${current.id}`;
    if (certifications[key] !== undefined) return;

    let cancelled = false;
    (async () => {
      try {
        const detail =
          mediaType === 'tv'
            ? await tmdbService.getTVDetails(current.id)
            : await tmdbService.getMovieDetails(current.id);
        const cert = extractCertification(detail);
        if (!cancelled) {
          setCertifications((prev) => ({ ...prev, [key]: cert || '' }));
        }
      } catch {
        if (!cancelled) {
          setCertifications((prev) => ({ ...prev, [key]: '' }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [current, certifications]);

  if (loading || heroItems.length === 0) {
    return (
      <section className="relative w-full h-[500px] sm:h-[560px] lg:h-[640px] bg-[#101010] overflow-hidden border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto h-full flex flex-col justify-end px-4 sm:px-6 lg:px-10 pb-14">
          <div className="w-32 h-4 bg-white/10 rounded animate-pulse mb-4" />
          <div className="w-3/4 max-w-xl h-12 bg-white/10 rounded-lg animate-pulse mb-4" />
          <div className="w-64 h-4 bg-white/10 rounded animate-pulse mb-5" />
          <div className="w-full max-w-xl h-16 bg-white/10 rounded-lg animate-pulse mb-7" />
          <div className="flex gap-3">
            <div className="w-36 h-11 bg-white/10 rounded-xl animate-pulse" />
            <div className="w-44 h-11 bg-white/10 rounded-xl animate-pulse" />
          </div>
        </div>
      </section>
    );
  }

  const mediaType = resolveMediaType(current, 'movie') === 'tv' ? 'tv' : 'movie';
  const title = getMediaTitle(current);
  const year = getMediaYear(current);
  const rating = current.vote_average ? current.vote_average.toFixed(1) : null;
  const genres = getGenreNames(current, 3);
  const certKey = `${mediaType}_${current.id}`;
  const certLabel = certifications[certKey];
  const inList = isInMyList(current.id, mediaType);
  const fav = isFavorite(current.id, mediaType);
  const backdropUrl =
    getBackdropUrl(current.backdrop_path, 'original') ||
    getBackdropUrl(current.poster_path, 'w1280');

  return (
    <section
      aria-label="Destaque principal"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative w-full min-h-[520px] sm:min-h-[580px] lg:min-h-[650px] flex items-end overflow-hidden bg-[#080808]"
    >
      {/* Background Image */}
      <div key={`${mediaType}-${current.id}`} className="absolute inset-0">
        <ResilientImage
          src={backdropUrl}
          alt={title}
          fallbackType="backdrop"
          className="w-full h-full object-cover object-top scale-[1.01]"
        />
        {/* Multi-layered contrast scrims */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-[#080808] via-[#080808]/75 to-transparent"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/45 to-black/25"
        />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-10 pb-12 pt-24">
        <div className="max-w-3xl">
          <p className="text-xs sm:text-sm font-semibold text-[#FF253A] tracking-wide mb-2">
            {sectionKicker || `${getMediaTypeBadgeText(current)} em Destaque`}
          </p>

          <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.08] text-balance mb-3.5">
            {title}
          </h1>

          {/* Unboxed Metadata Row (Zero-Pill Discipline) */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm font-semibold text-white/85 mb-4 tabular-nums">
            {rating && Number(rating) > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                {rating}
              </span>
            )}
            {rating && Number(rating) > 0 && year && (
              <span aria-hidden="true" className="text-white/35">
                ·
              </span>
            )}
            {year && <span>{year}</span>}
            {certLabel && (
              <>
                <span aria-hidden="true" className="text-white/35">
                  ·
                </span>
                <span className="text-white/90">{certLabel}</span>
              </>
            )}
            {genres.length > 0 && (
              <>
                <span aria-hidden="true" className="text-white/35">
                  ·
                </span>
                <span className="text-[#A1A1A1] font-medium">{genres.join(', ')}</span>
              </>
            )}
          </div>

          {current.overview ? (
            <p className="text-sm sm:text-base text-white/80 leading-relaxed line-clamp-3 max-w-2xl mb-7">
              {current.overview}
            </p>
          ) : (
            <p className="text-sm sm:text-base text-[#A1A1A1] leading-relaxed max-w-2xl mb-7">
              Explore todos os detalhes, elenco, avaliações e conteúdos relacionados desta produção no catálogo oficial da Love Flix.
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => playTrailerForItem(current)}
              className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-white text-sm font-bold shadow-lg shadow-[#E50914]/25 transition-all duration-150 active:scale-[0.98] whitespace-nowrap shrink-0 min-h-[44px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Assistir</span>
            </button>

            <button
              type="button"
              onClick={() => openMediaDetail(current)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/12 hover:bg-white/20 backdrop-blur-md text-white text-sm font-bold border border-white/15 transition-all duration-150 active:scale-[0.98] whitespace-nowrap shrink-0 min-h-[44px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914]"
            >
              <Info className="w-4 h-4" />
              <span>Mais informações</span>
            </button>

            <button
              type="button"
              onClick={() => toggleMyList(current)}
              className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border transition-all duration-150 active:scale-[0.98] whitespace-nowrap shrink-0 min-h-[44px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] ${
                inList
                  ? 'bg-[#191919] text-white border-[#E50914]/60'
                  : 'bg-[#121212]/80 hover:bg-[#1e1e1e] text-white border-white/15'
              }`}
            >
              {inList ? (
                <>
                  <Check className="w-4 h-4 text-[#FF253A]" />
                  <span>Na minha lista</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Minha lista</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => toggleFavorite(current)}
              aria-label={fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              title={fav ? 'Remover dos favoritos' : 'Favoritar'}
              className={`inline-flex items-center justify-center w-11 h-11 rounded-xl border transition-all duration-150 active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] ${
                fav
                  ? 'bg-[#E50914]/20 border-[#E50914] text-[#FF253A]'
                  : 'bg-[#121212]/80 hover:bg-[#1e1e1e] border-white/15 text-white'
              }`}
            >
              <Heart className={`w-4 h-4 ${fav ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>

        {/* Manual Rotation Controls & Slide Indicators */}
        {heroItems.length > 1 && (
          <div className="mt-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2" role="tablist" aria-label="Destaques">
              {heroItems.map((item, idx) => {
                const isSelected = idx === activeIndex;
                return (
                  <button
                    key={`${item.id}-${idx}`}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    aria-label={`Destaque ${idx + 1}: ${getMediaTitle(item)}`}
                    onClick={() => setActiveIndex(idx)}
                    className="py-2 cursor-pointer group focus-visible:outline-none"
                  >
                    <span
                      className={`block h-1 rounded-full transition-all duration-200 ${
                        isSelected
                          ? 'w-9 bg-[#E50914]'
                          : 'w-4 bg-white/30 group-hover:bg-white/60'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setActiveIndex((prev) => (prev - 1 + heroItems.length) % heroItems.length)
                }
                aria-label="Destaque anterior"
                className="w-9 h-9 rounded-lg bg-[#141414]/85 hover:bg-[#222222] border border-white/10 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveIndex((prev) => (prev + 1) % heroItems.length)}
                aria-label="Próximo destaque"
                className="w-9 h-9 rounded-lg bg-[#141414]/85 hover:bg-[#222222] border border-white/10 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
