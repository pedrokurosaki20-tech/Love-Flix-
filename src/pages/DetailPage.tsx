import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Check,
  CheckCircle2,
  Film,
  Heart,
  Layers,
  Loader2,
  Play,
  Plus,
  Share2,
  Star,
  Tv,
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
  pickBestTrailer,
  tmdbService,
} from '../services/tmdb';
import type {
  TMDBCollectionDetail,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVideo, setSelectedVideo] = useState<TMDBVideo | null>(null);

  // TV Seasons & Episodes State
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(1);
  const [seasonDetail, setSeasonDetail] = useState<TMDBSeasonDetail | null>(null);
  const [seasonLoading, setSeasonLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setSeasonDetail(null);

    (async () => {
      try {
        const data =
          mediaType === 'tv'
            ? await tmdbService.getTVDetails(id)
            : await tmdbService.getMovieDetails(id);

        if (cancelled) return;
        setDetail(data);
        recordHistoryVisit(data, 'viewed');

        const ytVideos = (data.videos?.results || []).filter(
          (v) => v.site === 'YouTube' && v.key
        );
        setSelectedVideo(pickBestTrailer(ytVideos));

        if (mediaType === 'tv' && data.seasons && data.seasons.length > 0) {
          const firstRegular =
            data.seasons.find((s) => s.season_number > 0) || data.seasons[0];
          setSelectedSeasonNumber(firstRegular.season_number);
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

  const trackedHistoryEntry = useMemo(
    () => history.find((h) => h.id === id && h.media_type === mediaType),
    [history, id, mediaType]
  );

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
    <div className="pb-14">
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

              {/* Primary Hero Actions (Big Play Button & Trailer) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
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
        {/* Franchise Banner (if part of a Movie Collection) */}
        {detail.belongs_to_collection && (
          <div className="rounded-2xl overflow-hidden bg-[#121212] border border-white/10 p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#E50914]/15 flex items-center justify-center text-[#FF253A] shrink-0">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#FF253A]">Parte de uma Franquia</p>
                <h3 className="font-display text-lg font-bold text-white">
                  {detail.belongs_to_collection.name}
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openCollectionDetail(detail.belongs_to_collection!.id)}
              className="px-5 py-2.5 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-xs font-bold text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              Ver coleção completa
            </button>
          </div>
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
          </section>
        )}

        {/* TV Series / Anime / Dorama Seasons & Episodes Explorer */}
        {mediaType === 'tv' && regularSeasons.length > 0 && (
          <section className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[#FF253A] text-xs font-bold mb-1">
                  <Tv className="w-4 h-4" />
                  <span>Guia de Episódios</span>
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                  Temporadas & Episódios
                </h2>
              </div>

              {trackedHistoryEntry?.trackedSeason && trackedHistoryEntry?.trackedEpisode && (
                <p className="text-xs font-mono tabular-nums text-[#FF253A]">
                  Acompanhando: T{trackedHistoryEntry.trackedSeason} · Ep.{' '}
                  {trackedHistoryEntry.trackedEpisode}
                </p>
              )}
            </div>

            {/* Season Selector Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {regularSeasons.map((s) => {
                const active = s.season_number === selectedSeasonNumber;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSeasonNumber(s.season_number)}
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#E50914] text-white'
                        : 'bg-[#141414] hover:bg-[#1e1e1e] text-[#A1A1A1] hover:text-white border border-white/[0.08]'
                    }`}
                  >
                    {s.name} ({s.episode_count})
                  </button>
                );
              })}
            </div>

            {seasonLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-28 rounded-2xl bg-[#141414] animate-pulse border border-white/[0.05]"
                  />
                ))}
              </div>
            ) : seasonDetail ? (
              <div className="space-y-4">
                {seasonDetail.overview && (
                  <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed max-w-3xl">
                    {seasonDetail.overview}
                  </p>
                )}

                <div className="divide-y divide-white/[0.07] rounded-2xl bg-[#121212] border border-white/[0.08] overflow-hidden">
                  {(seasonDetail.episodes || []).map((ep) => {
                    const isTrackedEp =
                      trackedHistoryEntry?.trackedSeason === ep.season_number &&
                      trackedHistoryEntry?.trackedEpisode === ep.episode_number;

                    return (
                      <div
                        key={ep.id}
                        className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 hover:bg-white/[0.02] transition-colors"
                      >
                        <button
                          type="button"
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
                          aria-label={`Assistir T${ep.season_number} Ep. ${ep.episode_number}: ${ep.name}`}
                          className="group w-full sm:w-48 aspect-video rounded-xl overflow-hidden bg-[#181818] shrink-0 relative cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914]"
                        >
                          <ResilientImage
                            src={getStillUrl(ep.still_path, 'w500')}
                            alt={ep.name}
                            fallbackType="backdrop"
                            className="w-full h-full group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="w-10 h-10 rounded-full bg-[#E50914] text-white flex items-center justify-center shadow-lg">
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            </span>
                          </div>
                          <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 font-mono text-[11px] font-bold text-white tabular-nums">
                            Ep. {String(ep.episode_number).padStart(2, '0')}
                          </span>
                        </button>

                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <h3 className="text-sm sm:text-base font-bold text-white">
                                {ep.episode_number}. {ep.name}
                              </h3>
                              <div className="flex items-center gap-2 text-xs text-[#A1A1A1] tabular-nums shrink-0">
                                {ep.vote_average > 0 && (
                                  <span className="inline-flex items-center gap-0.5 text-amber-400 font-semibold">
                                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                    {ep.vote_average.toFixed(1)}
                                  </span>
                                )}
                                {ep.runtime ? <span>· {ep.runtime} min</span> : null}
                                {ep.air_date ? (
                                  <span>· {formatReleaseDate(ep.air_date)}</span>
                                ) : null}
                              </div>
                            </div>

                            <p className="text-xs sm:text-sm text-[#A1A1A1] mt-1.5 leading-relaxed line-clamp-3">
                              {ep.overview || 'Descrição deste episódio não informada na TMDB.'}
                            </p>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
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
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E50914] hover:bg-[#FF253A] text-white text-xs font-bold transition-colors cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Assistir</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                recordHistoryVisit(detail, 'continuing', {
                                  season: ep.season_number,
                                  episode: ep.episode_number,
                                  title: ep.name,
                                });
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                isTrackedEp
                                  ? 'bg-white/15 border border-white/30 text-white font-bold'
                                  : 'bg-[#1a1a1a] hover:bg-[#242424] text-[#A1A1A1] hover:text-white border border-white/10'
                              }`}
                            >
                              {isTrackedEp
                                ? 'Episódio atual marcado'
                                : 'Marcar parada neste episódio'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        )}

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
    <div className="pb-12">
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
