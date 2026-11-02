import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  Tv,
  X,
} from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';
import { tmdbService } from '../services/tmdb';

const CHANNELS: Array<{ id: 1 | 2 | 3; label: string }> = [
  { id: 1, label: 'Canal 1' },
  { id: 2, label: 'Canal 2' },
  { id: 3, label: 'Canal 3' },
];

export const StreamingPlayerModal: React.FC = () => {
  const {
    watchRequest,
    closeWatchModal,
    activePlayer,
    startPlayerSession,
    switchPlayerChannel,
    updateActivePlayerImdb,
    closePlayerSession,
  } = useNavigation();

  const [prefetchedImdb, setPrefetchedImdb] = useState<string | null>(null);
  const [resolvingImdb, setResolvingImdb] = useState(false);
  const [imdbLookupFailed, setImdbLookupFailed] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);

  const playerScreenRef = useRef<HTMLDivElement | null>(null);

  // Prefetch IMDb ID immediately as soon as the 3-channel card opens
  useEffect(() => {
    if (!watchRequest) {
      setPrefetchedImdb(null);
      setResolvingImdb(false);
      setImdbLookupFailed(false);
      return;
    }

    if (watchRequest.imdbId && /^tt\d+/i.test(watchRequest.imdbId)) {
      setPrefetchedImdb(watchRequest.imdbId);
      setResolvingImdb(false);
      setImdbLookupFailed(false);
      return;
    }

    let cancelled = false;
    setPrefetchedImdb(null);
    setResolvingImdb(true);
    setImdbLookupFailed(false);

    tmdbService
      .getImdbId(watchRequest.mediaType, watchRequest.id)
      .then((found) => {
        if (cancelled) return;
        setPrefetchedImdb(found);
        setImdbLookupFailed(!found);
      })
      .catch(() => {
        if (!cancelled) {
          setPrefetchedImdb(null);
          setImdbLookupFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setResolvingImdb(false);
      });

    return () => {
      cancelled = true;
    };
  }, [watchRequest]);

  // Pre-warm Canal 1 HLS stream in background while the user chooses a channel
  useEffect(() => {
    if (!watchRequest || !prefetchedImdb) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      type: watchRequest.mediaType === 'tv' ? 'tvshow' : 'movie',
      imdb: prefetchedImdb,
      tmdbId: String(watchRequest.id),
      channel: '1',
    });
    if (watchRequest.mediaType === 'tv') {
      params.set('season', String(watchRequest.season || 1));
      params.set('episode', String(watchRequest.episode || 1));
    }
    fetch(`/api/supercdn/stream?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
    }).catch(() => {});
    return () => controller.abort();
  }, [watchRequest, prefetchedImdb]);

  // If the user clicked a channel before IMDb prefetch finished, finish resolving inside the fullscreen player
  useEffect(() => {
    if (!activePlayer || activePlayer.imdbId) return;

    let cancelled = false;
    setImdbLookupFailed(false);

    tmdbService
      .getImdbId(activePlayer.mediaType, activePlayer.id)
      .then((found) => {
        if (cancelled) return;
        if (found) {
          updateActivePlayerImdb(found);
        } else {
          setImdbLookupFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setImdbLookupFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [activePlayer, updateActivePlayerImdb]);

  // Track iframe loading spinner whenever channel or title changes
  useEffect(() => {
    if (activePlayer?.imdbId) {
      setIframeLoading(true);
    } else {
      setIframeLoading(false);
    }
  }, [
    activePlayer?.imdbId,
    activePlayer?.channel,
    activePlayer?.season,
    activePlayer?.episode,
  ]);

  // Track browser native fullscreen changes and body scroll lock
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!watchRequest && !activePlayer) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [watchRequest, activePlayer]);

  // Close Channel Card on Escape (when not in active fullscreen player)
  useEffect(() => {
    if (!watchRequest || activePlayer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWatchModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [watchRequest, activePlayer, closeWatchModal]);

  const enterFullscreenElement = (el: HTMLElement | null) => {
    if (!el) return;
    const target = el as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    try {
      if (typeof target.requestFullscreen === 'function') {
        target.requestFullscreen().catch(() => {});
      } else if (typeof target.webkitRequestFullscreen === 'function') {
        target.webkitRequestFullscreen();
      } else if (typeof target.msRequestFullscreen === 'function') {
        target.msRequestFullscreen();
      }
    } catch {
      // Fallback remains 100vw x 100vh fixed overlay inside Love Flix
    }
  };

  const exitNativeFullscreenIfActive = () => {
    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        document.exitFullscreen().catch(() => {});
      }
    } catch {
      // ignore
    }
  };

  const handleSelectChannel = (channel: 1 | 2 | 3) => {
    if (!watchRequest) return;
    const resolvedImdb =
      (watchRequest.imdbId && /^tt\d+/i.test(watchRequest.imdbId) ? watchRequest.imdbId : null) ||
      prefetchedImdb ||
      null;

    // Commit activePlayer synchronously so playerScreenRef mounts inside the exact user click gesture
    flushSync(() => {
      startPlayerSession({
        mediaType: watchRequest.mediaType,
        id: watchRequest.id,
        title: watchRequest.title,
        imdbId: resolvedImdb,
        channel,
        season: watchRequest.mediaType === 'tv' ? watchRequest.season || 1 : undefined,
        episode: watchRequest.mediaType === 'tv' ? watchRequest.episode || 1 : undefined,
        episodeTitle: watchRequest.episodeTitle,
      });
    });

    // Automatically launch true fullscreen inside our site
    enterFullscreenElement(playerScreenRef.current);
  };

  const handleClosePlayer = () => {
    exitNativeFullscreenIfActive();
    closePlayerSession();
  };

  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      exitNativeFullscreenIfActive();
    } else {
      enterFullscreenElement(playerScreenRef.current);
    }
  };

  // ==========================================================================
  // 1. FULLSCREEN IN-APP SUPERCDN PLAYER (100% Viewport + Native Fullscreen)
  // ==========================================================================
  if (activePlayer) {
    const superCdnType = activePlayer.mediaType === 'tv' ? 'tvshow' : 'movie';
    const streamParams = new URLSearchParams({
      type: superCdnType,
      imdb: activePlayer.imdbId || '',
      tmdbId: String(activePlayer.id),
      channel: String(activePlayer.channel),
    });
    if (superCdnType === 'tvshow') {
      streamParams.set('season', String(activePlayer.season || 1));
      streamParams.set('episode', String(activePlayer.episode || 1));
    }

    const streamSrc = activePlayer.imdbId
      ? `/api/supercdn/stream?${streamParams.toString()}`
      : null;

    const episodeSubtitle =
      activePlayer.mediaType === 'tv' && activePlayer.season && activePlayer.episode
        ? `T${activePlayer.season} · Ep. ${activePlayer.episode}${
            activePlayer.episodeTitle ? ` — ${activePlayer.episodeTitle}` : ''
          }`
        : null;

    return (
      <div
        ref={playerScreenRef}
        className="fixed inset-0 z-[100] w-screen h-screen bg-black flex flex-col select-none"
        role="dialog"
        aria-modal="true"
        aria-label={`Reproduzindo ${activePlayer.title}`}
      >
        {/* Slim Cinema Control Header (never overlaps embedded player controls) */}
        <header className="h-12 px-3 sm:px-5 bg-[#080808] border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={handleClosePlayer}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141414] hover:bg-[#E50914] text-white text-xs font-bold border border-white/10 transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Fechar</span>
            </button>

            <div className="min-w-0 hidden xs:block sm:block">
              <p className="text-xs sm:text-sm font-bold text-white truncate">
                {activePlayer.title}
                {episodeSubtitle ? (
                  <span className="text-[#A1A1A1] font-medium"> · {episodeSubtitle}</span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#121212] border border-white/[0.08]">
              {CHANNELS.map((ch) => {
                const isSelected = activePlayer.channel === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => switchPlayerChannel(ch.id)}
                    className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-[#E50914] text-white'
                        : 'text-[#A1A1A1] hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    {ch.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleToggleFullscreen}
              aria-label={isNativeFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              title={isNativeFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              className="w-8 h-8 rounded-lg bg-[#141414] hover:bg-[#222222] border border-white/10 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              {isNativeFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </header>

        {/* SuperCDN Official Container (#SuperCDNContainerVideo) */}
        <div
          id="SuperCDNContainerVideo"
          className="relative flex-1 w-full h-full min-h-0 bg-black overflow-hidden"
        >
          {(!activePlayer.imdbId && !imdbLookupFailed) || iframeLoading ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#080808] pointer-events-none">
              <Loader2 className="w-9 h-9 animate-spin text-[#E50914]" />
              <p className="text-xs sm:text-sm font-semibold text-[#A1A1A1]">
                Conectando ao Canal {activePlayer.channel}...
              </p>
            </div>
          ) : null}

          {imdbLookupFailed && !activePlayer.imdbId ? (
            <div className="w-full h-full flex items-center justify-center p-6 text-center bg-[#080808]">
              <div className="max-w-md rounded-2xl bg-[#121212] border border-white/10 p-7">
                <p className="text-base font-bold text-white mb-2">
                  Conteúdo sem código IMDb vinculado
                </p>
                <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed mb-5">
                  Este título ainda não possui identificador IMDb disponível para iniciar a reprodução nos canais.
                </p>
                <button
                  type="button"
                  onClick={handleClosePlayer}
                  className="px-5 py-2.5 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-xs font-bold text-white transition-colors cursor-pointer"
                >
                  Voltar ao catálogo
                </button>
              </div>
            </div>
          ) : streamSrc ? (
            <iframe
              key={`${activePlayer.imdbId}-${activePlayer.channel}-${activePlayer.season || 0}-${activePlayer.episode || 0}`}
              src={streamSrc}
              title={`${activePlayer.title} — Canal ${activePlayer.channel}`}
              width="100%"
              height="100%"
              scrolling="no"
              frameBorder="0"
              onLoad={() => setIframeLoading(false)}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              className="w-full h-full border-0 bg-black"
            />
          ) : null}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // 2. COMPACT 3-CHANNEL SELECTOR CARD (Canal 1, Canal 2, Canal 3)
  // ==========================================================================
  if (!watchRequest) return null;

  const isSeries = watchRequest.mediaType === 'tv';
  const epLabel =
    isSeries && watchRequest.season && watchRequest.episode
      ? `Temporada ${watchRequest.season} · Episódio ${watchRequest.episode}`
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Escolher canal para ${watchRequest.title}`}
    >
      <div className="fixed inset-0" onClick={closeWatchModal} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-[#121212] border border-white/12 p-5 shadow-2xl shadow-black/80">
        {/* Card Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#FF253A] mb-1">
              <Tv className="w-3.5 h-3.5 shrink-0" />
              <span>Escolha um canal</span>
            </div>
            <h3 className="font-display text-base sm:text-lg font-extrabold text-white truncate">
              {watchRequest.title}
            </h3>
            {epLabel && (
              <p className="text-xs text-[#A1A1A1] mt-0.5 truncate">
                {epLabel}
                {watchRequest.episodeTitle ? ` — ${watchRequest.episodeTitle}` : ''}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={closeWatchModal}
            aria-label="Fechar seleção de canais"
            className="w-8 h-8 rounded-lg bg-[#1b1b1b] hover:bg-[#E50914] text-[#A1A1A1] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Direct Channel Options */}
        <div className="space-y-2.5">
          {CHANNELS.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => handleSelectChannel(ch.id)}
              className="group w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-[#181818] hover:bg-[#E50914] border border-white/10 hover:border-[#FF253A] text-white transition-all duration-150 active:scale-[0.99] cursor-pointer min-h-[48px]"
            >
              <span className="inline-flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-[#E50914]/15 group-hover:bg-white/20 flex items-center justify-center text-[#FF253A] group-hover:text-white transition-colors">
                  <Play className="w-3.5 h-3.5 fill-current" />
                </span>
                <span className="text-sm font-bold tracking-wide">{ch.label}</span>
              </span>

              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#A1A1A1] group-hover:text-white transition-colors">
                {resolvingImdb ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <span>Assistir</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
