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
import { useExternalRoom } from '../context/ExternalRoomContext';
import { useUserData } from '../context/UserDataContext';
import { tmdbService } from '../services/tmdb';
import type { ExternalPlaybackAction } from '../types/externalRoom';

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

  const {
    isConnected: isRoomConnected,
    isPickerMode,
    returnUrl,
    syncedMedia,
    syncedPlayback,
    syncMediaToExternalRoom,
    syncPlaybackToExternalRoom,
    getLiveRoomPositionSec,
    subscribeRemotePlayback,
    returnToExternalRoomApp,
    isApplyingRemoteMediaChange,
  } = useExternalRoom();
  const { pushToast } = useUserData();

  const [prefetchedImdb, setPrefetchedImdb] = useState<string | null>(null);
  const [resolvingImdb, setResolvingImdb] = useState(false);
  const [imdbChecked, setImdbChecked] = useState(false);

  // Stage 2: Verified channels for the modal selector card
  const [modalAvailableChannels, setModalAvailableChannels] = useState<Array<1 | 2 | 3> | null>(
    null
  );
  const [checkingModalChannels, setCheckingModalChannels] = useState(false);

  // Stage 2 & 3: Verified channels & auto-fallback inside active fullscreen player
  const [resolvingActiveImdb, setResolvingActiveImdb] = useState(false);
  const [activeAvailableChannels, setActiveAvailableChannels] = useState<Array<1 | 2 | 3> | null>(
    null
  );

  const [iframeLoading, setIframeLoading] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [sendingToRoom, setSendingToRoom] = useState(false);
  const [remoteSyncNotice, setRemoteSyncNotice] = useState<string | null>(null);

  const playerScreenRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const remoteNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Resolve IMDb ID as soon as the 3-channel selector card opens
  useEffect(() => {
    if (!watchRequest) {
      setPrefetchedImdb(null);
      setResolvingImdb(false);
      setImdbChecked(false);
      setModalAvailableChannels(null);
      setCheckingModalChannels(false);
      return;
    }

    if (watchRequest.imdbId && /^tt\d+/i.test(watchRequest.imdbId)) {
      setPrefetchedImdb(watchRequest.imdbId);
      setResolvingImdb(false);
      setImdbChecked(true);
      return;
    }

    let cancelled = false;
    setPrefetchedImdb(null);
    setResolvingImdb(true);
    setImdbChecked(false);

    tmdbService
      .getImdbId(watchRequest.mediaType, watchRequest.id)
      .then((found) => {
        if (cancelled) return;
        setPrefetchedImdb(found);
      })
      .catch(() => {
        if (!cancelled) setPrefetchedImdb(null);
      })
      .finally(() => {
        if (!cancelled) {
          setResolvingImdb(false);
          setImdbChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [watchRequest]);

  // 2. Stage 2: Probe real availability across Canal 1, Canal 2, and Canal 3 + pre-warm Canal 1
  useEffect(() => {
    if (!watchRequest || !imdbChecked) return;

    let cancelled = false;
    setCheckingModalChannels(true);

    tmdbService
      .getChannelAvailability({
        mediaType: watchRequest.mediaType,
        id: watchRequest.id,
        imdbId: prefetchedImdb,
        season: watchRequest.season,
        episode: watchRequest.episode,
      })
      .then((info) => {
        if (cancelled) return;
        setModalAvailableChannels(info.availableChannels);
      })
      .catch(() => {
        if (!cancelled) setModalAvailableChannels([1, 2, 3]);
      })
      .finally(() => {
        if (!cancelled) setCheckingModalChannels(false);
      });

    return () => {
      cancelled = true;
    };
  }, [watchRequest, imdbChecked, prefetchedImdb]);

  // 3. If user clicked a channel before IMDb finished resolving, complete IMDb lookup in background
  useEffect(() => {
    if (!activePlayer) {
      setResolvingActiveImdb(false);
      setActiveAvailableChannels(null);
      return;
    }

    if (activePlayer.imdbId) {
      setResolvingActiveImdb(false);
      return;
    }

    let cancelled = false;
    setResolvingActiveImdb(true);

    tmdbService
      .getImdbId(activePlayer.mediaType, activePlayer.id)
      .then((found) => {
        if (cancelled) return;
        if (found) {
          updateActivePlayerImdb(found);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResolvingActiveImdb(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePlayer?.id, activePlayer?.mediaType, activePlayer?.imdbId, updateActivePlayerImdb]);

  // 4. Stage 2 & Stage 3: Verify channels for activePlayer and auto-switch if current channel is unavailable
  useEffect(() => {
    if (!activePlayer || resolvingActiveImdb) return;

    let cancelled = false;

    tmdbService
      .getChannelAvailability({
        mediaType: activePlayer.mediaType,
        id: activePlayer.id,
        imdbId: activePlayer.imdbId,
        season: activePlayer.season,
        episode: activePlayer.episode,
      })
      .then((info) => {
        if (cancelled) return;
        setActiveAvailableChannels(info.availableChannels);

        if (
          info.availableChannels.length > 0 &&
          !info.availableChannels.includes(activePlayer.channel)
        ) {
          switchPlayerChannel(info.availableChannels[0]);
        }
      })
      .catch(() => {
        if (!cancelled) setActiveAvailableChannels([1, 2, 3]);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activePlayer?.id,
    activePlayer?.mediaType,
    activePlayer?.imdbId,
    activePlayer?.season,
    activePlayer?.episode,
    activePlayer?.channel,
    resolvingActiveImdb,
    switchPlayerChannel,
  ]);

  // 5. Stage 3 + External Room Sync: Listen for iframe events (fallback + play/pause/seek)
  useEffect(() => {
    if (!activePlayer) return;

    const onMessage = (event: MessageEvent) => {
      const d = event.data;
      if (!d || typeof d !== 'object') return;

      if (d.type === 'LOVEFLIX_CHANNEL_FALLBACK') {
        const pool =
          activeAvailableChannels && activeAvailableChannels.length > 0
            ? activeAvailableChannels
            : ([1, 2, 3] as Array<1 | 2 | 3>);
        const nextChannel = pool.find((c) => c !== activePlayer.channel);
        if (nextChannel) {
          setActiveAvailableChannels((prev) =>
            prev ? prev.filter((c) => c !== activePlayer.channel) : [2, 3]
          );
          switchPlayerChannel(nextChannel);
        }
        return;
      }

      if (d.type === 'LOVEFLIX_PLAYER_READY' && isRoomConnected && iframeRef.current?.contentWindow) {
        if (
          syncedPlayback &&
          (!syncedMedia ||
            (syncedMedia.tmdbId === activePlayer.id &&
              syncedMedia.mediaType === activePlayer.mediaType))
        ) {
          const liveSec = getLiveRoomPositionSec(syncedPlayback);
          if (liveSec > 1.5 || syncedPlayback.paused) {
            iframeRef.current.contentWindow.postMessage(
              {
                type: 'LOVEFLIX_PLAYER_COMMAND',
                command: 'sync',
                positionSec: liveSec,
                paused: syncedPlayback.paused,
                playbackRate: syncedPlayback.playbackRate || 1,
              },
              '*'
            );
          }
        }
        return;
      }

      if (d.type === 'LOVEFLIX_PLAYER_EVENT' && isRoomConnected) {
        const action = String(d.action || '') as ExternalPlaybackAction;
        if (action === 'play' || action === 'pause' || action === 'seek' || action === 'ratechange') {
          syncPlaybackToExternalRoom({
            action,
            positionSec: Number(d.positionSec) || 0,
            paused: Boolean(d.paused),
            playbackRate: Number(d.playbackRate) || 1,
          });
        }
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [
    activePlayer,
    activeAvailableChannels,
    getLiveRoomPositionSec,
    isRoomConnected,
    switchPlayerChannel,
    syncPlaybackToExternalRoom,
    syncedMedia,
    syncedPlayback,
  ]);

  // 6. Subscribe to incoming remote playback updates (play, pause, seek/adiantar) from external room
  useEffect(() => {
    if (!activePlayer || !isRoomConnected) return;

    return subscribeRemotePlayback((playback, liveSec) => {
      if (iframeRef.current?.contentWindow) {
        const command =
          playback.action === 'seek'
            ? 'seek'
            : playback.paused
            ? 'pause'
            : 'play';
        iframeRef.current.contentWindow.postMessage(
          {
            type: 'LOVEFLIX_PLAYER_COMMAND',
            command,
            positionSec: liveSec,
            paused: playback.paused,
            playbackRate: playback.playbackRate || 1,
          },
          '*'
        );
      }

      const mins = Math.floor(liveSec / 60);
      const secs = String(Math.floor(liveSec % 60)).padStart(2, '0');
      const stamp = `${mins}:${secs}`;
      const label =
        playback.action === 'pause'
          ? `Sala pausou em ${stamp}`
          : playback.action === 'seek'
          ? `Sala sincronizou tempo para ${stamp}`
          : playback.action === 'play'
          ? `Sala retomou em ${stamp}`
          : null;

      if (label) {
        setRemoteSyncNotice(label);
        if (remoteNoticeTimerRef.current) clearTimeout(remoteNoticeTimerRef.current);
        remoteNoticeTimerRef.current = setTimeout(() => {
          setRemoteSyncNotice(null);
        }, 2400);
      }
    });
  }, [activePlayer, isRoomConnected, subscribeRemotePlayback]);

  // 7. Automatically push local active player media/channel changes to connected external room
  useEffect(() => {
    if (!activePlayer || !isRoomConnected || isApplyingRemoteMediaChange()) return;

    void syncMediaToExternalRoom({
      mediaType: activePlayer.mediaType,
      tmdbId: activePlayer.id,
      imdbId: activePlayer.imdbId,
      title: activePlayer.title,
      season: activePlayer.season,
      episode: activePlayer.episode,
      episodeTitle: activePlayer.episodeTitle,
      channel: activePlayer.channel,
    });
  }, [
    activePlayer?.id,
    activePlayer?.mediaType,
    activePlayer?.imdbId,
    activePlayer?.season,
    activePlayer?.episode,
    activePlayer?.channel,
    isRoomConnected,
    isApplyingRemoteMediaChange,
    syncMediaToExternalRoom,
  ]);

  // Track iframe loading spinner whenever channel or episode changes
  useEffect(() => {
    if (activePlayer && !resolvingActiveImdb) {
      setIframeLoading(true);
    } else {
      setIframeLoading(false);
    }
  }, [
    activePlayer?.id,
    activePlayer?.imdbId,
    activePlayer?.channel,
    activePlayer?.season,
    activePlayer?.episode,
    resolvingActiveImdb,
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

  const handleSelectChannel = async (channel: 1 | 2 | 3) => {
    if (!watchRequest || sendingToRoom) return;
    const resolvedImdb =
      (watchRequest.imdbId && /^tt\d+/i.test(watchRequest.imdbId) ? watchRequest.imdbId : null) ||
      prefetchedImdb ||
      null;

    const effectiveChannel =
      modalAvailableChannels &&
      modalAvailableChannels.length > 0 &&
      !modalAvailableChannels.includes(channel)
        ? modalAvailableChannels[0]
        : channel;

    // When Love Flix is opened inside the external platform's room as a content picker,
    // dispatch the selected movie/episode/channel directly to the room and close the modal cleanly.
    if (isRoomConnected && isPickerMode) {
      setSendingToRoom(true);
      const sent = await syncMediaToExternalRoom({
        mediaType: watchRequest.mediaType,
        tmdbId: watchRequest.id,
        imdbId: resolvedImdb,
        title: watchRequest.title,
        posterPath: watchRequest.item?.poster_path || null,
        backdropPath: watchRequest.item?.backdrop_path || null,
        season: watchRequest.mediaType === 'tv' ? watchRequest.season || 1 : undefined,
        episode: watchRequest.mediaType === 'tv' ? watchRequest.episode || 1 : undefined,
        episodeTitle: watchRequest.episodeTitle,
        channel: effectiveChannel,
      });
      setSendingToRoom(false);

      if (sent) {
        pushToast(`Iniciando na sala: ${watchRequest.title}`, 'accent');
        closeWatchModal();
        if (returnUrl) {
          returnToExternalRoomApp();
        }
        return;
      }
    }

    if (modalAvailableChannels) {
      setActiveAvailableChannels(modalAvailableChannels);
    }

    flushSync(() => {
      startPlayerSession({
        mediaType: watchRequest.mediaType,
        id: watchRequest.id,
        title: watchRequest.title,
        imdbId: resolvedImdb,
        channel: effectiveChannel,
        season: watchRequest.mediaType === 'tv' ? watchRequest.season || 1 : undefined,
        episode: watchRequest.mediaType === 'tv' ? watchRequest.episode || 1 : undefined,
        episodeTitle: watchRequest.episodeTitle,
      });
    });

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

    const streamSrc = !resolvingActiveImdb
      ? `/api/supercdn/stream?${streamParams.toString()}`
      : null;

    const episodeSubtitle =
      activePlayer.mediaType === 'tv' && activePlayer.season && activePlayer.episode
        ? `T${activePlayer.season} · Ep. ${activePlayer.episode}${
            activePlayer.episodeTitle ? ` — ${activePlayer.episodeTitle}` : ''
          }`
        : null;

    const headerChannels =
      activeAvailableChannels && activeAvailableChannels.length > 0
        ? CHANNELS.filter((ch) => activeAvailableChannels.includes(ch.id))
        : CHANNELS;

    const noPlayerChannelsAvailable =
      activeAvailableChannels !== null && activeAvailableChannels.length === 0;

    return (
      <div
        ref={playerScreenRef}
        className="fixed inset-0 z-[100] w-screen h-screen bg-black flex flex-col select-none"
        role="dialog"
        aria-modal="true"
        aria-label={`Reproduzindo ${activePlayer.title}`}
      >
        {/* Slim Cinema Control Header */}
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
            {!noPlayerChannelsAvailable && (
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#121212] border border-white/[0.08]">
                {headerChannels.map((ch) => {
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
            )}

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
          {(resolvingActiveImdb || iframeLoading) && !noPlayerChannelsAvailable ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#080808] pointer-events-none">
              <Loader2 className="w-9 h-9 animate-spin text-[#E50914]" />
              <p className="text-xs sm:text-sm font-semibold text-[#A1A1A1]">
                Conectando ao Canal {activePlayer.channel}...
              </p>
            </div>
          ) : null}

          {remoteSyncNotice && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-lg bg-[#121212]/90 border border-[#E50914]/40 text-xs font-bold text-white shadow-xl pointer-events-none tabular-nums">
              {remoteSyncNotice}
            </div>
          )}

          {noPlayerChannelsAvailable ? (
            <div className="w-full h-full flex items-center justify-center p-6 text-center bg-[#080808]">
              <div className="max-w-md rounded-2xl bg-[#121212] border border-white/10 p-7">
                <p className="text-base font-bold text-white mb-2">
                  Transmissão indisponível no momento
                </p>
                <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed mb-5">
                  Este título ou episódio ainda não está disponível em nenhum dos servidores de transmissão.
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
              ref={iframeRef}
              key={`${activePlayer.id}-${activePlayer.imdbId || 'tmdb'}-${activePlayer.channel}-${activePlayer.season || 0}-${activePlayer.episode || 0}`}
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
  // 2. SMART CHANNEL SELECTOR CARD (Shows Verified Working Channels)
  // ==========================================================================
  if (!watchRequest) return null;

  const isSeries = watchRequest.mediaType === 'tv';
  const epLabel =
    isSeries && watchRequest.season && watchRequest.episode
      ? `Temporada ${watchRequest.season} · Episódio ${watchRequest.episode}`
      : null;

  const isChecking = resolvingImdb || checkingModalChannels;
  const noChannelsAvailable =
    modalAvailableChannels !== null && modalAvailableChannels.length === 0;
  const visibleModalChannels =
    modalAvailableChannels && modalAvailableChannels.length > 0
      ? CHANNELS.filter((ch) => modalAvailableChannels.includes(ch.id))
      : CHANNELS;

  const availabilitySubtitle = isChecking
    ? 'Verificando disponibilidade nos canais...'
    : modalAvailableChannels && modalAvailableChannels.length > 0 && modalAvailableChannels.length < 3
    ? modalAvailableChannels.length === 1
      ? '1 canal disponível para este título'
      : `${modalAvailableChannels.length} canais disponíveis para este título`
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
            {availabilitySubtitle && (
              <p className="text-xs text-[#A1A1A1] mt-1">{availabilitySubtitle}</p>
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

        {/* Verified Channel Options or Clean Unavailable Notice */}
        {noChannelsAvailable ? (
          <div className="py-3 text-center space-y-4">
            <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
              Este título ou episódio ainda não está disponível nos canais de transmissão no momento.
            </p>
            <button
              type="button"
              onClick={closeWatchModal}
              className="w-full py-3 rounded-xl bg-[#1b1b1b] hover:bg-[#E50914] text-xs font-bold text-white border border-white/10 transition-colors cursor-pointer"
            >
              Voltar
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleModalChannels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                disabled={sendingToRoom}
                onClick={() => void handleSelectChannel(ch.id)}
                className="group w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-[#181818] hover:bg-[#E50914] border border-white/10 hover:border-[#FF253A] text-white transition-all duration-150 active:scale-[0.99] cursor-pointer min-h-[48px] disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-[#E50914]/15 group-hover:bg-white/20 flex items-center justify-center text-[#FF253A] group-hover:text-white transition-colors">
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </span>
                  <span className="text-sm font-bold tracking-wide">{ch.label}</span>
                </span>

                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#A1A1A1] group-hover:text-white transition-colors">
                  {(isChecking && modalAvailableChannels === null) || sendingToRoom ? (
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
        )}
      </div>
    </div>
  );
};
