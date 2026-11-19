import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Film,
  Heart,
  Layers,
  Loader2,
  Play,
  Plus,
  Share2,
  Star,
} from 'lucide-react';
import { ResilientImage } from '../components/ResilientImage';
import { MediaCarousel } from '../components/MediaCarousel';
import { MediaCard } from '../components/MediaCard';
import {
  extractCertification,
  formatReleaseDate,
  formatRuntime,
  getBackdropUrl,
  getMediaTitle,
  getMediaTypeBadgeText,
  getMediaYear,
  getOriginalMediaTitle,
  getPosterUrl,
  getProfileUrl,
  getStillUrl,
  isCinemaOnlyMovie,
  pickBestTrailer,
  selectUsefulEpisodeGroups,
  tmdbService,
} from '../services/tmdb';
import type {
  TMDBCollectionDetail,
  TMDBEpisode,
  TMDBEpisodeGroupDetail,
  TMDBMediaDetail,
  TMDBPersonDetail,
  TMDBSeasonDetail,
  TMDBVideo,
} from '../types/tmdb';
import { useNavigation } from '../context/NavigationContext';
import { useUserData } from '../context/UserDataContext';

// ============================================================================
// 1. INDIVIDUAL MOVIE / SERIES / ANIME / DORAMA DETAIL PAGE
// ============================================================================
export const MediaDetailPage: React.FC<{
  mediaType: 'movie' | 'tv';
  id: number;
}> = ({ mediaType, id }) => {
  const {
    navigateToPage,
    openMediaDetail,
    openPersonDetail,
    openCollectionDetail,
    openWatchModal,
  } = useNavigation();

  const {
    isInMyList,
    toggleMyList,
    isFavorite,
    toggleFavorite,
    isWatched,
    toggleWatched,
    recordHistoryVisit,
    history,
    pushToast,
  } = useUserData();

  const [detail, setDetail] = useState<TMDBMediaDetail | null>(null);
  const [collectionDetail, setCollectionDetail] = useState<TMDBCollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVideo, setSelectedVideo] = useState<TMDBVideo | null>(null);

  // TV Seasons, Integrated Arcs/Parts & Episodes State
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(1);
  const [seasonDetail, setSeasonDetail] = useState<TMDBSeasonDetail | null>(null);
  const [seasonLoading, setSeasonLoading] = useState<boolean>(false);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState<boolean>(false);
  const [primaryEpisodeGroup, setPrimaryEpisodeGroup] = useState<TMDBEpisodeGroupDetail | null>(
    null
  );
  const [primaryGroupKind, setPrimaryGroupKind] = useState<'arcs' | 'parts' | null>(null);
  const [expandedSectionIds, setExpandedSectionIds] = useState<string[]>([]);
  const [isCinemaExclusive, setIsCinemaExclusive] = useState<boolean>(false);
  const seasonDropdownRef = useRef<HTMLDivElement | null>(null);

  const trackedHistoryEntry = useMemo(
    () => history.find((h) => h.id === id && h.media_type === mediaType),
    [history, id, mediaType]
  );

  // Close season dropdown when tapping outside
  useEffect(() => {
    if (!seasonMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        seasonDropdownRef.current &&
        !seasonDropdownRef.current.contains(e.target as Node)
      ) {
        setSeasonMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [seasonMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setCollectionDetail(null);
    setSeasonDetail(null);
    setSeasonMenuOpen(false);
    setPrimaryEpisodeGroup(null);
    setPrimaryGroupKind(null);
    setExpandedSectionIds([]);
    setIsCinemaExclusive(false);

    (async () => {
      try {
        const [data, cinemaOnly] = await Promise.all([
          mediaType === 'tv'
            ? tmdbService.getTVDetails(id)
            : tmdbService.getMovieDetails(id),
          mediaType === 'movie' ? isCinemaOnlyMovie(id) : Promise.resolve(false),
        ]);

        if (cancelled) return;
        setDetail(data);
        setIsCinemaExclusive(cinemaOnly);
        if (!cinemaOnly) {
          recordHistoryVisit(data, 'viewed');
        }

        const ytVideos = (data.videos?.results || []).filter(
          (v) => v.site === 'YouTube' && v.key
        );
        setSelectedVideo(pickBestTrailer(ytVideos));

        if (mediaType === 'movie' && data.belongs_to_collection?.id) {
          tmdbService
            .getCollectionDetails(data.belongs_to_collection.id)
            .then((col) => {
              if (!cancelled) setCollectionDetail(col);
            })
            .catch(() => {
              // ignore collection load error
            });
        }

        if (mediaType === 'tv' && data.seasons && data.seasons.length > 0) {
          const validTrackedSeason = trackedHistoryEntry?.trackedSeason
            ? data.seasons.find(
                (s) => s.season_number === trackedHistoryEntry.trackedSeason && s.episode_count > 0
              )
            : undefined;
          const firstRegular =
            validTrackedSeason ||
            data.seasons.find((s) => s.season_number > 0 && s.episode_count > 0) ||
            data.seasons[0];
          setSelectedSeasonNumber(firstRegular.season_number);

          // Automatically load best Arcs or Parts structure in background (no mode buttons needed)
          const groupOpts = selectUsefulEpisodeGroups(data.episode_groups?.results);
          if (groupOpts.length > 0) {
            const best = groupOpts[0];
            tmdbService
              .getTVEpisodeGroupDetails(best.id)
              .then((gDetail) => {
                if (!cancelled) {
                  setPrimaryEpisodeGroup(gDetail);
                  setPrimaryGroupKind(best.kind);
                }
              })
              .catch(() => {
                // silently fallback to standard flat season episodes
              });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Não foi possível carregar os detalhes.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mediaType, id]);

  // Fetch episodes when TV season changes
  useEffect(() => {
    if (mediaType !== 'tv' || !detail) return;
    let cancelled = false;
    setSeasonLoading(true);

    tmdbService
      .getTVSeasonDetails(id, selectedSeasonNumber)
      .then((sData) => {
        if (!cancelled) setSeasonDetail(sData);
      })
      .catch(() => {
        if (!cancelled) setSeasonDetail(null);
      })
      .finally(() => {
        if (!cancelled) setSeasonLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mediaType, id, detail, selectedSeasonNumber]);

  // Build unified sections (Arcs / Parts / Episode Blocks) for the currently selected season
  const seasonSections = useMemo(() => {
    if (mediaType !== 'tv' || !seasonDetail) return [];

    const rawEpisodes = seasonDetail.episodes || [];
    const epByNumber = new Map<number, TMDBEpisode>();
    for (const ep of rawEpisodes) {
      epByNumber.set(ep.episode_number, ep);
    }

    if (primaryEpisodeGroup?.groups?.length) {
      const matched = primaryEpisodeGroup.groups
        .map((g, idx) => {
          const seasonEps = g.episodes
            .filter((ep) => ep.season_number === selectedSeasonNumber)
            .map((ep) => {
              const rich = epByNumber.get(ep.episode_number);
              return rich ? { ...ep, ...rich } : ep;
            });
          return { g, idx, seasonEps };
        })
        .filter((entry) => entry.seasonEps.length > 0);

      if (matched.length >= 2) {
        const coveredNums = new Set<number>();
        const sections = matched.map(({ g, seasonEps }, localIdx) => {
          for (const ep of seasonEps) coveredNums.add(ep.episode_number);
          const hasArcPrefix = /^\s*(arco|arc|saga|parte|part|vol\.?|volume)\b/i.test(g.name);
          const cleanTitle =
            primaryGroupKind === 'arcs' && !hasArcPrefix
              ? `Arco ${localIdx + 1} · ${g.name}`
              : g.name;
          return {
            id: g.id,
            title: cleanTitle,
            episodes: seasonEps,
          };
        });

        const leftover = rawEpisodes.filter((ep) => !coveredNums.has(ep.episode_number));
        if (leftover.length > 0) {
          sections.push({
            id: `extra-${selectedSeasonNumber}`,
            title: 'Demais episódios',
            episodes: leftover,
          });
        }

        return sections;
      }
    }

    // Fallback when season has no arcs/parts in TMDB:
    // If very long (>30 eps), split cleanly into collapsible blocks of 25
    if (rawEpisodes.length > 30) {
      const chunkSize = 25;
      const chunks: Array<{ id: string; title: string; episodes: TMDBEpisode[] }> = [];
      for (let i = 0; i < rawEpisodes.length; i += chunkSize) {
        const slice = rawEpisodes.slice(i, i + chunkSize);
        const startNum = slice[0]?.episode_number ?? i + 1;
        const endNum = slice[slice.length - 1]?.episode_number ?? i + slice.length;
        chunks.push({
          id: `block-${selectedSeasonNumber}-${i}`,
          title: `Parte ${chunks.length + 1} · Episódios ${startNum}–${endNum}`,
          episodes: slice,
        });
      }
      return chunks;
    }

    return [
      {
        id: 'flat-season',
        title: null as string | null,
        episodes: rawEpisodes,
      },
    ];
  }, [mediaType, seasonDetail, selectedSeasonNumber, primaryEpisodeGroup, primaryGroupKind]);

  // Automatically pick which arc(s)/part(s) start expanded for the selected season
  useEffect(() => {
    if (seasonSections.length === 0) {
      setExpandedSectionIds([]);
      return;
    }
    if (seasonSections.length === 1) {
      setExpandedSectionIds([seasonSections[0].id]);
      return;
    }

    const totalEps = seasonSections.reduce((acc, s) => acc + s.episodes.length, 0);
    // Short season with 2-3 clear arcs/parts (e.g., 20 + 12 + 13 eps): keep all visible and organized!
    if (seasonSections.length <= 3 && totalEps <= 50) {
      setExpandedSectionIds(seasonSections.map((s) => s.id));
      return;
    }

    // Long season with many arcs (e.g. Bleach S1 with 16 arcs): open the tracked arc or Arc 1
    const trackedSec =
      trackedHistoryEntry?.trackedSeason === selectedSeasonNumber &&
      trackedHistoryEntry?.trackedEpisode
        ? seasonSections.find((sec) =>
            sec.episodes.some((ep) => ep.episode_number === trackedHistoryEntry.trackedEpisode)
          )
        : undefined;

    setExpandedSectionIds([(trackedSec || seasonSections[0]).id]);
  }, [selectedSeasonNumber, seasonSections]);

  const handleShare = async () => {
    if (!detail) return;
    const mediaTitle = getMediaTitle(detail);
    const shareMessage = `🎬 Encontrei algo especial para você!\n\n🍿 ${mediaTitle}\n\nQue tal dar o play e aproveitar essa experiência?\n\n❤️ Assista agora na Love Flix:\nhttps://love-flix.vercel.app/`;

    try {
      if (navigator.share) {
        await navigator.share({
          text: shareMessage,
        });
      } else {
        await navigator.clipboard.writeText(shareMessage);
        pushToast('Mensagem copiada para a área de transferência', 'accent');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      try {
        await navigator.clipboard.writeText(shareMessage);
        pushToast('Mensagem copiada para a área de transferência', 'accent');
      } catch {
        // ignore
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-9 h-9 animate-spin text-[#E50914]" />
        <p className="text-xs sm:text-sm font-semibold text-[#A1A1A1]">
          Carregando ficha técnica completa...
        </p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-16 text-center max-w-lg mx-auto">
        <h2 className="font-display text-xl font-bold text-white mb-2">
          Conteúdo indisponível no momento
        </h2>
        <p className="text-sm text-[#A1A1A1] mb-6">{error}</p>
        <button
          type="button"
          onClick={() => navigateToPage('home')}
          className="px-5 py-2.5 rounded-xl bg-[#E50914] text-xs font-bold text-white cursor-pointer"
        >
          Voltar ao Início
        </button>
      </div>
    );
  }

  if (isCinemaExclusive) {
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-24 text-center max-w-md mx-auto">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <Clapperboard className="w-7 h-7" />
        </div>
        <h2 className="font-display text-xl sm:text-2xl font-bold text-white mb-2">
          Disponível somente nos cinemas
        </h2>
        <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed mb-6">
          Este filme ainda está em exibição somente nos cinemas e não está liberado para plataformas digitais.
          Ele entrará automaticamente no Love Flix assim que for lançado digitalmente e estiver disponível em nossos canais!
        </p>
        <button
          type="button"
          onClick={() => navigateToPage('movies')}
          className="px-6 py-3 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-xs sm:text-sm font-bold text-white transition-colors cursor-pointer shadow-lg"
        >
          Explorar filmes disponíveis
        </button>
      </div>
    );
  }

  const title = getMediaTitle(detail);
  const originalTitle = getOriginalMediaTitle(detail);
  const year = getMediaYear(detail);
  const releaseDateStr = formatReleaseDate(detail.release_date || detail.first_air_date);
  const rating = detail.vote_average ? detail.vote_average.toFixed(1) : null;
  const certification = extractCertification(detail);
  const duration =
    mediaType === 'movie'
      ? formatRuntime(detail.runtime)
      : detail.episode_run_time?.[0]
      ? `${detail.episode_run_time[0]} min/ep`
      : '';

  const directors =
    detail.credits?.crew?.filter((c) => c.job === 'Director') || [];
  const creators = detail.created_by || [];
  const cast = detail.credits?.cast?.slice(0, 18) || [];
  const youtubeVideos = (detail.videos?.results || []).filter(
    (v) => v.site === 'YouTube' && v.key
  );

  const inList = isInMyList(detail.id, mediaType);
  const fav = isFavorite(detail.id, mediaType);
  const watchedState = isWatched(detail.id, mediaType);

  const originCountries =
    detail.production_countries?.map((c) => c.name).join(', ') ||
    detail.origin_country?.join(', ') ||
    'Não informado';

  const originalLangName =
    detail.spoken_languages?.[0]?.name ||
    detail.spoken_languages?.[0]?.english_name ||
    detail.original_language?.toUpperCase() ||
    'Não informado';

  const regularSeasons =
    detail.seasons?.filter((s) => s.episode_count > 0) || [];

  const playLabel =
    trackedHistoryEntry?.trackedSeason && trackedHistoryEntry?.trackedEpisode
      ? `Continuar: T${trackedHistoryEntry.trackedSeason} · Ep. ${trackedHistoryEntry.trackedEpisode}`
      : trackedHistoryEntry
      ? 'Continuar Assistindo'
      : 'Assistir Agora';

  return (
    <div className="pb-28">
      {/* Top Cinematic Backdrop & Poster Header */}
      <section className="relative w-full overflow-hidden bg-[#080808] border-b border-white/[0.07]">
        <div className="absolute inset-0 h-full">
          <ResilientImage
            src={
              getBackdropUrl(detail.backdrop_path, 'original') ||
              getPosterUrl(detail.poster_path, 'w780')
            }
            alt={title}
            fallbackType="backdrop"
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/80 to-[#080808]/40" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#080808] via-[#080808]/75 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-6 pb-12">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#A1A1A1] hover:text-white mb-6 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-7 lg:gap-10 items-start">
            {/* Poster */}
            <div className="md:col-span-4 lg:col-span-3 max-w-[260px] mx-auto md:mx-0 w-full">
              <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden border border-white/15 shadow-2xl">
                <ResilientImage
                  src={getPosterUrl(detail.poster_path, 'w780')}
                  alt={title}
                  fallbackType="poster"
                  className="w-full h-full"
                />
              </div>
            </div>

            {/* Primary Metadata & Actions */}
            <div className="md:col-span-8 lg:col-span-9 space-y-5">
              <div>
                <p className="text-xs sm:text-sm font-bold text-[#FF253A] mb-1.5">
                  {getMediaTypeBadgeText(detail, mediaType)}
                  {detail.tagline ? ` · ${detail.tagline}` : ''}
                </p>

                <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight text-balance">
                  {title}
                </h1>

                {originalTitle !== title && (
                  <p className="text-xs sm:text-sm text-[#A1A1A1] mt-1.5">
                    Título original: <span className="text-white/90 font-semibold">{originalTitle}</span>
                  </p>
                )}
              </div>

              {/* Clean Unboxed Metadata Line */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs sm:text-sm font-semibold text-white/90 tabular-nums">
                {rating && Number(rating) > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    {rating}
                    {detail.vote_count ? (
                      <span className="text-xs text-[#A1A1A1] font-normal">
                        ({detail.vote_count.toLocaleString('pt-BR')} votos)
                      </span>
                    ) : null}
                  </span>
                )}
                {year && (
                  <>
                    <span className="text-white/30">·</span>
                    <span>{year}</span>
                  </>
                )}
                {certification && (
                  <>
                    <span className="text-white/30">·</span>
                    <span>{certification}</span>
                  </>
                )}
                {duration && (
                  <>
                    <span className="text-white/30">·</span>
                    <span>{duration}</span>
                  </>
                )}
                {mediaType === 'tv' && detail.number_of_seasons ? (
                  <>
                    <span className="text-white/30">·</span>
                    <span>
                      {detail.number_of_seasons}{' '}
                      {detail.number_of_seasons === 1 ? 'temporada' : 'temporadas'} (
                      {detail.number_of_episodes || 0} episódios)
                    </span>
                  </>
                ) : null}
              </div>

              {/* Cinema Exclusivity Notice for Theatrical Titles */}
              {isCinemaExclusive && (
                <div className="rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#1a150c] to-transparent border border-amber-500/30 p-4 sm:p-5 flex items-start gap-3.5 shadow-2xl">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400">
                    <Clapperboard className="w-5 h-5" />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Exclusivo nos Cinemas
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-white/95 leading-relaxed">
                      Este filme está atualmente em exibição exclusiva nos cinemas e ainda não foi liberado para plataformas digitais de streaming.
                    </p>
                    <p className="text-[11px] sm:text-xs text-[#A1A1A1] leading-relaxed">
                      Para assegurar a máxima qualidade de áudio e imagem (Full HD / 4K) sem gravações de cinema ou selos na tela, a Love Flix adicionará este título automaticamente assim que o lançamento oficial em plataformas digitais for disponibilizado.
                    </p>
                  </div>
                </div>
              )}

              {/* Primary Hero Actions (Big Play Button & Trailer) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                {isCinemaExclusive ? (
                  <>
                    {selectedVideo ? (
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById('trailer-section');
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth' });
                          }
                        }}
                        className="inline-flex items-center justify-center gap-3 w-full sm:w-auto sm:min-w-[210px] px-8 py-3.5 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-white text-sm sm:text-base font-extrabold shadow-xl shadow-[#E50914]/25 active:scale-[0.99] transition-all cursor-pointer min-h-[48px]"
                      >
                        <Film className="w-5 h-5 text-white shrink-0" />
                        <span>Assistir Trailer Oficial</span>
                      </button>
                    ) : null}

                    <div className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-xs sm:text-sm font-semibold text-[#A1A1A1] min-h-[48px]">
                      <Clapperboard className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Aguardando lançamento digital em alta definição</span>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const resolvedImdb =
                          detail.imdb_id || detail.external_ids?.imdb_id || null;
                        const activeSeason =
                          mediaType === 'tv'
                            ? trackedHistoryEntry?.trackedSeason || selectedSeasonNumber || 1
                            : undefined;
                        const activeEpisode =
                          mediaType === 'tv'
                            ? trackedHistoryEntry?.trackedEpisode || 1
                            : undefined;

                        openWatchModal({
                          mediaType,
                          id: detail.id,
                          title,
                          imdbId: resolvedImdb,
                          season: activeSeason,
                          episode: activeEpisode,
                          episodeTitle:
                            mediaType === 'tv'
                              ? trackedHistoryEntry?.trackedEpisodeTitle
                              : undefined,
                          item: detail,
                        });
                      }}
                      className="inline-flex items-center justify-center gap-3 w-full sm:w-auto sm:min-w-[210px] px-8 py-3.5 rounded-xl bg-white hover:bg-white/90 text-black text-sm sm:text-base font-extrabold shadow-xl shadow-white/5 active:scale-[0.99] transition-all cursor-pointer min-h-[48px]"
                    >
                      <Play className="w-5 h-5 fill-black text-black shrink-0" />
                      <span className="truncate">{playLabel}</span>
                    </button>

                    {selectedVideo && (
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById('trailer-section');
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth' });
                          }
                        }}
                        className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-sm font-bold border border-white/12 transition-all cursor-pointer min-h-[48px] active:scale-[0.99]"
                      >
                        <Film className="w-4 h-4 text-[#FF253A] shrink-0" />
                        <span>Assistir Trailer</span>
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Complete Synopsis & Genres */}
              <div className="max-w-3xl space-y-3">
                {detail.genres && detail.genres.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {detail.genres.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() =>
                          navigateToPage(mediaType === 'tv' ? 'series' : 'movies', {
                            genreId: String(g.id),
                            genreName: g.name,
                          })
                        }
                        className="px-3 py-1 rounded-lg bg-white/[0.07] hover:bg-[#E50914] text-xs font-semibold text-white transition-colors cursor-pointer"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                )}

                <p className="text-sm sm:text-base text-white/85 leading-relaxed">
                  {detail.overview || 'Sinopse em português ainda não disponibilizada pela TMDB para este título.'}
                </p>

                {/* Cast & Crew Line Summary (Netflix Clean Style) */}
                {cast.length > 0 && (
                  <p className="text-xs text-[#A1A1A1] leading-relaxed">
                    <span className="font-semibold text-white/90">Estrelando: </span>
                    {cast.slice(0, 5).map((c) => c.name).join(', ')}
                    {cast.length > 5 ? '... mais' : ''}
                  </p>
                )}
                {(directors.length > 0 || creators.length > 0) && (
                  <p className="text-xs text-[#A1A1A1] leading-relaxed">
                    <span className="font-semibold text-white/90">
                      {mediaType === 'movie' ? 'Direção: ' : 'Criação: '}
                    </span>
                    {(mediaType === 'movie' ? directors : creators).slice(0, 3).map((p) => p.name).join(', ')}
                  </p>
                )}
              </div>

              {/* Structured Action Bar (4 Balanced Columns, Never Wraps) */}
              <div className="grid grid-cols-4 gap-1.5 sm:gap-3 py-2 max-w-sm sm:max-w-md w-full border-t border-b border-white/[0.08]">
                {/* Minha Lista */}
                <button
                  type="button"
                  onClick={() => toggleMyList(detail)}
                  className="group flex flex-col items-center justify-center py-2 px-1 rounded-xl hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer min-h-[56px]"
                  title={inList ? 'Remover da minha lista' : 'Adicionar à minha lista'}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center transition-colors">
                    {inList ? (
                      <Check className="w-5 h-5 text-white" />
                    ) : (
                      <Plus className="w-5 h-5 text-white/90 group-hover:text-white" />
                    )}
                  </div>
                  <span
                    className={`text-[11px] font-semibold tracking-tight text-center truncate max-w-full ${
                      inList ? 'text-white' : 'text-[#A1A1A1] group-hover:text-white'
                    }`}
                  >
                    {inList ? 'Na lista' : 'Minha lista'}
                  </span>
                </button>

                {/* Favoritar */}
                <button
                  type="button"
                  onClick={() => toggleFavorite(detail)}
                  className="group flex flex-col items-center justify-center py-2 px-1 rounded-xl hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer min-h-[56px]"
                  title={fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center transition-colors">
                    <Heart
                      className={`w-5 h-5 transition-colors ${
                        fav ? 'fill-white text-white' : 'text-white/90 group-hover:text-white'
                      }`}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-semibold tracking-tight text-center truncate max-w-full ${
                      fav ? 'text-white' : 'text-[#A1A1A1] group-hover:text-white'
                    }`}
                  >
                    {fav ? 'Favorito' : 'Favoritar'}
                  </span>
                </button>

                {/* Assistido */}
                <button
                  type="button"
                  onClick={() => toggleWatched(detail)}
                  className="group flex flex-col items-center justify-center py-2 px-1 rounded-xl hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer min-h-[56px]"
                  title={watchedState ? 'Marcar como não assistido' : 'Marcar como assistido'}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center transition-colors">
                    <CheckCircle2
                      className={`w-5 h-5 transition-colors ${
                        watchedState ? 'fill-white/20 text-white' : 'text-white/90 group-hover:text-white'
                      }`}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-semibold tracking-tight text-center truncate max-w-full ${
                      watchedState ? 'text-white' : 'text-[#A1A1A1] group-hover:text-white'
                    }`}
                  >
                    {watchedState ? 'Assistido' : 'Assistido'}
                  </span>
                </button>

                {/* Compartilhar */}
                <button
                  type="button"
                  onClick={handleShare}
                  className="group flex flex-col items-center justify-center py-2 px-1 rounded-xl hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer min-h-[56px]"
                  title="Compartilhar"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center transition-colors">
                    <Share2 className="w-5 h-5 text-white/90 group-hover:text-white" />
                  </div>
                  <span className="text-[11px] font-semibold tracking-tight text-[#A1A1A1] group-hover:text-white text-center truncate max-w-full">
                    Compartilhar
                  </span>
                </button>
              </div>

              {/* Structured Technical Specifications Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-white/[0.08] text-xs">
                <div>
                  <span className="block text-[#A1A1A1] mb-0.5">Lançamento</span>
                  <span className="font-semibold text-white tabular-nums">{releaseDateStr}</span>
                </div>
                <div>
                  <span className="block text-[#A1A1A1] mb-0.5">País de origem</span>
                  <span className="font-semibold text-white">{originCountries}</span>
                </div>
                <div>
                  <span className="block text-[#A1A1A1] mb-0.5">Idioma original</span>
                  <span className="font-semibold text-white">{originalLangName}</span>
                </div>
                <div>
                  <span className="block text-[#A1A1A1] mb-0.5">
                    {mediaType === 'movie' ? 'Direção' : 'Criação'}
                  </span>
                  <div className="font-semibold text-white flex flex-wrap gap-1">
                    {mediaType === 'movie' && directors.length > 0 ? (
                      directors.map((d, i) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => openPersonDetail(d.id)}
                          className="hover:text-[#FF253A] underline decoration-white/25 cursor-pointer text-left"
                        >
                          {d.name}
                          {i < directors.length - 1 ? ',' : ''}
                        </button>
                      ))
                    ) : mediaType === 'tv' && creators.length > 0 ? (
                      creators.map((c, i) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => openPersonDetail(c.id)}
                          className="hover:text-[#FF253A] underline decoration-white/25 cursor-pointer text-left"
                        >
                          {c.name}
                          {i < creators.length - 1 ? ',' : ''}
                        </button>
                      ))
                    ) : (
                      <span>Não creditado</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Production Companies */}
              {detail.production_companies && detail.production_companies.length > 0 && (
                <div className="text-xs text-[#A1A1A1]">
                  <span>Produtoras: </span>
                  <span className="text-white/85 font-medium">
                    {detail.production_companies.map((p) => p.name).join(' · ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 space-y-12 mt-10">
        {/* Movie Franchise & Sequels Inline Explorer */}
        {detail.belongs_to_collection && (
          <section className="rounded-2xl overflow-hidden bg-[#121212] border border-white/10 p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#E50914]/15 border border-[#E50914]/25 flex items-center justify-center text-[#FF253A] shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#FF253A]">
                    Sequência da Franquia
                    {collectionDetail?.parts?.length
                      ? ` · ${collectionDetail.parts.length} filmes em ordem`
                      : ''}
                  </p>
                  <h3 className="font-display text-base sm:text-lg font-bold text-white truncate">
                    {collectionDetail?.name || detail.belongs_to_collection.name}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openCollectionDetail(detail.belongs_to_collection!.id)}
                className="px-4 py-2 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-xs font-bold text-white transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto"
              >
                Ver coleção completa
              </button>
            </div>

            {collectionDetail?.parts && collectionDetail.parts.length > 0 && (
              <div className="flex gap-3 sm:gap-3.5 overflow-x-auto no-scrollbar pb-1 pt-1">
                {collectionDetail.parts.map((part, idx) => {
                  const isCurrent = part.id === detail.id;
                  const partTitle = getMediaTitle(part);
                  const partYear = getMediaYear(part);

                  return (
                    <button
                      key={part.id}
                      type="button"
                      onClick={() => {
                        if (!isCurrent) {
                          openMediaDetail({ ...part, media_type: 'movie' });
                        }
                      }}
                      className={`group w-28 sm:w-36 shrink-0 text-left rounded-xl transition-all focus-visible:outline-none ${
                        isCurrent ? 'cursor-default' : 'cursor-pointer'
                      }`}
                    >
                      <div
                        className={`relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-[#181818] border transition-all ${
                          isCurrent
                            ? 'border-[#E50914] ring-2 ring-[#E50914]/40 shadow-lg shadow-[#E50914]/15'
                            : 'border-white/[0.09] group-hover:border-[#E50914]/70'
                        }`}
                      >
                        <ResilientImage
                          src={getPosterUrl(part.poster_path, 'w342')}
                          alt={partTitle}
                          fallbackType="poster"
                          className={`w-full h-full transition-transform duration-200 ${
                            isCurrent ? '' : 'group-hover:scale-105'
                          }`}
                        />
                        <div className="absolute inset-x-0 top-0 p-1.5 flex items-center justify-between gap-1 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold tracking-tight ${
                              isCurrent
                                ? 'bg-[#E50914] text-white'
                                : 'bg-black/80 text-white/95 border border-white/15'
                            }`}
                          >
                            Parte {idx + 1}
                          </span>
                          {partYear && (
                            <span className="text-[10px] font-semibold text-white/85 tabular-nums bg-black/70 px-1.5 py-0.5 rounded">
                              {partYear}
                            </span>
                          )}
                        </div>
                        {isCurrent && (
                          <span className="absolute bottom-1.5 inset-x-1.5 text-center py-0.5 rounded bg-[#E50914]/95 text-[10px] font-extrabold text-white shadow">
                            Você está aqui
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-xs font-bold line-clamp-2 mt-1.5 leading-snug ${
                          isCurrent
                            ? 'text-[#FF253A]'
                            : 'text-white/90 group-hover:text-white'
                        }`}
                      >
                        {partTitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Embedded Official Trailer Section */}
        {selectedVideo && (
          <section id="trailer-section" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                  Trailer & Vídeos Oficiais
                </h2>
                <p className="text-xs text-[#A1A1A1] mt-0.5">{selectedVideo.name}</p>
              </div>

              {youtubeVideos.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  {youtubeVideos.slice(0, 4).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVideo(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                        selectedVideo.id === v.id
                          ? 'bg-[#E50914] text-white'
                          : 'bg-[#141414] text-[#A1A1A1] hover:text-white border border-white/10'
                      }`}
                    >
                      {v.type}: {v.name.slice(0, 26)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedVideo?.key && (
              <div className="aspect-video w-full max-w-4xl rounded-2xl overflow-hidden bg-black border border-white/10 shadow-xl">
                <iframe
                  key={selectedVideo.key}
                  src={`https://www.youtube-nocookie.com/embed/${selectedVideo.key}?rel=0`}
                  title={selectedVideo.name}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </section>
        )}

        {/* TV Series / Anime / Dorama Netflix-Inspired Episodes & Integrated Arcs Explorer */}
        {mediaType === 'tv' && regularSeasons.length > 0 && (() => {
          const activeSeasonMeta =
            regularSeasons.find((s) => s.season_number === selectedSeasonNumber) ||
            regularSeasons[0];

          const toggleSection = (sectionId: string) => {
            setExpandedSectionIds((prev) => {
              const isOpen = prev.includes(sectionId);
              if (seasonSections.length > 3) {
                return isOpen ? [] : [sectionId];
              }
              return isOpen ? prev.filter((x) => x !== sectionId) : [...prev, sectionId];
            });
          };

          const renderEpisodeRow = (ep: TMDBEpisode) => {
            const isTrackedEp =
              trackedHistoryEntry?.trackedSeason === ep.season_number &&
              trackedHistoryEntry?.trackedEpisode === ep.episode_number;

            return (
              <div
                key={`${ep.id}-${ep.season_number}-${ep.episode_number}`}
                onClick={() =>
                  openWatchModal({
                    mediaType: 'tv',
                    id: detail.id,
                    title,
                    imdbId: detail.imdb_id || detail.external_ids?.imdb_id || null,
                    season: ep.season_number,
                    episode: ep.episode_number,
                    episodeTitle: ep.name,
                    item: detail,
                  })
                }
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openWatchModal({
                      mediaType: 'tv',
                      id: detail.id,
                      title,
                      imdbId: detail.imdb_id || detail.external_ids?.imdb_id || null,
                      season: ep.season_number,
                      episode: ep.episode_number,
                      episodeTitle: ep.name,
                      item: detail,
                    });
                  }
                }}
                className={`group p-3 sm:p-4 flex flex-row items-center gap-3 sm:gap-4 transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-white/[0.04] ${
                  isTrackedEp
                    ? 'bg-[#E50914]/[0.07] border-l-2 border-l-[#E50914]'
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                {/* Netflix-Style Clean Thumbnail with Play Circle */}
                <div className="w-[116px] sm:w-40 aspect-video rounded-lg overflow-hidden bg-[#181818] shrink-0 relative">
                  <ResilientImage
                    src={getStillUrl(ep.still_path, 'w500')}
                    alt={ep.name}
                    fallbackType="backdrop"
                    className="w-full h-full group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/25 group-hover:bg-black/45 transition-colors flex items-center justify-center">
                    <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/65 border border-white/75 text-white flex items-center justify-center shadow-lg group-hover:bg-[#E50914] group-hover:border-[#E50914] transition-colors">
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </span>
                  </div>
                </div>

                {/* Clean Episode Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-1 sm:line-clamp-2 group-hover:text-white/95">
                        {ep.episode_number}. {ep.name}
                      </h3>
                      {(ep.runtime || isTrackedEp) && (
                        <div className="flex items-center gap-2 text-[11px] text-[#A1A1A1] mt-0.5 tabular-nums">
                          {ep.runtime ? <span>{ep.runtime} min</span> : null}
                          {isTrackedEp && (
                            <span className="text-[#FF253A] font-semibold">· Onde parei</span>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        recordHistoryVisit(detail, 'continuing', {
                          season: ep.season_number,
                          episode: ep.episode_number,
                          title: ep.name,
                        });
                      }}
                      title={isTrackedEp ? 'Marcado onde parei' : 'Marcar onde parei'}
                      aria-label={isTrackedEp ? 'Marcado onde parei' : 'Marcar onde parei'}
                      className={`p-1.5 rounded-lg shrink-0 transition-colors cursor-pointer ${
                        isTrackedEp
                          ? 'text-[#FF253A] bg-[#E50914]/15'
                          : 'text-[#A1A1A1]/70 hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      <Bookmark
                        className={`w-3.5 h-3.5 ${isTrackedEp ? 'fill-current' : ''}`}
                      />
                    </button>
                  </div>

                  <p className="text-[11px] sm:text-xs text-[#A1A1A1] mt-1 leading-snug line-clamp-2">
                    {ep.overview || 'Sinopse deste episódio não informada.'}
                  </p>
                </div>
              </div>
            );
          };

          return (
            <section className="space-y-4">
              {/* Simple Netflix-Inspired Header + Single Season Dropdown */}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                    Episódios
                  </h2>
                  {trackedHistoryEntry?.trackedSeason && trackedHistoryEntry?.trackedEpisode && (
                    <p className="text-[11px] sm:text-xs text-[#FF253A] font-semibold mt-0.5 tabular-nums">
                      Continuar de T{trackedHistoryEntry.trackedSeason} · Ep.{' '}
                      {trackedHistoryEntry.trackedEpisode}
                    </p>
                  )}
                </div>

                {/* Single Clean Season Selector Dropdown */}
                <div className="relative shrink-0" ref={seasonDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      if (regularSeasons.length > 1) {
                        setSeasonMenuOpen((prev) => !prev);
                      }
                    }}
                    disabled={regularSeasons.length <= 1}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#161616] border border-white/15 text-xs sm:text-sm font-bold text-white transition-colors ${
                      regularSeasons.length > 1
                        ? 'hover:bg-[#1f1f1f] cursor-pointer'
                        : 'cursor-default opacity-90'
                    }`}
                  >
                    <span>{activeSeasonMeta?.name || `Temporada ${selectedSeasonNumber}`}</span>
                    {regularSeasons.length > 1 && (
                      <ChevronDown
                        className={`w-4 h-4 text-[#A1A1A1] transition-transform ${
                          seasonMenuOpen ? 'rotate-180 text-white' : ''
                        }`}
                      />
                    )}
                  </button>

                  {seasonMenuOpen && regularSeasons.length > 1 && (
                    <div className="absolute right-0 mt-2 w-60 max-h-72 overflow-y-auto rounded-xl bg-[#161616] border border-white/15 shadow-2xl py-1.5 z-30">
                      {regularSeasons.map((s) => {
                        const isActive = s.season_number === selectedSeasonNumber;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSelectedSeasonNumber(s.season_number);
                              setSeasonMenuOpen(false);
                            }}
                            className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left text-xs sm:text-sm transition-colors cursor-pointer ${
                              isActive
                                ? 'bg-[#E50914]/15 text-white font-bold'
                                : 'text-[#A1A1A1] hover:bg-white/[0.06] hover:text-white font-medium'
                            }`}
                          >
                            <span className="truncate">{s.name}</span>
                            <span className="text-[11px] text-[#A1A1A1] shrink-0 tabular-nums">
                              {s.episode_count} eps
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {seasonLoading ? (
                <div className="space-y-2.5">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-24 rounded-xl bg-[#141414] animate-pulse border border-white/[0.05]"
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {seasonDetail?.overview && (
                    <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed max-w-3xl">
                      {seasonDetail.overview}
                    </p>
                  )}

                  {seasonSections.length === 1 && seasonSections[0].title === null ? (
                    <div className="divide-y divide-white/[0.07] rounded-2xl bg-[#121212] border border-white/[0.08] overflow-hidden">
                      {seasonSections[0].episodes.map((ep) => renderEpisodeRow(ep))}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {seasonSections.map((sec) => {
                        const isOpen = expandedSectionIds.includes(sec.id);
                        const hasTrackedInside = Boolean(
                          trackedHistoryEntry?.trackedSeason === selectedSeasonNumber &&
                            trackedHistoryEntry?.trackedEpisode &&
                            sec.episodes.some(
                              (ep) => ep.episode_number === trackedHistoryEntry.trackedEpisode
                            )
                        );

                        return (
                          <div
                            key={sec.id}
                            className="rounded-2xl bg-[#121212] border border-white/[0.08] overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => toggleSection(sec.id)}
                              className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {hasTrackedInside && (
                                  <span
                                    className="w-2 h-2 rounded-full bg-[#E50914] shrink-0"
                                    title="Onde você parou"
                                  />
                                )}
                                <span className="text-xs sm:text-sm font-bold text-white truncate">
                                  {sec.title}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 text-[11px] sm:text-xs text-[#A1A1A1] tabular-nums">
                                <span>{sec.episodes.length} eps</span>
                                <ChevronDown
                                  className={`w-4 h-4 transition-transform ${
                                    isOpen ? 'rotate-180 text-white' : ''
                                  }`}
                                />
                              </div>
                            </button>

                            {isOpen && (
                              <div className="divide-y divide-white/[0.06] border-t border-white/[0.07]">
                                {sec.episodes.map((ep) => renderEpisodeRow(ep))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })()}

        {/* Elenco Principal */}
        {cast.length > 0 && (
          <section className="space-y-4">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Elenco Principal
            </h2>
            <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-2">
              {cast.map((actor) => (
                <button
                  key={`${actor.id}-${actor.character}`}
                  type="button"
                  onClick={() => openPersonDetail(actor.id)}
                  className="group w-32 sm:w-36 shrink-0 text-left cursor-pointer focus-visible:outline-none"
                >
                  <div className="aspect-[2/3] w-full rounded-xl overflow-hidden bg-[#141414] border border-white/[0.08] group-hover:border-[#E50914]/60 transition-colors">
                    <ResilientImage
                      src={getProfileUrl(actor.profile_path, 'h632')}
                      alt={actor.name}
                      fallbackType="avatar"
                      className="w-full h-full group-hover:scale-105 transition-transform duration-200"
                    />
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-white truncate mt-2 group-hover:text-[#FF253A]">
                    {actor.name}
                  </p>
                  <p className="text-[11px] text-[#A1A1A1] truncate">{actor.character}</p>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Related Recommendations & Similar Content Carousels */}
      <div className="mt-10 space-y-1">
        {detail.recommendations?.results && detail.recommendations.results.length > 0 && (
          <MediaCarousel
            title="Recomendações relacionadas"
            items={detail.recommendations.results}
          />
        )}

        {detail.similar?.results && detail.similar.results.length > 0 && (
          <MediaCarousel
            title={mediaType === 'tv' ? 'Séries semelhantes' : 'Filmes semelhantes'}
            items={detail.similar.results}
          />
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 2. PERSON / ARTIST BIOGRAPHY & FILMOGRAPHY PAGE
// ============================================================================
export const PersonDetailPage: React.FC<{ personId: number }> = ({ personId }) => {
  const [person, setPerson] = useState<TMDBPersonDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    tmdbService
      .getPersonDetails(personId)
      .then((res) => {
        if (!cancelled) setPerson(res);
      })
      .catch(() => {
        if (!cancelled) setPerson(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#E50914]" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="p-12 text-center">
        <p className="text-base font-bold text-white">Perfil de artista não encontrado.</p>
      </div>
    );
  }

  const creditsMap = new Map<string, NonNullable<TMDBPersonDetail['combined_credits']>['cast'][number]>();
  for (const item of [
    ...(person.combined_credits?.cast || []),
    ...(person.combined_credits?.crew || []),
  ]) {
    if (item.media_type !== 'movie' && item.media_type !== 'tv') continue;
    const key = `${item.media_type}-${item.id}`;
    if (!creditsMap.has(key)) creditsMap.set(key, item);
  }

  const sortedWorks = Array.from(creditsMap.values()).sort(
    (a, b) => (b.popularity || 0) - (a.popularity || 0)
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-10">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#A1A1A1] hover:text-white cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Voltar</span>
      </button>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        <div className="md:col-span-4 lg:col-span-3 max-w-[240px]">
          <div className="aspect-[2/3] rounded-2xl overflow-hidden border border-white/15 bg-[#121212]">
            <ResilientImage
              src={getProfileUrl(person.profile_path, 'h632')}
              alt={person.name}
              fallbackType="avatar"
              className="w-full h-full"
            />
          </div>
        </div>

        <div className="md:col-span-8 lg:col-span-9 space-y-4">
          <p className="text-xs font-bold text-[#FF253A]">
            {person.known_for_department || 'Artista'}
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            {person.name}
          </h1>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-[#A1A1A1] tabular-nums">
            {person.birthday && (
              <span>Nascimento: {formatReleaseDate(person.birthday)}</span>
            )}
            {person.place_of_birth && <span>· {person.place_of_birth}</span>}
          </div>

          <p className="text-sm sm:text-base text-white/80 leading-relaxed whitespace-pre-line max-w-3xl">
            {person.biography || 'Biografia detalhada não cadastrada na TMDB.'}
          </p>
        </div>
      </div>

      {sortedWorks.length > 0 && (
        <section>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-white mb-5">
            Filmografia & Participações ({sortedWorks.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
            {sortedWorks.slice(0, 36).map((work) => (
              <MediaCard key={`${work.media_type}-${work.id}`} item={work} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

// ============================================================================
// 3. COLLECTION / FRANCHISE PAGE
// ============================================================================
export const CollectionDetailPage: React.FC<{ collectionId: number }> = ({
  collectionId,
}) => {
  const [collection, setCollection] = useState<TMDBCollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    tmdbService
      .getCollectionDetails(collectionId)
      .then((res) => {
        if (!cancelled) setCollection(res);
      })
      .catch(() => {
        if (!cancelled) setCollection(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#E50914]" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="p-12 text-center">
        <p className="text-base font-bold text-white">Coleção não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="pb-28">
      <div className="relative py-16 px-4 sm:px-6 lg:px-10 bg-[#101010] border-b border-white/[0.08] overflow-hidden">
        <div className="absolute inset-0">
          <ResilientImage
            src={getBackdropUrl(collection.backdrop_path, 'original')}
            alt={collection.name}
            fallbackType="backdrop"
            className="w-full h-full opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/75 to-black/40" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#A1A1A1] hover:text-white mb-6 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>

          <p className="text-xs font-bold text-[#FF253A] mb-1">
            Franquia Cinematográfica · {collection.parts.length} filmes
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-white tracking-tight mb-3">
            {collection.name}
          </h1>
          {collection.overview && (
            <p className="text-sm sm:text-base text-white/80 max-w-3xl leading-relaxed">
              {collection.overview}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 mt-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {collection.parts.map((movie, idx) => (
            <MediaCard
              key={movie.id}
              item={movie}
              rankNumber={idx + 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
