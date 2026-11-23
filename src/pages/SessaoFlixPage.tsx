import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clapperboard,
  Copy,
  Flame,
  Loader2,
  LogOut,
  Minimize2,
  Play,
  Radio,
  Scan,
  Search,
  Send,
  SkipForward,
  UserRound,
  Volume2,
  VolumeX,
  X,
  Users,
} from 'lucide-react';
import { useExternalRoom } from '../context/ExternalRoomContext';
import { useNavigation } from '../context/NavigationContext';
import { useUserData } from '../context/UserDataContext';
import type { ExternalPlaybackAction } from '../types/externalRoom';
import {
  tmdbService,
  isCinemaOnlyMovie,
  getMediaTitle,
  getPosterUrl,
} from '../services/tmdb';
import type { TMDBMediaItem, TMDBMediaDetail, TMDBEpisode } from '../types/tmdb';
import { LOVEFLIX_PRESET_AVATARS } from '../utils/avatars';

const OFFICIAL_LOVEFLIX_INTRO_VIDEO = '/assets/aistudio/lv_0_20261031073011_3b9bb1a5.mp4';

const CHANNELS: Array<{ id: 1 | 2 | 3; label: string }> = [
  { id: 1, label: 'Canal 1' },
  { id: 2, label: 'Canal 2' },
  { id: 3, label: 'Canal 3' },
];

function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `FLIX-${randomPart}`;
}

function buildSessionWelcomeMessage(roomId: string): string {
  return `🎬 Sua sessão está pronta!
A sala já está aberta. Agora só falta reunir quem vai assistir com você!
🍿 Compartilhe o ID da sala com seus amigos e convide todo mundo para essa experiência.
ID DA SALA
#${roomId}
❤️ Boas sessões começam com boas companhias.`;
}

function isSessionWelcomeMessage(text: string): boolean {
  return text.startsWith('🎬 Sua sessão está pronta!\n') && text.includes('\nID DA SALA\n#');
}

export const SessaoFlixPage: React.FC = () => {
  const { route } = useNavigation();
  const { profile, pushToast } = useUserData();
  const preferredAudio: 'pt' | 'original' = profile.audioLanguage === 'original' ? 'original' : 'pt';
  const preferredSubtitles: 'auto' | 'always' | 'off' =
    profile.subtitlePreference === 'always' || profile.subtitlePreference === 'off'
      ? profile.subtitlePreference
      : 'auto';
  const preferredQuality: 'auto' | '1080p' | '720p' | 'saver' = profile.playbackQuality || 'auto';
  const {
    peerId,
    isHost,
    isConnected,
    connecting,
    lastConnectionError,
    roomId,
    syncedMedia,
    syncedPlayback,
    peers,
    chatMessages,
    createRoom,
    connectExternalRoom,
    disconnectExternalRoom,
    syncMediaToExternalRoom,
    syncPlaybackToExternalRoom,
    registerLivePlaybackGetter,
    getLiveRoomPositionSec,
    subscribeRemotePlayback,
    sendChatMessage,
  } = useExternalRoom();

  // Navigation flow state when opening a room:
  // 'initial': Two clean buttons: "Abrir uma sala" and "Entrar em uma"
  // 'join': Input box to type/paste the room code and join
  // 'search': User clicked "Abrir uma sala", now searches for content
  // 'channel_select': User clicked a title, selects channel (and episode if series)
  const [flowState, setFlowState] = useState<'initial' | 'join' | 'search' | 'channel_select'>('initial');

  // Input states
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search states for "Abrir uma sala"
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<TMDBMediaItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [popularSuggestions, setPopularSuggestions] = useState<TMDBMediaItem[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Selected media & channel picker modal state before entering the room
  const [selectedItem, setSelectedItem] = useState<TMDBMediaItem | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<1 | 2 | 3>(1);
  const [prefetchedPickerImdb, setPrefetchedPickerImdb] = useState<string | null>(null);
  const [resolvingPickerImdb, setResolvingPickerImdb] = useState(false);
  const [pickerImdbChecked, setPickerImdbChecked] = useState(false);
  const [isPickerCinemaExclusive, setIsPickerCinemaExclusive] = useState(false);
  const [availablePickerChannels, setAvailablePickerChannels] = useState<Array<1 | 2 | 3> | null>(
    null
  );
  const [checkingChannels, setCheckingChannels] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
  const [tvDetail, setTvDetail] = useState<TMDBMediaDetail | null>(null);
  const [loadingTvDetail, setLoadingTvDetail] = useState(false);
  const [seasonEpisodes, setSeasonEpisodes] = useState<TMDBEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Player state inside the room (identical channel lifecycle to StreamingPlayerModal)
  const [currentChannel, setCurrentChannel] = useState<1 | 2 | 3>(1);
  const [resolvedRoomImdb, setResolvedRoomImdb] = useState<string | null>(null);
  const [resolvingRoomImdb, setResolvingRoomImdb] = useState(false);
  const [activeRoomChannels, setActiveRoomChannels] = useState<Array<1 | 2 | 3> | null>(null);
  const [activeIsCinemaExclusive, setActiveIsCinemaExclusive] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const [roomIframeFillZoom, setRoomIframeFillZoom] = useState(false);
  const [remoteSyncNotice, setRemoteSyncNotice] = useState<string | null>(null);

  // Official Love Flix Opening Intro State
  const [isPlayingIntro, setIsPlayingIntro] = useState(false);
  const [introTimeRemaining, setIntroTimeRemaining] = useState(8);
  const [isIntroMuted, setIsIntroMuted] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const introVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastIntroContentKeyRef = useRef<string | null>(null);
  const waitIntroStreamKeyRef = useRef<string | null>(null);
  const waitIntroFlagRef = useRef<boolean>(false);
  const initialStartAtRef = useRef<number>(0);
  const initialPausedRef = useRef<boolean>(false);
  const hostLivePlaybackRef = useRef<{
    positionSec: number;
    paused: boolean;
    playbackRate: number;
    updatedAtMs: number;
  } | null>(null);
  const lastHostHeartbeatSentAtRef = useRef<number>(0);
  const suppressOutgoingSyncUntilRef = useRef<number>(0);
  const remoteNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptedAutoRoomRef = useRef<string | null>(null);

  useEffect(() => {
    const syncFsState = () => {
      const fsDoc = document as Document & { webkitFullscreenElement?: Element | null };
      const isFs = Boolean(document.fullscreenElement || fsDoc.webkitFullscreenElement);
      setIsStageFullscreen(isFs);
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
    setRoomIframeFillZoom(false);
  }, [syncedMedia?.tmdbId, currentChannel, syncedMedia?.season, syncedMedia?.episode]);

  const toggleRoomStageFullscreen = useCallback(() => {
    const fsDoc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const activeFs = document.fullscreenElement || fsDoc.webkitFullscreenElement;
    if (activeFs) {
      try {
        const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
        orientation?.unlock?.();
      } catch {}
      try {
        if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
          document.exitFullscreen().catch(() => {});
        } else if (fsDoc.webkitExitFullscreen) {
          fsDoc.webkitExitFullscreen();
        }
      } catch {}
      return;
    }

    const el = videoStageRef.current as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    }) | null;
    if (!el) return;
    try {
      if (typeof el.requestFullscreen === 'function') {
        el.requestFullscreen()
          .then(() => {
            try {
              const orientation = screen.orientation as ScreenOrientation & {
                lock?: (o: string) => Promise<void>;
              };
              orientation?.lock?.('landscape')?.catch?.(() => {});
            } catch {}
          })
          .catch(() => {});
      } else if (typeof el.webkitRequestFullscreen === 'function') {
        el.webkitRequestFullscreen();
      } else if (typeof el.msRequestFullscreen === 'function') {
        el.msRequestFullscreen();
      }
    } catch {}
  }, []);

  const effectiveRoomImdb = useMemo(() => {
    if (syncedMedia?.imdbId && /^tt\d+/i.test(syncedMedia.imdbId)) {
      return syncedMedia.imdbId;
    }
    if (resolvedRoomImdb && /^tt\d+/i.test(resolvedRoomImdb)) {
      return resolvedRoomImdb;
    }
    return null;
  }, [resolvedRoomImdb, syncedMedia?.imdbId]);

  const currentRoomContentKey =
    isConnected && syncedMedia
      ? `${syncedMedia.mediaType}-${syncedMedia.tmdbId}-${syncedMedia.season || 0}-${syncedMedia.episode || 0}`
      : null;
  const isIntroPendingForCurrentContent = Boolean(
    currentRoomContentKey && lastIntroContentKeyRef.current !== currentRoomContentKey
  );
  const effectiveIsPlayingIntro = isPlayingIntro || isIntroPendingForCurrentContent;

  const notifyIframeIntroEnded = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: 'LOVEFLIX_END_INTRO' }, '*');
    } catch {
      // ignore
    }
  }, []);

  const pushRoomPlaybackToIframe = useCallback(() => {
    if (!syncedPlayback || !iframeRef.current?.contentWindow) return;
    const liveSec = getLiveRoomPositionSec(syncedPlayback);
    if (liveSec > 1.2 || syncedPlayback.paused) {
      suppressOutgoingSyncUntilRef.current = Date.now() + 900;
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
  }, [getLiveRoomPositionSec, syncedPlayback]);

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
    pushRoomPlaybackToIframe();
  }, [notifyIframeIntroEnded, pushRoomPlaybackToIframe]);

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

  // Track room media changes to trigger the official opening once per title / episode
  useEffect(() => {
    if (!isConnected || !syncedMedia) {
      lastIntroContentKeyRef.current = null;
      waitIntroStreamKeyRef.current = null;
      waitIntroFlagRef.current = false;
      setIsPlayingIntro(false);
      return;
    }

    const contentKey = `${syncedMedia.mediaType}-${syncedMedia.tmdbId}-${syncedMedia.season || 0}-${syncedMedia.episode || 0}`;
    if (lastIntroContentKeyRef.current !== contentKey) {
      lastIntroContentKeyRef.current = contentKey;
      setIsPlayingIntro(true);
      setIntroTimeRemaining(8);
      setIsIntroMuted(false);
    }
  }, [
    isConnected,
    syncedMedia?.tmdbId,
    syncedMedia?.mediaType,
    syncedMedia?.season,
    syncedMedia?.episode,
  ]);

  // Notify preloaded Canal 1 iframe as soon as the official opening ends
  useEffect(() => {
    if (isConnected && syncedMedia && !effectiveIsPlayingIntro) {
      notifyIframeIntroEnded();
    }
  }, [isConnected, syncedMedia, effectiveIsPlayingIntro, notifyIframeIntroEnded]);

  // Autoplay intro video with full audio upon launch
  useEffect(() => {
    if (!isPlayingIntro || !isConnected || !syncedMedia) return;

    const video = introVideoRef.current;
    if (!video) return;

    video.currentTime = 0;
    video.volume = 1;
    video.muted = false;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        video.muted = true;
        setIsIntroMuted(true);
        video.play().catch(() => {});
      });
    }
  }, [
    isPlayingIntro,
    isConnected,
    syncedMedia?.tmdbId,
    syncedMedia?.season,
    syncedMedia?.episode,
  ]);

  // Space/Enter shortcut to skip the intro (ignoring typing inside chat/inputs)
  useEffect(() => {
    if (!isConnected || !syncedMedia || !isPlayingIntro) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleEndIntro();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isConnected, syncedMedia, isPlayingIntro, handleEndIntro]);

  // Keep player channel in sync with room state
  useEffect(() => {
    if (syncedMedia?.channel) {
      setCurrentChannel(syncedMedia.channel);
    }
  }, [syncedMedia?.channel]);

  // Auto-connect if arrived via ?sala=... or route query (one attempt per code)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetRoom = (route.query || params.get('sala') || params.get('room') || '')
      .trim()
      .toUpperCase();
    if (!targetRoom || isConnected || connecting) return;
    if (attemptedAutoRoomRef.current === targetRoom) return;
    attemptedAutoRoomRef.current = targetRoom;

    void connectExternalRoom({
      roomId: targetRoom,
      mode: 'join',
      userName: profile?.name || 'Love Flix',
    }).then((ok) => {
      if (!ok) {
        setFlowState('join');
        setInputRoomCode(targetRoom);
        setJoinError('Sala não encontrada ou encerrada. Confira o código.');
      }
    });
  }, [route.query, isConnected, connecting, connectExternalRoom, profile?.name]);

  // Load popular suggestions when entering search flow
  useEffect(() => {
    if (flowState !== 'search') return;
    let cancelled = false;
    setLoadingSuggestions(true);
    tmdbService
      .getTrending('all', 'week', 1)
      .then((res) => {
        if (!cancelled) {
          setPopularSuggestions((res.results || []).slice(0, 12));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [flowState]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search query execution (with strict cinema-only filter applied by tmdbService)
  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    tmdbService
      .searchMulti(debouncedSearch, 1)
      .then((res) => {
        if (!cancelled) {
          const valid = (res.results || []).filter(
            (m) => m && (m.media_type === 'movie' || m.media_type === 'tv')
          );
          setSearchResults(valid.slice(0, 16));
        }
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  // Load TV show details and seasons when selecting a series
  useEffect(() => {
    if (!selectedItem || selectedItem.media_type !== 'tv') {
      setTvDetail(null);
      setSeasonEpisodes([]);
      return;
    }
    let cancelled = false;
    setLoadingTvDetail(true);
    tmdbService
      .getTVDetails(selectedItem.id)
      .then((detail) => {
        if (cancelled) return;
        setTvDetail(detail);
        const validSeasons = (detail.seasons || []).filter((s) => s.season_number > 0);
        const initialSeason = validSeasons[0]?.season_number || 1;
        setSelectedSeason(initialSeason);
        setSelectedEpisode(1);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingTvDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedItem]);

  // Load episodes when season changes
  useEffect(() => {
    if (!selectedItem || selectedItem.media_type !== 'tv' || !selectedSeason) return;
    let cancelled = false;
    setLoadingEpisodes(true);
    tmdbService
      .getTVSeasonDetails(selectedItem.id, selectedSeason)
      .then((seasonData) => {
        if (!cancelled) {
          setSeasonEpisodes(seasonData?.episodes || []);
        }
      })
      .catch(() => {
        if (!cancelled) setSeasonEpisodes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingEpisodes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedItem, selectedSeason]);

  // Resolve IMDb ID + cinema-exclusive status before probing channels in picker
  useEffect(() => {
    if (flowState !== 'channel_select' || !selectedItem) {
      setPrefetchedPickerImdb(null);
      setResolvingPickerImdb(false);
      setPickerImdbChecked(false);
      setAvailablePickerChannels(null);
      setCheckingChannels(false);
      setIsPickerCinemaExclusive(false);
      return;
    }

    let cancelled = false;
    const isTv = selectedItem.media_type === 'tv';

    if (!isTv) {
      isCinemaOnlyMovie(selectedItem.id)
        .then((isOnly) => {
          if (!cancelled) setIsPickerCinemaExclusive(isOnly);
        })
        .catch(() => {
          if (!cancelled) setIsPickerCinemaExclusive(false);
        });
    } else {
      setIsPickerCinemaExclusive(false);
    }

    const existingImdb = (selectedItem as Partial<TMDBMediaDetail>).imdb_id;
    if (existingImdb && /^tt\d+/i.test(existingImdb)) {
      setPrefetchedPickerImdb(existingImdb);
      setResolvingPickerImdb(false);
      setPickerImdbChecked(true);
      return () => {
        cancelled = true;
      };
    }

    setPrefetchedPickerImdb(null);
    setResolvingPickerImdb(true);
    setPickerImdbChecked(false);

    tmdbService
      .getImdbId(isTv ? 'tv' : 'movie', selectedItem.id)
      .then((found) => {
        if (!cancelled) setPrefetchedPickerImdb(found);
      })
      .catch(() => {
        if (!cancelled) setPrefetchedPickerImdb(null);
      })
      .finally(() => {
        if (!cancelled) {
          setResolvingPickerImdb(false);
          setPickerImdbChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [flowState, selectedItem]);

  // Verify real channel availability whenever IMDb, title, season, or episode changes
  useEffect(() => {
    if (flowState !== 'channel_select' || !selectedItem || !pickerImdbChecked || isPickerCinemaExclusive) {
      return;
    }
    let cancelled = false;
    const isTv = selectedItem.media_type === 'tv';
    setCheckingChannels(true);

    tmdbService
      .getChannelAvailability({
        mediaType: isTv ? 'tv' : 'movie',
        id: selectedItem.id,
        imdbId: prefetchedPickerImdb,
        season: isTv ? selectedSeason : undefined,
        episode: isTv ? selectedEpisode : undefined,
      })
      .then((res) => {
        if (cancelled) return;
        const available = res.availableChannels || [];
        setAvailablePickerChannels(available);
        if (available.length > 0) {
          setSelectedChannel((prev) =>
            available.includes(prev) ? prev : res.recommendedChannel || available[0]
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailablePickerChannels([]);
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingChannels(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    flowState,
    selectedItem,
    pickerImdbChecked,
    prefetchedPickerImdb,
    isPickerCinemaExclusive,
    selectedSeason,
    selectedEpisode,
  ]);

  // Auto-scroll chat feed
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Handle joining existing room (strict validation: fails if room does not exist)
  const handleJoinExistingRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    let clean = inputRoomCode.trim();
    if (!clean) return;

    if (clean.includes('sala=')) {
      try {
        const u = new URL(clean, window.location.origin);
        clean = u.searchParams.get('sala') || clean;
      } catch {
        // ignore
      }
    } else if (clean.includes('/sessao-flix/')) {
      clean = clean.split('/sessao-flix/')[1] || clean;
    }

    clean = clean.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
    if (clean.length < 3) {
      setJoinError('Código de sala inválido.');
      pushToast('Código de sala inválido.');
      return;
    }

    setJoinError(null);
    setIsSubmitting(true);
    try {
      const ok = await connectExternalRoom({
        roomId: clean,
        mode: 'join',
        userName: profile?.name || 'Love Flix',
      });
      if (ok) {
        pushToast(`Conectado à Sessão ${clean}!`, 'accent');
        setInputRoomCode('');
        setJoinError(null);
        setFlowState('initial');
      } else {
        const errText =
          lastConnectionError ||
          'Sala não encontrada ou encerrada. Confira o código com quem abriu a sala.';
        setJoinError(errText);
        pushToast(errText);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // User clicked a title in the search flow
  const handlePickMediaForChannelSelection = (item: TMDBMediaItem) => {
    setSelectedItem(item);
    setSelectedChannel(1);
    setAvailablePickerChannels(null);
    setPrefetchedPickerImdb(null);
    setPickerImdbChecked(false);
    setIsPickerCinemaExclusive(false);
    setSelectedSeason(1);
    setSelectedEpisode(1);
    setFlowState('channel_select');
  };

  // Final step: Confirm channel and atomically create the room with selected media + welcome message
  const handleConfirmAndOpenRoom = async () => {
    if (!selectedItem) {
      pushToast('Selecione um filme ou série antes de abrir a sala.');
      return;
    }
    if (isPickerCinemaExclusive) {
      pushToast('Este filme ainda está em exibição exclusiva nos cinemas.');
      return;
    }
    if (!availablePickerChannels || availablePickerChannels.length === 0) {
      pushToast('Nenhum canal disponível para este título no momento.');
      return;
    }

    const chosenChannel = availablePickerChannels.includes(selectedChannel)
      ? selectedChannel
      : availablePickerChannels[0];

    setIsSubmitting(true);
    try {
      const code = generateRoomCode();
      const mediaType = selectedItem.media_type === 'tv' ? 'tv' : 'movie';
      const title = getMediaTitle(selectedItem);
      const selectedEpisodeObj =
        mediaType === 'tv'
          ? seasonEpisodes.find((ep) => ep.episode_number === selectedEpisode)
          : undefined;

      const createdRoomId = await createRoom({
        customId: code,
        initialMedia: {
          mediaType,
          tmdbId: selectedItem.id,
          imdbId: prefetchedPickerImdb || undefined,
          title,
          posterPath: selectedItem.poster_path || null,
          backdropPath: selectedItem.backdrop_path || null,
          season: mediaType === 'tv' ? selectedSeason : undefined,
          episode: mediaType === 'tv' ? selectedEpisode : undefined,
          episodeTitle: selectedEpisodeObj?.name || undefined,
          channel: chosenChannel,
        },
        initialWelcomeMessage: buildSessionWelcomeMessage(code),
      });

      if (!createdRoomId) {
        pushToast('Não foi possível abrir a sala. Tente novamente.');
        return;
      }

      pushToast(`Sala ${createdRoomId} aberta com sucesso!`, 'accent');
      setFlowState('initial');
      setSelectedItem(null);
      setSearchQuery('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyRoomId = async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      setCopiedLink(true);
      pushToast('ID da sala copiado com sucesso!', 'accent');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      pushToast(`ID da sala: ${roomId}`);
    }
  };

  // Send message to chat
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput);
    setChatInput('');
  };

  // Switch channel inside active watch room (broadcasts to room)
  const handleSwitchRoomChannel = useCallback(
    async (nextChannel: 1 | 2 | 3) => {
      if (!syncedMedia || nextChannel === currentChannel) return;
      setCurrentChannel(nextChannel);
      await syncMediaToExternalRoom({
        mediaType: syncedMedia.mediaType,
        tmdbId: syncedMedia.tmdbId,
        imdbId: effectiveRoomImdb || syncedMedia.imdbId,
        title: syncedMedia.title,
        posterPath: syncedMedia.posterPath,
        backdropPath: syncedMedia.backdropPath,
        season: syncedMedia.season,
        episode: syncedMedia.episode,
        episodeTitle: syncedMedia.episodeTitle,
        channel: nextChannel,
      });
    },
    [currentChannel, effectiveRoomImdb, syncMediaToExternalRoom, syncedMedia]
  );

  // Resolve IMDb ID for active room media if missing (ensures Canal 1 works identically)
  useEffect(() => {
    if (!isConnected || !syncedMedia) {
      setResolvedRoomImdb(null);
      setResolvingRoomImdb(false);
      setActiveRoomChannels(null);
      return;
    }

    if (syncedMedia.imdbId && /^tt\d+/i.test(syncedMedia.imdbId)) {
      setResolvedRoomImdb(syncedMedia.imdbId);
      setResolvingRoomImdb(false);
      return;
    }

    let cancelled = false;
    setResolvedRoomImdb(null);
    setResolvingRoomImdb(true);

    tmdbService
      .getImdbId(syncedMedia.mediaType, syncedMedia.tmdbId)
      .then((found) => {
        if (!cancelled) setResolvedRoomImdb(found);
      })
      .catch(() => {
        if (!cancelled) setResolvedRoomImdb(null);
      })
      .finally(() => {
        if (!cancelled) setResolvingRoomImdb(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isConnected, syncedMedia?.tmdbId, syncedMedia?.mediaType, syncedMedia?.imdbId]);

  // Check if active room movie is exclusive to theaters
  useEffect(() => {
    if (!isConnected || !syncedMedia || syncedMedia.mediaType !== 'movie') {
      setActiveIsCinemaExclusive(false);
      return;
    }
    let cancelled = false;
    isCinemaOnlyMovie(syncedMedia.tmdbId)
      .then((isOnly) => {
        if (!cancelled) setActiveIsCinemaExclusive(isOnly);
      })
      .catch(() => {
        if (!cancelled) setActiveIsCinemaExclusive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected, syncedMedia?.tmdbId, syncedMedia?.mediaType]);

  // Verify real 3-channel availability inside the active room (identical to StreamingPlayerModal)
  useEffect(() => {
    if (!isConnected || !syncedMedia || resolvingRoomImdb) return;
    let cancelled = false;

    tmdbService
      .getChannelAvailability({
        mediaType: syncedMedia.mediaType,
        id: syncedMedia.tmdbId,
        imdbId: effectiveRoomImdb,
        season: syncedMedia.season,
        episode: syncedMedia.episode,
      })
      .then((info) => {
        if (!cancelled) setActiveRoomChannels(info.availableChannels);
      })
      .catch(() => {
        if (!cancelled) setActiveRoomChannels([]);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isConnected,
    syncedMedia?.tmdbId,
    syncedMedia?.mediaType,
    syncedMedia?.season,
    syncedMedia?.episode,
    effectiveRoomImdb,
    resolvingRoomImdb,
  ]);

  // Auto-switch away if current channel turns out to be unavailable
  useEffect(() => {
    if (!isConnected || !syncedMedia || activeRoomChannels === null || activeRoomChannels.length === 0) {
      return;
    }
    if (!activeRoomChannels.includes(currentChannel)) {
      void handleSwitchRoomChannel(activeRoomChannels[0]);
    }
  }, [isConnected, syncedMedia, activeRoomChannels, currentChannel, handleSwitchRoomChannel]);

  // Reset host live playback cache whenever the room or active media changes
  useEffect(() => {
    hostLivePlaybackRef.current = null;
    lastHostHeartbeatSentAtRef.current = 0;
  }, [roomId, syncedMedia?.tmdbId, syncedMedia?.season, syncedMedia?.episode]);

  // Register live authoritative playback getter for the host so joining peers receive exact host time
  useEffect(() => {
    if (!isConnected || !isHost) {
      registerLivePlaybackGetter(null);
      return;
    }

    registerLivePlaybackGetter(() => {
      const live = hostLivePlaybackRef.current;
      if (!live) return null;
      const elapsedSec = live.paused ? 0 : Math.max(0, (Date.now() - live.updatedAtMs) / 1000);
      return {
        positionSec: Math.max(0, live.positionSec + elapsedSec * (live.playbackRate || 1)),
        paused: live.paused,
        playbackRate: live.playbackRate || 1,
      };
    });

    return () => registerLivePlaybackGetter(null);
  }, [isConnected, isHost, registerLivePlaybackGetter]);

  // Listen for player iframe events (intro release, fallback, READY sync, host-authoritative time & events)
  useEffect(() => {
    if (!isConnected || !syncedMedia) return;

    const onMessage = (event: MessageEvent) => {
      const d = event.data;
      if (!d || typeof d !== 'object') return;

      if (d.type === 'LOVEFLIX_CHANNEL_FALLBACK') {
        const pool =
          activeRoomChannels && activeRoomChannels.length > 0
            ? activeRoomChannels
            : ([] as Array<1 | 2 | 3>);
        const nextChannel = pool.find((c) => c !== currentChannel);
        setActiveRoomChannels((prev) =>
          prev ? prev.filter((c) => c !== currentChannel) : prev
        );
        if (nextChannel) {
          void handleSwitchRoomChannel(nextChannel);
        }
        return;
      }

      if (d.type === 'LOVEFLIX_TOGGLE_FULLSCREEN') {
        toggleRoomStageFullscreen();
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

      if (d.type === 'LOVEFLIX_PLAYER_READY' && iframeRef.current?.contentWindow) {
        if (!isHost && !effectiveIsPlayingIntro) {
          pushRoomPlaybackToIframe();
        }
        return;
      }

      if (d.type === 'LOVEFLIX_PLAYER_TIME') {
        const pos = Number(d.positionSec);
        if (!Number.isFinite(pos) || pos < 0) return;
        const paused = Boolean(d.paused);
        const rate = Number(d.playbackRate) || 1;

        if (isHost && !effectiveIsPlayingIntro) {
          hostLivePlaybackRef.current = {
            positionSec: pos,
            paused,
            playbackRate: rate,
            updatedAtMs: Date.now(),
          };
          const expectedSec = syncedPlayback ? getLiveRoomPositionSec(syncedPlayback) : 0;
          const drift = Math.abs(pos - expectedSec);
          const pausedMismatch = syncedPlayback ? syncedPlayback.paused !== paused : false;
          if (
            (drift > 2.2 || pausedMismatch) &&
            Date.now() - lastHostHeartbeatSentAtRef.current > 4500
          ) {
            lastHostHeartbeatSentAtRef.current = Date.now();
            syncPlaybackToExternalRoom({
              action: 'sync',
              positionSec: pos,
              paused,
              playbackRate: rate,
            });
          }
        }
        return;
      }

      if (d.type === 'LOVEFLIX_PLAYER_EVENT') {
        // Only the host drives room playback so joining/buffering guests never pause or interrupt the session
        if (!isHost) return;
        if (Date.now() < suppressOutgoingSyncUntilRef.current) return;
        const action = String(d.action || '') as ExternalPlaybackAction;
        if (action === 'play' || action === 'pause' || action === 'seek' || action === 'ratechange') {
          const pos = Number(d.positionSec) || 0;
          const paused = Boolean(d.paused);
          const rate = Number(d.playbackRate) || 1;
          hostLivePlaybackRef.current = {
            positionSec: pos,
            paused,
            playbackRate: rate,
            updatedAtMs: Date.now(),
          };
          syncPlaybackToExternalRoom({
            action,
            positionSec: pos,
            paused,
            playbackRate: rate,
          });
        }
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [
    activeRoomChannels,
    currentChannel,
    effectiveIsPlayingIntro,
    getLiveRoomPositionSec,
    handleSwitchRoomChannel,
    isConnected,
    isHost,
    notifyIframeIntroEnded,
    pushRoomPlaybackToIframe,
    syncPlaybackToExternalRoom,
    syncedMedia,
    syncedPlayback,
    toggleRoomStageFullscreen,
  ]);

  // Subscribe to remote playback commands (play, pause, seek, sync) from the host
  useEffect(() => {
    if (!isConnected) return;

    return subscribeRemotePlayback((playback, liveSec) => {
      if (isHost) return;

      if (iframeRef.current?.contentWindow && !effectiveIsPlayingIntro) {
        suppressOutgoingSyncUntilRef.current = Date.now() + 1200;
        const command =
          playback.action === 'seek'
            ? 'seek'
            : playback.action === 'sync'
            ? 'sync'
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
      const actor = playback.actorName || 'Sala';
      const label =
        playback.action === 'pause'
          ? `${actor} pausou em ${stamp}`
          : playback.action === 'seek'
          ? `${actor} sincronizou para ${stamp}`
          : playback.action === 'play'
          ? `${actor} deu play em ${stamp}`
          : null;

      if (label) {
        setRemoteSyncNotice(label);
        if (remoteNoticeTimerRef.current) clearTimeout(remoteNoticeTimerRef.current);
        remoteNoticeTimerRef.current = setTimeout(() => {
          setRemoteSyncNotice(null);
        }, 2600);
      }
    });
  }, [effectiveIsPlayingIntro, isConnected, isHost, subscribeRemotePlayback]);

  // Compute stream URL & identity key identically to StreamingPlayerModal
  const streamIdentityKey = syncedMedia
    ? `${syncedMedia.tmdbId}-${effectiveRoomImdb || 'tmdb'}-${currentChannel}-${syncedMedia.season || 0}-${syncedMedia.episode || 0}-${preferredAudio}-${preferredSubtitles}-${preferredQuality}`
    : '';

  if (!syncedMedia) {
    waitIntroStreamKeyRef.current = null;
    waitIntroFlagRef.current = false;
    initialStartAtRef.current = 0;
    initialPausedRef.current = false;
  } else if (waitIntroStreamKeyRef.current !== streamIdentityKey) {
    waitIntroStreamKeyRef.current = streamIdentityKey;
    waitIntroFlagRef.current = currentChannel === 1 && effectiveIsPlayingIntro;
    const liveAtMount = !isHost && syncedPlayback ? getLiveRoomPositionSec(syncedPlayback) : 0;
    initialStartAtRef.current = liveAtMount > 1.5 ? Math.floor(liveAtMount) : 0;
    initialPausedRef.current = Boolean(!isHost && syncedPlayback?.paused);
  }

  const streamSrc = useMemo(() => {
    if (!syncedMedia || resolvingRoomImdb) return null;
    const superCdnType = syncedMedia.mediaType === 'tv' ? 'tvshow' : 'movie';
    const streamParams = new URLSearchParams({
      type: superCdnType,
      imdb: effectiveRoomImdb || '',
      tmdbId: String(syncedMedia.tmdbId),
      channel: String(currentChannel),
      audioPref: preferredAudio,
      subPref: preferredSubtitles,
      qualityPref: preferredQuality,
    });
    if (superCdnType === 'tvshow') {
      streamParams.set('season', String(syncedMedia.season || 1));
      streamParams.set('episode', String(syncedMedia.episode || 1));
    }
    if (currentChannel === 1 && waitIntroFlagRef.current) {
      streamParams.set('waitIntro', '1');
    }
    if (currentChannel === 1 && initialStartAtRef.current > 0) {
      streamParams.set('startAt', String(initialStartAtRef.current));
    }
    if (currentChannel === 1 && initialPausedRef.current) {
      streamParams.set('paused', '1');
    }
    return `/api/supercdn/stream?${streamParams.toString()}`;
  }, [
    syncedMedia,
    resolvingRoomImdb,
    effectiveRoomImdb,
    currentChannel,
    preferredAudio,
    preferredSubtitles,
    preferredQuality,
  ]);

  useEffect(() => {
    setIframeLoading(true);
  }, [streamSrc]);

  // =========================================================================
  // VIEW A: DEDICATED WATCH ROOM
  // =========================================================================
  if (isConnected && roomId) {
    const canPreloadBehindIntro = currentChannel === 1 || currentChannel === 2;
    const shouldMountIframe =
      Boolean(streamSrc && streamSrc.trim()) &&
      (!effectiveIsPlayingIntro || canPreloadBehindIntro);
    const noRoomChannelsAvailable =
      activeRoomChannels !== null && activeRoomChannels.length === 0;

    return (
      <div className="fixed inset-0 z-[100] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#050505] text-white">
        <main className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="relative flex shrink-0 flex-col bg-black lg:min-h-0 lg:flex-1">
            {/* Minimal Top Bar: Exit + Participants Count only */}
            <header className="z-20 flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] bg-[#080808] px-3 sm:px-5">
              <button
                type="button"
                onClick={() => {
                  setIsParticipantsOpen(false);
                  disconnectExternalRoom();
                }}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-[#141414] px-2.5 text-xs font-bold text-white transition-colors hover:bg-[#E50914] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E50914]"
                title="Sair da sala"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sair</span>
              </button>

              <button
                type="button"
                onClick={() => setIsParticipantsOpen(true)}
                aria-label="Abrir participantes"
                aria-expanded={isParticipantsOpen}
                className="relative flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-[#141414] px-3 text-xs font-bold text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E50914]"
                title="Pessoas na sala"
              >
                <UserRound className="h-3.5 w-3.5 text-[#FF6470]" />
                <span>{Math.max(1, peers.length)}</span>
              </button>
            </header>

            <div
              id="SuperCDNContainerVideo"
              ref={videoStageRef}
              className={`relative flex items-center justify-center overflow-hidden bg-black ${
                isStageFullscreen
                  ? 'w-screen h-screen max-h-none'
                  : 'w-full aspect-video max-h-[42dvh] shrink-0 lg:aspect-auto lg:max-h-none lg:flex-1 lg:min-h-0'
              }`}
            >
              {/* Official Love Flix Opening Video with Sound (identical to StreamingPlayerModal) */}
              {syncedMedia && effectiveIsPlayingIntro && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-black select-none">
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
                    className="h-full w-full object-contain pointer-events-none"
                  />

                  <div className="pointer-events-none absolute left-3 top-3 z-50 flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1 backdrop-blur-md">
                    <span className="h-2 w-2 rounded-full bg-[#E50914] animate-ping" />
                    <span className="text-[10px] sm:text-[11px] font-extrabold tracking-wider text-white uppercase">
                      Abertura Oficial Love Flix
                    </span>
                  </div>

                  <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 z-50 flex items-center gap-2">
                    {isIntroMuted ? (
                      <button
                        type="button"
                        onClick={toggleIntroSound}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/20 bg-[#E50914] px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-bold text-white shadow-2xl transition-all hover:bg-[#FF253A] active:scale-95 animate-pulse"
                        title="Ativar som da abertura"
                      >
                        <VolumeX className="h-4 w-4" />
                        <span>Ativar Som</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={toggleIntroSound}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/15 bg-black/75 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs font-bold text-white/90 backdrop-blur-md transition-all hover:bg-[#1f1f1f]"
                        title="Silenciar áudio da abertura"
                      >
                        <Volume2 className="h-4 w-4 text-[#FF253A]" />
                        <span className="hidden sm:inline">Som Ativo</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleEndIntro}
                      className="group inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/20 bg-black/75 px-3 py-1.5 sm:px-4 sm:py-2 text-xs font-bold text-white shadow-2xl backdrop-blur-md transition-all hover:border-transparent hover:bg-[#E50914] active:scale-95"
                      title="Pular abertura oficial"
                    >
                      <SkipForward className="h-4 w-4 fill-current transition-transform group-hover:translate-x-0.5" />
                      <span>Pular Abertura</span>
                      <span className="text-[#A1A1A1] tabular-nums group-hover:text-white">
                        ({Math.ceil(introTimeRemaining)}s)
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {remoteSyncNotice && !effectiveIsPlayingIntro && (
                <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-black/80 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur-md">
                  {remoteSyncNotice}
                </div>
              )}

              {activeIsCinemaExclusive ? (
                <div className="flex h-full w-full items-center justify-center bg-[#080808] p-4 text-center">
                  <div className="max-w-md rounded-2xl border border-amber-500/30 bg-[#121212] p-5 shadow-2xl">
                    <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/20 text-amber-400">
                      <Clapperboard className="h-5 w-5" />
                    </div>
                    <p className="mb-1 text-sm font-bold text-white">Exclusivo nos Cinemas</p>
                    <p className="text-xs leading-relaxed text-[#A1A1A1]">
                      Este filme ainda está em exibição exclusiva nos cinemas e não foi liberado em plataformas digitais.
                    </p>
                  </div>
                </div>
              ) : noRoomChannelsAvailable ? (
                <div className="flex h-full w-full items-center justify-center bg-[#080808] p-4 text-center">
                  <div className="max-w-md rounded-2xl border border-white/10 bg-[#121212] p-5">
                    <p className="mb-1 text-sm font-bold text-white">
                      Transmissão indisponível no momento
                    </p>
                    <p className="text-xs leading-relaxed text-[#A1A1A1]">
                      Este título ou episódio ainda não está disponível em nenhum dos servidores de transmissão.
                    </p>
                  </div>
                </div>
              ) : syncedMedia ? (
                <>
                  {shouldMountIframe && streamSrc && (
                    <div
                      className={`relative flex h-full w-full max-h-full max-w-full items-center justify-center bg-black transition-transform duration-200 ${
                        isStageFullscreen ? '' : 'lg:aspect-video'
                      } ${currentChannel !== 1 && roomIframeFillZoom ? 'scale-[1.24]' : ''}`}
                    >
                      <iframe
                        ref={iframeRef}
                        key={streamIdentityKey}
                        src={streamSrc}
                        title={`${syncedMedia.title} — Canal ${currentChannel}`}
                        width="100%"
                        height="100%"
                        scrolling="no"
                        frameBorder="0"
                        referrerPolicy={currentChannel === 2 ? 'no-referrer' : undefined}
                        onLoad={() => setIframeLoading(false)}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowFullScreen
                        className={`h-full w-full border-0 bg-black ${
                          effectiveIsPlayingIntro ? 'pointer-events-none' : ''
                        }`}
                      />
                    </div>
                  )}
                  {isStageFullscreen && currentChannel !== 1 && (
                    <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setRoomIframeFillZoom((prev) => !prev)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold backdrop-blur-md transition-colors cursor-pointer ${
                          roomIframeFillZoom
                            ? 'border-[#FF253A] bg-[#E50914] text-white'
                            : 'border-white/15 bg-[#141414]/80 text-white hover:bg-[#222222]'
                        }`}
                        title={roomIframeFillZoom ? 'Formato original' : 'Preencher tela'}
                      >
                        <Scan className="h-3.5 w-3.5" />
                        <span>{roomIframeFillZoom ? 'Original' : 'Preencher'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={toggleRoomStageFullscreen}
                        aria-label="Sair da tela cheia"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-[#141414]/80 text-white backdrop-blur-md transition-colors hover:bg-[#222222] cursor-pointer"
                      >
                        <Minimize2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {(resolvingRoomImdb || iframeLoading) && !effectiveIsPlayingIntro && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#080808]">
                      <Loader2 className="h-8 w-8 animate-spin text-[#E50914]" />
                      <p className="text-xs font-bold text-[#A1A1A1]">
                        Conectando ao Canal {currentChannel}...
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white/60">
                  {isSubmitting ? (
                    <Loader2 className="h-7 w-7 animate-spin text-[#E50914]" />
                  ) : (
                    <Clapperboard className="h-9 w-9 text-white/30" />
                  )}
                  <p className="text-xs sm:text-sm font-semibold">
                    {isSubmitting ? 'Preparando sua sessão...' : 'Aguardando o conteúdo da sessão...'}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-white/10 bg-[#0E0E0E] lg:h-full lg:flex-none lg:border-l lg:border-t-0 lg:w-[370px] xl:w-[410px]">
            <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#111111] px-4">
              <span className="text-sm font-bold text-white/90">Chat da Sala</span>
            </header>

            <div
              ref={chatScrollRef}
              className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5 no-scrollbar"
            >
              {chatMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center text-[#A1A1A1]/70">
                  <p className="text-xs font-medium">O chat começa aqui.</p>
                </div>
              ) : (
                chatMessages.map((msg) => {
                  if (msg.peerId === 'system:notice') {
                    return (
                      <div key={msg.id} className="flex justify-center py-0.5">
                        <span className="rounded-lg bg-white/[0.05] px-3 py-1 text-center text-[11px] font-medium text-white/70">
                          {msg.text}
                        </span>
                      </div>
                    );
                  }

                  if (isSessionWelcomeMessage(msg.text)) {
                    const [headline, intro, invitation, idLabel, idValue, closing] =
                      msg.text.split('\n');
                    return (
                      <article
                        key={msg.id}
                        className="mx-auto w-full max-w-sm space-y-2.5 rounded-2xl border border-[#E50914]/25 bg-gradient-to-br from-[#251012] to-[#151112] p-3.5 shadow-lg shadow-black/20"
                      >
                        <div className="space-y-1">
                          <h2 className="text-sm font-extrabold leading-snug text-white">{headline}</h2>
                          <p className="text-xs leading-relaxed text-white/75">{intro}</p>
                          <p className="text-xs leading-relaxed text-white/75">{invitation}</p>
                        </div>
                        <div className="rounded-xl border border-[#E50914]/25 bg-black/30 px-3 py-2">
                          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#FF7A83]">
                            {idLabel}
                          </p>
                          <button
                            type="button"
                            onClick={handleCopyRoomId}
                            className="flex w-full items-center justify-between gap-2 text-left font-mono text-base sm:text-lg font-black tracking-wide text-white hover:text-[#FF7A83]"
                            title="Copiar ID da sala"
                          >
                            <span className="select-all">{idValue}</span>
                            {copiedLink ? (
                              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                            ) : (
                              <Copy className="h-4 w-4 shrink-0 text-[#E50914]" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs font-semibold text-white/85">{closing}</p>
                      </article>
                    );
                  }

                  const isMe = msg.peerId === peerId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-0.5`}
                    >
                      <div className="flex items-center gap-1.5 px-1">
                        <span
                          className={`text-[11px] font-bold ${
                            isMe ? 'text-[#E50914]' : 'text-white/80'
                          }`}
                        >
                          {msg.name}
                        </span>
                        <span className="text-[9px] text-[#666666]">
                          {new Date(msg.createdAtMs).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div
                        className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                          isMe
                            ? 'rounded-tr-none bg-[#E50914] text-white'
                            : 'rounded-tl-none border border-white/[0.06] bg-[#1D1D1D] text-white/95'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form
              onSubmit={handleSendChat}
              className="flex shrink-0 items-center gap-2 border-t border-white/[0.08] bg-[#121212] p-2.5"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Conversar na sala..."
                className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#1C1C1C] px-3.5 text-xs text-white placeholder:text-[#A1A1A1] focus:border-[#E50914] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E50914] text-white transition-transform hover:bg-[#FF253A] active:scale-95 disabled:opacity-40"
                title="Enviar mensagem"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </section>
        </main>

        {isParticipantsOpen && (
          <div
            className="absolute inset-0 z-30 bg-black/55 backdrop-blur-[2px]"
            role="presentation"
            onClick={() => setIsParticipantsOpen(false)}
          >
            <aside
              className="absolute bottom-0 right-0 top-0 flex w-[min(88vw,360px)] flex-col border-l border-white/10 bg-[#101010]/95 shadow-2xl backdrop-blur-xl"
              role="dialog"
              aria-modal="true"
              aria-label="Participantes da sala"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] px-5">
                <h2 className="text-base font-bold text-white">Participantes</h2>
                <button
                  type="button"
                  onClick={() => setIsParticipantsOpen(false)}
                  aria-label="Fechar participantes"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {peers.map((peer) => (
                  <div
                    key={peer.peerId}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.05]"
                  >
                    <img
                      src={peer.avatarSrc || LOVEFLIX_PRESET_AVATARS[0].src}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-full border border-[#E50914]/35 object-cover"
                      onError={(event) => {
                        event.currentTarget.src = LOVEFLIX_PRESET_AVATARS[0].src;
                      }}
                    />
                    <span className="min-w-0 truncate text-sm font-semibold text-white/90">
                      {peer.name}
                    </span>
                  </div>
                ))}
                {peers.length === 0 && (
                  <p className="px-2 py-4 text-sm text-white/50">Nenhum participante conectado.</p>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW B: CHANNEL & EPISODE SELECTOR MODAL (Step after picking title in search)
  // =========================================================================
  if (flowState === 'channel_select' && selectedItem) {
    const isTv = selectedItem.media_type === 'tv';
    const title = getMediaTitle(selectedItem);
    const validSeasons = (tvDetail?.seasons || []).filter((s) => s.season_number > 0);

    return (
      <div className="min-h-[85vh] py-8 px-4 sm:px-6 max-w-3xl mx-auto space-y-6">
        <button
          type="button"
          onClick={() => setFlowState('search')}
          className="inline-flex items-center gap-2 text-xs font-bold text-[#A1A1A1] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para a pesquisa</span>
        </button>

        <div className="rounded-2xl bg-[#121212] border border-white/10 p-6 space-y-6 shadow-2xl">
          {/* Header Preview of Selected Title */}
          <div className="flex items-center gap-4 pb-4 border-b border-white/[0.08]">
            <img
              src={getPosterUrl(selectedItem.poster_path, 'w185') || ''}
              alt={title}
              className="w-16 aspect-[2/3] rounded-lg object-cover border border-white/15 shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#E50914]">
                {isTv ? 'Série Selecionada' : 'Filme Selecionado'}
              </span>
              <h2 className="font-display text-lg sm:text-xl font-black text-white truncate">
                {title}
              </h2>
              <p className="text-xs text-[#A1A1A1] line-clamp-2">
                {selectedItem.overview || 'Escolha o canal de transmissão para abrir sua sala.'}
              </p>
            </div>
          </div>

          {/* Episode Selectors for Series */}
          {isTv && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#A1A1A1]">
                Temporada e Episódio:
              </h3>

              {loadingTvDetail ? (
                <div className="flex items-center gap-2 text-xs text-[#A1A1A1]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#E50914]" />
                  <span>Carregando temporadas...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Season dropdown */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-white/70">Temporada:</label>
                    <select
                      value={selectedSeason}
                      onChange={(e) => {
                        setSelectedSeason(Number(e.target.value));
                        setSelectedEpisode(1);
                      }}
                      className="w-full h-11 px-3 rounded-xl bg-[#1A1A1A] border border-white/10 text-xs font-bold text-white focus:border-[#E50914] focus:outline-none cursor-pointer"
                    >
                      {validSeasons.map((s) => (
                        <option key={s.id} value={s.season_number} className="bg-[#1A1A1A]">
                          Temporada {s.season_number} ({s.episode_count} episódios)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Episode dropdown */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-white/70">Episódio:</label>
                    <select
                      value={selectedEpisode}
                      onChange={(e) => setSelectedEpisode(Number(e.target.value))}
                      disabled={loadingEpisodes || seasonEpisodes.length === 0}
                      className="w-full h-11 px-3 rounded-xl bg-[#1A1A1A] border border-white/10 text-xs font-bold text-white focus:border-[#E50914] focus:outline-none cursor-pointer disabled:opacity-50"
                    >
                      {seasonEpisodes.map((ep) => (
                        <option key={ep.id} value={ep.episode_number} className="bg-[#1A1A1A]">
                          Episódio {ep.episode_number} — {ep.name || `Ep. ${ep.episode_number}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Channel Selector (only real available channels, identical to StreamingPlayerModal) */}
          {(() => {
            const isCheckingPicker =
              !isPickerCinemaExclusive &&
              (resolvingPickerImdb || checkingChannels || availablePickerChannels === null);
            const pickerChannels = availablePickerChannels
              ? CHANNELS.filter((ch) => availablePickerChannels.includes(ch.id))
              : [];

            return (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#A1A1A1]">
                      Selecione o Canal de Transmissão:
                    </h3>
                    {isCheckingPicker && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/60">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E50914]" />
                        <span>Verificando canais...</span>
                      </span>
                    )}
                  </div>

                  {isPickerCinemaExclusive ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-relaxed text-white/90">
                      <p className="font-bold text-amber-300 mb-1">Disponível apenas nos cinemas</p>
                      <p className="text-white/75">
                        Este filme ainda está em exibição exclusiva nos cinemas e não foi liberado nos canais de transmissão.
                      </p>
                    </div>
                  ) : isCheckingPicker ? (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#181818] py-5 text-xs font-semibold text-[#A1A1A1]">
                      <Loader2 className="h-4 w-4 animate-spin text-[#E50914]" />
                      <span>Verificando canais disponíveis...</span>
                    </div>
                  ) : pickerChannels.length === 0 ? (
                    <div className="rounded-xl border border-[#E50914]/35 bg-[#E50914]/10 p-4 text-xs font-semibold text-white/90">
                      Este título ou episódio ainda não está disponível nos canais de transmissão.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {pickerChannels.map((ch) => {
                        const isSelected = selectedChannel === ch.id;
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => setSelectedChannel(ch.id)}
                            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#E50914]/15 border-[#E50914] text-white shadow-lg'
                                : 'bg-[#181818] border-white/10 text-[#A1A1A1] hover:text-white hover:bg-[#202020]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-white">{ch.label}</span>
                              {isSelected && <span className="w-2 h-2 rounded-full bg-[#E50914]" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="button"
                  disabled={
                    isSubmitting ||
                    isPickerCinemaExclusive ||
                    isCheckingPicker ||
                    pickerChannels.length === 0
                  }
                  onClick={handleConfirmAndOpenRoom}
                  className="w-full h-12 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xl transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Abrir Sala com este Conteúdo</span>
                    </>
                  )}
                </button>
              </>
            );
          })()}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW C: SEARCH FLOW ("Abrir uma sala" was clicked)
  // =========================================================================
  if (flowState === 'search') {
    return (
      <div className="min-h-[85vh] py-8 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto space-y-6">
        {/* Back Button */}
        <button
          type="button"
          onClick={() => setFlowState('initial')}
          className="inline-flex items-center gap-2 text-xs font-bold text-[#A1A1A1] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para as opções de sala</span>
        </button>

        {/* Search Bar */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#A1A1A1]" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquise o filme, série ou anime que deseja assistir na sala..."
              className="w-full h-14 pl-12 pr-12 rounded-2xl bg-[#141414] border border-white/15 text-sm sm:text-base text-white placeholder:text-[#A1A1A1] focus:border-[#E50914] focus:outline-none transition-colors shadow-xl"
            />
            {searchLoading && (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-[#E50914]" />
            )}
          </div>
          <p className="text-[11px] text-[#A1A1A1] px-1">
            Filmes exclusivos de cinema não são exibidos até chegarem aos canais de transmissão.
          </p>
        </div>

        {/* Results List */}
        {searchResults.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[#A1A1A1] uppercase tracking-wider">
              Resultados da pesquisa:
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
              {searchResults.map((item) => (
                <div
                  key={`res-${item.id}`}
                  onClick={() => handlePickMediaForChannelSelection(item)}
                  className="group rounded-2xl overflow-hidden bg-[#141414] border border-white/10 hover:border-[#E50914] transition-all cursor-pointer shadow-lg flex flex-col"
                >
                  <div className="aspect-[2/3] relative overflow-hidden bg-[#1E1E1E]">
                    <img
                      src={getPosterUrl(item.poster_path, 'w342') || ''}
                      alt={getMediaTitle(item)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-bold text-white border border-white/10">
                      {item.media_type === 'tv' ? 'Série' : 'Filme'}
                    </div>
                  </div>
                  <div className="p-3 space-y-1.5 flex-1 flex flex-col justify-between">
                    <p className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-[#E50914] transition-colors">
                      {getMediaTitle(item)}
                    </p>
                    <span className="text-[11px] font-semibold text-[#A1A1A1] block">
                      Escolher e abrir sala →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : debouncedSearch ? (
          <div className="p-12 text-center text-[#A1A1A1] space-y-2">
            <p className="text-sm font-bold text-white">Nenhum título disponível encontrado</p>
            <p className="text-xs text-white/50">
              Verifique o nome digitado ou tente outro filme ou série.
            </p>
          </div>
        ) : (
          /* Popular suggestions when input is empty */
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#E50914]" />
              <h3 className="text-xs font-bold text-[#A1A1A1] uppercase tracking-wider">
                Sugestões Populares para Assistir Juntos:
              </h3>
            </div>

            {loadingSuggestions ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-[2/3] rounded-2xl bg-[#161616] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4">
                {popularSuggestions.map((item) => (
                  <div
                    key={`pop-${item.id}`}
                    onClick={() => handlePickMediaForChannelSelection(item)}
                    className="group rounded-2xl overflow-hidden bg-[#141414] border border-white/10 hover:border-[#E50914] transition-all cursor-pointer shadow-lg flex flex-col"
                  >
                    <div className="aspect-[2/3] relative overflow-hidden bg-[#1E1E1E]">
                      <img
                        src={getPosterUrl(item.poster_path, 'w342') || ''}
                        alt={getMediaTitle(item)}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-bold text-white border border-white/10">
                        {item.media_type === 'tv' ? 'Série' : 'Filme'}
                      </div>
                    </div>
                    <div className="p-3 space-y-1 flex-1 flex flex-col justify-between">
                      <p className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-[#E50914] transition-colors">
                        {getMediaTitle(item)}
                      </p>
                      <span className="text-[11px] font-semibold text-[#A1A1A1] block">
                        Escolher e abrir sala →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW D: INITIAL TWO-BUTTON STATE (Clean & Direct, exactly as requested)
  // - "Abrir uma sala"
  // - "Entrar em uma"
  // =========================================================================
  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 sm:px-6 py-12 max-w-xl mx-auto">
      <div className="w-full space-y-6 text-center">
        {/* Simple Title */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E50914]/10 border border-[#E50914]/20 text-[#E50914] text-xs font-bold">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Sessão Flix</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-black text-white tracking-tight">
            Assista Junto em Tempo Real
          </h1>
        </div>

        {/* Two Main Direct Options */}
        <div className="space-y-3 pt-2">
          {/* Button 1: Abrir uma sala */}
          <button
            type="button"
            onClick={() => setFlowState('search')}
            className="w-full h-14 rounded-2xl bg-[#E50914] hover:bg-[#FF253A] text-white text-base font-extrabold flex items-center justify-center gap-2.5 shadow-xl transition-transform active:scale-95 cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Abrir uma sala</span>
          </button>

          {/* Button 2: Entrar em uma */}
          <button
            type="button"
            onClick={() => setFlowState(flowState === 'join' ? 'initial' : 'join')}
            className="w-full h-14 rounded-2xl bg-[#161616] hover:bg-[#202020] border border-white/15 text-white text-base font-extrabold flex items-center justify-center gap-2.5 transition-transform active:scale-95 cursor-pointer"
          >
            <Users className="w-5 h-5 text-[#E50914]" />
            <span>Entrar em uma</span>
          </button>
        </div>

        {/* Sub-form: Appears only if user tapped "Entrar em uma" */}
        {flowState === 'join' && (
          <form
            onSubmit={handleJoinExistingRoom}
            className="p-5 rounded-2xl bg-[#121212] border border-white/10 space-y-3 text-left"
          >
            <label className="text-xs font-bold text-white/80 block">
              Digite o código da sala:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={inputRoomCode}
                onChange={(e) => {
                  setInputRoomCode(e.target.value.toUpperCase());
                  if (joinError) setJoinError(null);
                }}
                placeholder="Ex: FLIX-4829"
                className="flex-1 h-12 px-4 rounded-xl bg-[#1A1A1A] border border-white/15 text-sm font-mono font-bold text-white placeholder:text-[#A1A1A1]/50 focus:border-[#E50914] focus:outline-none tracking-wider uppercase"
              />
              <button
                type="submit"
                disabled={!inputRoomCode.trim() || isSubmitting || connecting}
                className="px-5 h-12 rounded-xl bg-[#E50914] hover:bg-[#FF253A] text-white text-xs font-extrabold disabled:opacity-40 transition-transform active:scale-95 cursor-pointer flex items-center justify-center shrink-0"
              >
                {isSubmitting || connecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Entrar</span>
                )}
              </button>
            </div>
            {joinError && (
              <p className="text-xs font-semibold text-[#FF7A83]">{joinError}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
