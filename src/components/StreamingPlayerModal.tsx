import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowLeft,
  ChevronRight,
  Clapperboard,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  Scan,
  SkipForward,
  Tv,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';
import { useExternalRoom } from '../context/ExternalRoomContext';
import { useUserData } from '../context/UserDataContext';
import { isCinemaOnlyMovie, tmdbService } from '../services/tmdb';
import type { ExternalPlaybackAction } from '../types/externalRoom';

const OFFICIAL_LOVEFLIX_INTRO_VIDEO = '/assets/aistudio/lv_0_20261031073011_3b9bb1a5.mp4';

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
  const { pushToast, profile } = useUserData();

  const preferredAudio: 'pt' | 'original' = profile.audioLanguage === 'original' ? 'original' : 'pt';
  const preferredSubtitles: 'auto' | 'always' | 'off' =
    profile.subtitlePreference === 'always' || profile.subtitlePreference === 'off'
      ? profile.subtitlePreference
      : 'auto';
  const preferredQuality: 'auto' | '1080p' | '720p' | 'saver' = profile.playbackQuality || 'auto';

  const [prefetchedImdb, setPrefetchedImdb] = useState<string | null>(null);
  const [resolvingImdb, setResolvingImdb] = useState(false);
  const [imdbChecked, setImdbChecked] = useState(false);

  // Stage 2: Verified channels for the modal selector card
  const [modalAvailableChannels, setModalAvailableChannels] = useState<Array<1 | 2 | 3> | null>(
    null
  );
  const [checkingModalChannels, setCheckingModalChannels] = useState(false);
  const [isModalCinemaExclusive, setIsModalCinemaExclusive] = useState(false);

  // Stage 2 & 3: Verified channels & auto-fallback inside active fullscreen player
  const [resolvingActiveImdb, setResolvingActiveImdb] = useState(false);
  const [activeAvailableChannels, setActiveAvailableChannels] = useState<Array<1 | 2 | 3> | null>(
    null
  );
  const [activeIsCinemaExclusive, setActiveIsCinemaExclusive] = useState(false);

  const [iframeLoading, setIframeLoading] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [iframeFillZoom, setIframeFillZoom] = useState(false);
  const [sendingToRoom, setSendingToRoom] = useState(false);
  const [remoteSyncNotice, setRemoteSyncNotice] = useState<string | null>(null);

  const playerScreenRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const remoteNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Official Love Flix Opening Intro State
  const [isPlayingIntro, setIsPlayingIntro] = useState(false);
  const [introTimeRemaining, setIntroTimeRemaining] = useState(8);
  const [isIntroMuted, setIsIntroMuted] = useState(false);
  const introVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastIntroContentKeyRef = useRef<string | null>(null);
  const waitIntroStreamKeyRef = useRef<string | null>(null);
  const waitIntroFlagRef = useRef<boolean>(false);

  const currentContentKey = activePlayer
    ? `${activePlayer.mediaType}-${activePlayer.id}-${activePlayer.season || 0}-${activePlayer.episode || 0}`
    : null;
  const isIntroPendingForCurrentContent = Boolean(
    currentContentKey && lastIntroContentKeyRef.current !== currentContentKey
  );
  const effectiveIsPlayingIntro = isPlayingIntro || isIntroPendingForCurrentContent;

  const notifyIframeIntroEnded = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: 'LOVEFLIX_END_INTRO' }, '*');
    } catch {
      // ignore
    }
  }, []);

  const handleEndIntro = useCallback(() => {
    if (introVideoRef.current) {
      try {
        introVideoRef.current.pause();
      } catch {
        // ignore
      }
    }
    setIsPlayingIntro(false);
    notifyIframeIntroEnded();
  }, [notifyIframeIntroEnded]);

  const toggleIntroSound = useCallback(() => {
    if (introVideoRef.current) {
      const nextMuted = !introVideoRef.current.muted;
      introVideoRef.current.muted = nextMuted;
      setIsIntroMuted(nextMuted);
      if (!nextMuted) {
        introVideoRef.current.volume = 1;
      }
    }
  }, []);

  const enterFullscreenElement = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const target = el as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    try {
      if (typeof target.requestFullscreen === 'function') {
        target
          .requestFullscreen()
          .then(() => {
            try {
              const orientation = screen.orientation as ScreenOrientation & {
                lock?: (o: string) => Promise<void>;
              };
              orientation?.lock?.('landscape')?.catch?.(() => {});
            } catch {}
          })
          .catch(() => {});
      } else if (typeof target.webkitRequestFullscreen === 'function') {
        target.webkitRequestFullscreen();
      } else if (typeof target.msRequestFullscreen === 'function') {
        target.msRequestFullscreen();
      }
    } catch {
      // Fallback remains 100vw x 100vh fixed overlay inside Love Flix
    }
  }, []);

  const exitNativeFullscreenIfActive = useCallback(() => {
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        unlock?: () => void;
      };
      orientation?.unlock?.();
    } catch {}
    try {
      const fsDoc = document as Document & {
        webkitFullscreenElement?: Element | null;
        webkitExitFullscreen?: () => Promise<void> | void;
      };
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        document.exitFullscreen().catch(() => {});
      } else if (fsDoc.webkitFullscreenElement && typeof fsDoc.webkitExitFullscreen === 'function') {
        fsDoc.webkitExitFullscreen();
      }
    } catch {
      // ignore
    }
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    const fsDoc = document as Document & { webkitFullscreenElement?: Element | null };
    if (document.fullscreenElement || fsDoc.webkitFullscreenElement) {
      exitNativeFullscreenIfActive();
    } else {
      enterFullscreenElement(playerScreenRef.current);
    }
  }, [enterFullscreenElement, exitNativeFullscreenIfActive]);

  // Track media changes to trigger the official opening once per title / episode
  useEffect(() => {
    if (!activePlayer) {
      lastIntroContentKeyRef.current = null;
      waitIntroStreamKeyRef.current = null;
      waitIntroFlagRef.current = false;
      setIsPlayingIntro(false);
      return;
    }

    const contentKey = `${activePlayer.mediaType}-${activePlayer.id}-${activePlayer.season || 0}-${activePlayer.episode || 0}`;
    if (lastIntroContentKeyRef.current !== contentKey) {
      lastIntroContentKeyRef.current = contentKey;
      setIsPlayingIntro(true);
      setIntroTimeRemaining(8);
      setIsIntroMuted(false);
    }
  }, [activePlayer?.id, activePlayer?.mediaType, activePlayer?.season, activePlayer?.episode]);

  // Notify preloaded Canal 1 iframe as soon as the official opening ends
  useEffect(() => {
    if (activePlayer && !effectiveIsPlayingIntro) {
      notifyIframeIntroEnded();
    }
  }, [activePlayer, effectiveIsPlayingIntro, notifyIframeIntroEnded]);

  // Autoplay intro video with full audio upon launch
  useEffect(() => {
    if (!isPlayingIntro || !activePlayer) return;

    const video = introVideoRef.current;
    if (!video) return;

    video.currentTime = 0;
    video.volume = 1;
    video.muted = false;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // If the browser enforces initial user muted policy, fallback gracefully
        video.muted = true;
        setIsIntroMuted(true);
        video.play().catch(() => {});
      });
    }
  }, [isPlayingIntro, activePlayer?.id, activePlayer?.season, activePlayer?.episode]);

  // Space/Enter shortcut to skip the intro
  useEffect(() => {
    if (!activePlayer || !isPlayingIntro) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleEndIntro();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePlayer, isPlayingIntro, handleEndIntro]);

  // 1. Resolve IMDb ID as soon as the 3-channel selector card opens
  useEffect(() => {
    if (!watchRequest) {
      setPrefetchedImdb(null);
      setResolvingImdb(false);
      setImdbChecked(false);
      setModalAvailableChannels(null);
      setCheckingModalChannels(false);
      setIsModalCinemaExclusive(false);
      return;
    }

    if (watchRequest.mediaType === 'movie') {
      isCinemaOnlyMovie(watchRequest.id)
        .then((isOnly) => {
          setIsModalCinemaExclusive(isOnly);
        })
        .catch(() => {
          setIsModalCinemaExclusive(false);
        });
    } else {
      setIsModalCinemaExclusive(false);
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
        if (!cancelled) setModalAvailableChannels([]);
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

  // Check if active media is exclusive to movie theaters
  useEffect(() => {
    if (!activePlayer || activePlayer.mediaType !== 'movie') {
      setActiveIsCinemaExclusive(false);
      return;
    }

    let cancelled = false;
    isCinemaOnlyMovie(activePlayer.id)
      .then((isOnly) => {
        if (!cancelled) setActiveIsCinemaExclusive(isOnly);
      })
      .catch(() => {
        if (!cancelled) setActiveIsCinemaExclusive(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePlayer?.id, activePlayer?.mediaType]);

  // 4. Stage 2: Verify channels in background for fallback intelligence
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
      })
      .catch(() => {
        if (!cancelled) setActiveAvailableChannels([]);
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
    resolvingActiveImdb,
  ]);

  // Auto-switch away if current channel turns out to be unavailable
  useEffect(() => {
    if (!activePlayer || activeAvailableChannels === null || activeAvailableChannels.length === 0) {
      return;
    }
    if (!activeAvailableChannels.includes(activePlayer.channel)) {
      switchPlayerChannel(activeAvailableChannels[0]);
    }
  }, [activePlayer, activeAvailableChannels, switchPlayerChannel]);

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
            : ([] as Array<1 | 2 | 3>);
        const nextChannel = pool.find((c) => c !== activePlayer.channel);
        setActiveAvailableChannels((prev) =>
          prev ? prev.filter((c) => c !== activePlayer.channel) : prev
        );
        if (nextChannel) {
          switchPlayerChannel(nextChannel);
        }
        return;
      }

      if (d.type === 'LOVEFLIX_TOGGLE_FULLSCREEN') {
        handleToggleFullscreen();
        return;
      }

      if (d.type === 'LOVEFLIX_CLOSE_PLAYER') {
        handleClosePlayer();
        return;
      }

      if (d.type === 'LOVEFLIX_PLAYER_IFRAME_BOOT' || d.type === 'LOVEFLIX_PLAYER_READY') {
        if (!effectiveIsPlayingIntro) {
          notifyIframeIntroEnded();
        }
        try {
          const fsDoc = document as Document & { webkitFullscreenElement?: Element | null };
          const isFsNow = Boolean(document.fullscreenElement || fsDoc.webkitFullscreenElement);
          iframeRef.current?.contentWindow?.postMessage(
            { type: 'LOVEFLIX_FULLSCREEN_STATE', fullscreen: isFsNow },
            '*'
          );
        } catch {}
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
    effectiveIsPlayingIntro,
    getLiveRoomPositionSec,
    handleToggleFullscreen,
    isRoomConnected,
    notifyIframeIntroEnded,
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

  // Track browser native fullscreen changes, sync iframe icon state, and body scroll lock
  useEffect(() => {
    const syncFsState = () => {
      const fsDoc = document as Document & { webkitFullscreenElement?: Element | null };
      const isFs = Boolean(document.fullscreenElement || fsDoc.webkitFullscreenElement);
      setIsNativeFullscreen(isFs);
      try {
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'LOVEFLIX_FULLSCREEN_STATE', fullscreen: isFs },
          '*'
        );
      } catch {}
    };
    document.addEventListener('fullscreenchange', syncFsState);
    document.addEventListener('webkitfullscreenchange', syncFsState);
    return () => {
      document.removeEventListener('fullscreenchange', syncFsState);
      document.removeEventListener('webkitfullscreenchange', syncFsState);
    };
  }, []);

  useEffect(() => {
    setIframeFillZoom(false);
  }, [activePlayer?.id, activePlayer?.channel, activePlayer?.season, activePlayer?.episode]);

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
    if (introVideoRef.current) {
      try {
        introVideoRef.current.pause();
      } catch {
        // ignore
      }
    }
    setIsPlayingIntro(false);
    lastIntroContentKeyRef.current = null;
    waitIntroStreamKeyRef.current = null;
    waitIntroFlagRef.current = false;
    exitNativeFullscreenIfActive();
    closePlayerSession();
  };

  // ==========================================================================
  // 1. FULLSCREEN IN-APP SUPERCDN PLAYER (100% Viewport + Native Fullscreen)
  // ==========================================================================
  if (activePlayer) {
    const streamIdentityKey = `${activePlayer.id}-${activePlayer.imdbId || 'tmdb'}-${activePlayer.channel}-${activePlayer.season || 0}-${activePlayer.episode || 0}-${preferredAudio}-${preferredSubtitles}-${preferredQuality}`;
    if (waitIntroStreamKeyRef.current !== streamIdentityKey) {
      waitIntroStreamKeyRef.current = streamIdentityKey;
      waitIntroFlagRef.current = activePlayer.channel === 1 && effectiveIsPlayingIntro;
    }

    const superCdnType = activePlayer.mediaType === 'tv' ? 'tvshow' : 'movie';
    const streamParams = new URLSearchParams({
      type: superCdnType,
      imdb: activePlayer.imdbId || '',
      tmdbId: String(activePlayer.id),
      channel: String(activePlayer.channel),
      audioPref: preferredAudio,
      subPref: preferredSubtitles,
      qualityPref: preferredQuality,
    });
    if (superCdnType === 'tvshow') {
      streamParams.set('season', String(activePlayer.season || 1));
      streamParams.set('episode', String(activePlayer.episode || 1));
    }
    if (activePlayer.channel === 1 && waitIntroFlagRef.current) {
      streamParams.set('waitIntro', '1');
    }

    const streamSrc = !resolvingActiveImdb
      ? `/api/supercdn/stream?${streamParams.toString()}`
      : null;
    const canPreloadBehindIntro = activePlayer.channel === 1 || activePlayer.channel === 2;
    const shouldMountIframe =
      Boolean(streamSrc && streamSrc.trim()) &&
      (!effectiveIsPlayingIntro || canPreloadBehindIntro);

    const episodeSubtitle =
      activePlayer.mediaType === 'tv' && activePlayer.season && activePlayer.episode
        ? `T${activePlayer.season} · Ep. ${activePlayer.episode}${
            activePlayer.episodeTitle ? ` — ${activePlayer.episodeTitle}` : ''
          }`
        : null;

    const noPlayerChannelsAvailable =
      activeAvailableChannels !== null && activeAvailableChannels.length === 0;

    return (
      <div
        ref={playerScreenRef}
        className="fixed inset-0 z-[100] w-screen h-[100dvh] bg-black flex flex-col select-none"
        role="dialog"
        aria-modal="true"
        aria-label={`Reproduzindo ${activePlayer.title}`}
      >
        {/* Minimal corner overlay in fullscreen/landscape so 100% of video stays unobscured */}
        <header
          className={`h-11 sm:h-12 px-3 sm:px-5 flex items-center justify-between gap-3 shrink-0 z-30 ${
            isNativeFullscreen
              ? 'pointer-events-none absolute top-0 left-0 right-0 bg-transparent border-b-0'
              : 'relative bg-[#080808] border-b border-white/[0.08] landscape:max-lg:pointer-events-none landscape:max-lg:absolute landscape:max-lg:top-0 landscape:max-lg:left-0 landscape:max-lg:right-0 landscape:max-lg:bg-transparent landscape:max-lg:border-b-0'
          }`}
        >
          <div className="pointer-events-auto flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={handleClosePlayer}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141414]/80 hover:bg-[#E50914] text-white text-xs font-bold border border-white/15 transition-colors cursor-pointer shrink-0 backdrop-blur-md"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Fechar</span>
            </button>

            <div className={`min-w-0 ${isNativeFullscreen ? 'hidden' : 'hidden lg:block'}`}>
              <p className="text-xs sm:text-sm font-bold text-white truncate drop-shadow">
                {activePlayer.title}
                {episodeSubtitle ? (
                  <span className="text-[#A1A1A1] font-medium"> · {episodeSubtitle}</span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
            {activePlayer.channel !== 1 && (
              <button
                type="button"
                onClick={() => setIframeFillZoom((prev) => !prev)}
                aria-label={iframeFillZoom ? 'Formato original' : 'Preencher tela'}
                title={iframeFillZoom ? 'Restaurar formato original' : 'Preencher tela sem bordas'}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer backdrop-blur-md ${
                  iframeFillZoom
                    ? 'bg-[#E50914] border-[#FF253A] text-white'
                    : 'bg-[#141414]/80 hover:bg-[#222222] border-white/15 text-white'
                }`}
              >
                <Scan className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{iframeFillZoom ? 'Original' : 'Preencher'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleFullscreen}
              aria-label={isNativeFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              title={isNativeFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              className="w-8 h-8 rounded-lg bg-[#141414]/80 hover:bg-[#222222] border border-white/15 text-white flex items-center justify-center transition-colors cursor-pointer backdrop-blur-md"
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
          className="relative flex-1 w-full h-full min-h-0 bg-black flex items-center justify-center overflow-hidden"
        >
          {/* Official Love Flix Opening Video with Sound */}
          {effectiveIsPlayingIntro && (
            <div className="absolute inset-0 z-40 bg-black flex flex-col items-center justify-center select-none overflow-hidden">
              <video
                ref={introVideoRef}
                src={OFFICIAL_LOVEFLIX_INTRO_VIDEO}
                playsInline
                autoPlay
                preload="auto"
                onTimeUpdate={() => {
                  if (introVideoRef.current) {
                    const d = introVideoRef.current.duration || 8.05;
                    const ct = introVideoRef.current.currentTime || 0;
                    setIntroTimeRemaining(Math.max(0, d - ct));
                  }
                }}
                onEnded={handleEndIntro}
                className="w-full h-full object-contain pointer-events-none"
              />

              {/* Top watermark / branding badge */}
              <div className="absolute top-4 left-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 border border-white/10 backdrop-blur-md pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-[#E50914] animate-ping" />
                <span className="text-[11px] font-extrabold tracking-wider text-white uppercase">
                  Abertura Oficial Love Flix
                </span>
              </div>

              {/* Bottom controls: Sound toggle + Skip button */}
              <div className="absolute bottom-6 right-6 z-50 flex items-center gap-2.5">
                {isIntroMuted ? (
                  <button
                    type="button"
                    onClick={toggleIntroSound}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-white text-xs font-bold border border-white/20 shadow-2xl transition-all cursor-pointer animate-pulse active:scale-95"
                    title="Ativar som da abertura"
                  >
                    <VolumeX className="w-4 h-4" />
                    <span>Ativar Som</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={toggleIntroSound}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/75 hover:bg-[#1f1f1f] text-white/90 text-xs font-bold border border-white/15 backdrop-blur-md transition-all cursor-pointer"
                    title="Silenciar áudio da abertura"
                  >
                    <Volume2 className="w-4 h-4 text-[#FF253A]" />
                    <span className="hidden sm:inline">Som Ativo</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleEndIntro}
                  className="group inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black/75 hover:bg-[#E50914] text-white text-xs font-bold border border-white/20 hover:border-transparent transition-all backdrop-blur-md shadow-2xl active:scale-95 cursor-pointer"
                  title="Pular abertura oficial"
                >
                  <SkipForward className="w-4 h-4 fill-current transition-transform group-hover:translate-x-0.5" />
                  <span>Pular Abertura</span>
                  <span className="text-[#A1A1A1] group-hover:text-white tabular-nums">
                    ({Math.ceil(introTimeRemaining)}s)
                  </span>
                </button>
              </div>
            </div>
          )}

          {(resolvingActiveImdb || iframeLoading) && !noPlayerChannelsAvailable && !effectiveIsPlayingIntro ? (
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

          {activeIsCinemaExclusive ? (
            <div className="w-full h-full flex items-center justify-center p-6 text-center bg-[#080808]">
              <div className="max-w-md rounded-2xl bg-[#121212] border border-amber-500/30 p-7 shadow-2xl">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
                  <Clapperboard className="w-6 h-6" />
                </div>
                <p className="text-base font-bold text-white mb-2">
                  Exclusivo nos Cinemas 🎬
                </p>
                <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed mb-5">
                  Este filme ainda está em exibição exclusiva nos cinemas e não foi liberado em plataformas digitais. A Love Flix disponibilizará a transmissão automaticamente em alta definição (Full HD / 4K) assim que o lançamento oficial for lançado.
                </p>
                <button
                  type="button"
                  onClick={handleClosePlayer}
                  className="px-6 py-2.5 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-xs font-bold text-white transition-colors cursor-pointer shadow-lg"
                >
                  Voltar ao catálogo
                </button>
              </div>
            </div>
          ) : noPlayerChannelsAvailable ? (
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
          ) : shouldMountIframe && streamSrc ? (
            <div
              className={`relative flex items-center justify-center bg-black transition-transform duration-200 ${
                isNativeFullscreen
                  ? 'w-full h-full'
                  : 'w-full aspect-video max-h-full landscape:aspect-auto landscape:h-full md:aspect-auto md:h-full'
              } ${activePlayer.channel !== 1 && iframeFillZoom ? 'scale-[1.24]' : ''}`}
            >
              <iframe
                ref={iframeRef}
                key={streamIdentityKey}
                src={streamSrc}
                title={`${activePlayer.title} — Canal ${activePlayer.channel}`}
                width="100%"
                height="100%"
                scrolling="no"
                frameBorder="0"
                referrerPolicy={activePlayer.channel === 2 ? 'no-referrer' : undefined}
                onLoad={() => setIframeLoading(false)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                className={`w-full h-full border-0 bg-black ${
                  effectiveIsPlayingIntro ? 'pointer-events-none' : ''
                }`}
              />
            </div>
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

  const isChecking =
    !isModalCinemaExclusive &&
    (resolvingImdb || checkingModalChannels || modalAvailableChannels === null);
  const visibleModalChannels = modalAvailableChannels
    ? CHANNELS.filter((ch) => modalAvailableChannels.includes(ch.id))
    : [];
  const noChannelsAvailable =
    !isChecking && modalAvailableChannels !== null && visibleModalChannels.length === 0;
  const availabilitySubtitle =
    !isChecking && visibleModalChannels.length > 0
      ? visibleModalChannels.length === 1
        ? '1 canal disponível'
        : `${visibleModalChannels.length} canais disponíveis`
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
        {isModalCinemaExclusive ? (
          <div className="py-2 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Clapperboard className="w-6 h-6" />
            </div>
            <div className="space-y-1.5 px-1">
              <h4 className="text-base font-bold text-white">Disponível apenas nos cinemas</h4>
              <p className="text-xs text-[#A1A1A1] leading-relaxed">
                Este filme ainda está em exibição exclusiva nos cinemas e não foi lançado em plataformas digitais.
              </p>
              <p className="text-[11px] text-white/70 leading-relaxed">
                Para manter a alta qualidade em Full HD / 4K sem marcas ou gravações de cinema, a Love Flix aguarda o lançamento oficial. Assim que sair no digital, ele entrará automaticamente aqui no catálogo!
              </p>
            </div>
            <button
              type="button"
              onClick={closeWatchModal}
              className="w-full py-3 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-xs font-bold text-white shadow-lg transition-colors cursor-pointer"
            >
              Entendido
            </button>
          </div>
        ) : isChecking ? (
          <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#E50914]" />
            <p className="text-xs sm:text-sm font-medium text-[#A1A1A1]">
              Verificando canais disponíveis...
            </p>
          </div>
        ) : noChannelsAvailable ? (
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
                  {sendingToRoom ? (
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
