import React from 'react';
import { Check, Heart, Play, Plus, Star, Trash2 } from 'lucide-react';
import type { TMDBMediaItem } from '../types/tmdb';
import {
  getMediaTitle,
  getMediaTypeBadgeText,
  getMediaYear,
  getPosterUrl,
  getProfileUrl,
  resolveMediaType,
} from '../services/tmdb';
import { useNavigation } from '../context/NavigationContext';
import { useUserData } from '../context/UserDataContext';
import { ResilientImage } from './ResilientImage';

interface MediaCardProps {
  item: TMDBMediaItem;
  rankNumber?: number;
  subtitleNote?: string;
  onRemoveCustom?: () => void;
  removeTooltip?: string;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  rankNumber,
  subtitleNote,
  onRemoveCustom,
  removeTooltip = 'Remover',
}) => {
  const { openMediaDetail, openPersonDetail, playTrailerForItem } = useNavigation();
  const { profile, isInMyList, toggleMyList, isFavorite, toggleFavorite } = useUserData();

  const mediaType = resolveMediaType(item, 'movie');

  // Person / Artist Card rendering
  if (mediaType === 'person') {
    const profileUrl = getProfileUrl(item.profile_path, 'h632');
    const knownWorks = item.known_for
      ?.map((k) => k.title || k.name)
      .filter(Boolean)
      .slice(0, 2)
      .join(', ');

    return (
      <div
        onClick={() => openPersonDetail(item.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPersonDetail(item.id);
          }
        }}
        className="group cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] rounded-xl"
      >
        <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-[#121212] border border-white/[0.07] transition-transform duration-200 ease-out group-hover:scale-[1.03]">
          <ResilientImage
            src={profileUrl}
            alt={item.name || 'Artista'}
            fallbackType="avatar"
            className="w-full h-full"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-3">
            <span className="text-xs font-semibold text-[#FF253A]">Ver filmografia</span>
          </div>
        </div>
        <div className="mt-2.5 px-0.5">
          <h3 className="text-sm font-bold text-white truncate group-hover:text-[#FF253A] transition-colors">
            {item.name || 'Artista'}
          </h3>
          <p className="text-xs text-[#A1A1A1] truncate mt-0.5">
            {item.known_for_department || 'Atuação'}
            {knownWorks ? ` · ${knownWorks}` : ''}
          </p>
        </div>
      </div>
    );
  }

  const title = getMediaTitle(item);
  const year = getMediaYear(item);
  const rating = item.vote_average && item.vote_average > 0 ? item.vote_average.toFixed(1) : null;
  const typeLabel = getMediaTypeBadgeText(item, mediaType);
  const posterUrl = getPosterUrl(item.poster_path, profile.compactCards ? 'w342' : 'w500');

  const inList = isInMyList(item.id, mediaType);
  const fav = isFavorite(item.id, mediaType);

  const hasRank = rankNumber !== undefined;

  return (
    <article className={`group relative flex flex-col select-none ${hasRank ? 'pl-5 sm:pl-6' : ''}`}>
      {hasRank && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 bottom-[50px] z-20 font-display font-black leading-[0.82] select-none tabular-nums tracking-tighter bg-gradient-to-b from-white via-white/95 to-white/45 bg-clip-text text-transparent [-webkit-text-stroke:1.5px_rgba(255,255,255,0.24)] drop-shadow-[0_6px_14px_rgba(0,0,0,0.98)] transition-transform duration-200 group-hover:scale-105 group-hover:from-white group-hover:to-[#FF253A] ${
            rankNumber >= 10
              ? 'text-[52px] sm:text-[64px] -ml-0.5'
              : 'text-[66px] sm:text-[80px]'
          }`}
        >
          {rankNumber}
        </span>
      )}

      <div
        onClick={() => openMediaDetail(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openMediaDetail(item);
          }
        }}
        className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-[#121212] border border-white/[0.07] transition-transform duration-200 ease-out group-hover:scale-[1.03] group-hover:border-white/20 shadow-md shadow-black/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914]"
      >
        <ResilientImage
          src={posterUrl}
          alt={title}
          fallbackType="poster"
          className="w-full h-full"
        />

        {hasRank && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        )}

        {/* Custom Remove Action (for Minha Lista / Favoritos / Continue Assistindo) */}
        {onRemoveCustom && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveCustom();
            }}
            title={removeTooltip}
            aria-label={removeTooltip}
            className="absolute top-2 right-2 z-20 w-8 h-8 rounded-lg bg-black/80 hover:bg-[#E50914] text-white flex items-center justify-center border border-white/15 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Hover Quick-Action Scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/60 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
          {item.overview && (
            <p className="text-[11px] leading-snug text-white/80 line-clamp-3 mb-3">
              {item.overview}
            </p>
          )}

          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                playTrailerForItem(item);
              }}
              aria-label={`Assistir ${title}`}
              title="Assistir"
              className="flex-1 h-8 rounded-lg bg-[#E50914] hover:bg-[#FF253A] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Assistir</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleMyList(item);
              }}
              aria-label={inList ? 'Remover da Minha Lista' : 'Adicionar à Minha Lista'}
              title={inList ? 'Na Minha Lista' : 'Adicionar à Minha Lista'}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                inList
                  ? 'bg-white/20 border-white/40 text-white'
                  : 'bg-black/70 hover:bg-white/15 border-white/20 text-white/80 hover:text-white'
              }`}
            >
              {inList ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(item);
              }}
              aria-label={fav ? 'Remover dos Favoritos' : 'Favoritar'}
              title={fav ? 'Favorito' : 'Favoritar'}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                fav
                  ? 'bg-white/20 border-white/40 text-white'
                  : 'bg-black/70 hover:bg-white/15 border-white/20 text-white/80 hover:text-white'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${fav ? 'fill-white text-white' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Clean Unboxed Card Footer: Nome, Nota, Ano de lançamento e Tipo de conteúdo */}
      <div className="mt-2.5 px-0.5 min-w-0">
        <button
          type="button"
          onClick={() => openMediaDetail(item)}
          className="block w-full text-left text-sm font-bold text-white truncate group-hover:text-[#FF253A] transition-colors cursor-pointer focus-visible:outline-none"
        >
          {title}
        </button>

        <div className="flex items-center gap-1.5 text-xs text-[#A1A1A1] mt-0.5 tabular-nums truncate">
          {rating && (
            <>
              <span className="inline-flex items-center gap-0.5 text-amber-400 font-semibold">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {rating}
              </span>
              <span aria-hidden="true">·</span>
            </>
          )}
          {year && (
            <>
              <span>{year}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{typeLabel}</span>
        </div>

        {subtitleNote && (
          <p className="text-[11px] text-[#FF253A]/90 font-medium truncate mt-0.5 tabular-nums">
            {subtitleNote}
          </p>
        )}
      </div>
    </article>
  );
};
