import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clapperboard,
  Copy,
  ExternalLink,
  Flame,
  Loader2,
  LogOut,
  Maximize2,
  Minimize2,
  Play,
  Radio,
  Search,
  Send,
  Sparkles,
  Tv,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useExternalRoom } from '../context/ExternalRoomContext';
import { useNavigation } from '../context/NavigationContext';
import { useUserData } from '../context/UserDataContext';
import {
  tmdbService,
  getMediaTitle,
  getPosterUrl,
  getBackdropUrl,
  isCinemaOnlyMovie,
} from '../services/tmdb';
import type { TMDBMediaItem, TMDBMediaDetail, TMDBSeasonDetail, TMDBEpisode } from '../types/tmdb';

const CHANNELS: Array<{ id: 1 | 2 | 3; label: string; desc: string }> = [
  { id: 1, label: 'Canal 1', desc: 'Embed Primário' },
  { id: 2, label: 'Canal 2', desc: 'SuperFlix HD' },
  { id: 3, label: 'Canal 3', desc: 'StreamBetter Rápido' },
];

export const SessaoFlixPage: React.FC = () => {
  const { route } = useNavigation();
  const { profile, pushToast } = useUserData();
  const {
    isConnected,
    connecting,
    roomId,
    syncedMedia,
    syncedPlayback,
    peers,
    chatMessages,
    createRoom,
    connectExternalRoom,
    disconnectExternalRoom,
    syncMediaToExternalRoom,
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
  const [selectedChannel, setSelectedChannel] = useState<1 | 2 | 3>(2);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
  const [tvDetail, setTvDetail] = useState<TMDBMediaDetail | null>(null);
  const [loadingTvDetail, setLoadingTvDetail] = useState(false);
  const [seasonEpisodes, setSeasonEpisodes] = useState<TMDBEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Player state inside the room
  const [currentChannel, setCurrentChannel] = useState<1 | 2 | 3>(2);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);

  // Orientation state to hide chat in landscape mode on mobile/tablets
  const [isLandscape, setIsLandscape] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const playerScreenRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Keep player channel in sync with room state
  useEffect(() => {
    if (syncedMedia?.channel) {
      setCurrentChannel(syncedMedia.channel);
    }
  }, [syncedMedia?.channel]);

  // Orientation detector (matches media query or screen dimensions)
  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window === 'undefined') return;
      const mql = window.matchMedia('(orientation: landscape)');
      // If width > height and viewport is mobile/tablet size, or orientation is landscape
      const landscape =
        mql.matches &&
        (window.innerWidth <= 1024 || window.innerHeight <= 600 || window.matchMedia('(hover: none) and (pointer: coarse)').matches);
      setIsLandscape(landscape);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Track native fullscreen
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Auto-connect if arrived via ?sala=... or route query
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetRoom = route.query || params.get('sala') || params.get('room');
    if (targetRoom && targetRoom.trim() && !isConnected && !connecting) {
      void connectExternalRoom({
        roomId: targetRoom.trim().toUpperCase(),
        userName: profile?.name || 'Love Flix',
      });
    }
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

  // Auto-scroll chat feed
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Handle joining room
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
      pushToast('Código de sala inválido.');
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await connectExternalRoom({
        roomId: clean,
        userName: profile?.name || 'Love Flix',
      });
      if (ok) {
        pushToast(`Conectado à Sessão ${clean}!`, 'accent');
        setInputRoomCode('');
        setFlowState('initial');
      } else {
        pushToast('Falha ao conectar à sala. Verifique o código.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // User clicked a title in the search flow
  const handlePickMediaForChannelSelection = (item: TMDBMediaItem) => {
    setSelectedItem(item);
    setSelectedChannel(2);
    setSelectedSeason(1);
    setSelectedEpisode(1);
    setFlowState('channel_select');
  };

  // Final step: Confirm channel and launch the room
  const handleConfirmAndOpenRoom = async () => {
    if (!selectedItem) return;
    setIsSubmitting(true);
    try {
      // 1. Create a new room code
      const newRoomId = await createRoom();
      if (!newRoomId) {
        pushToast('Não foi possível abrir a sala.');
        return;
      }

      const mediaType = selectedItem.media_type === 'tv' ? 'tv' : 'movie';
      const title = getMediaTitle(selectedItem);

      // 2. Put the selected movie/series directly into the created room
      await syncMediaToExternalRoom({
        mediaType,
        tmdbId: selectedItem.id,
        title,
        posterPath: selectedItem.poster_path || null,
        backdropPath: selectedItem.backdrop_path || null,
        season: mediaType === 'tv' ? selectedSeason : undefined,
        episode: mediaType === 'tv' ? selectedEpisode : undefined,
        channel: selectedChannel,
      });

      pushToast(`Sala ${newRoomId} aberta com sucesso!`, 'accent');
      setFlowState('initial');
      setSelectedItem(null);
      setSearchQuery('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy share invite link
  const handleCopyInviteLink = async () => {
    if (!roomId) return;
    const shareUrl = `${window.location.origin}/sessao-flix?sala=${encodeURIComponent(roomId)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      pushToast('Link da sala copiado com sucesso!', 'accent');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      pushToast(shareUrl);
    }
  };

  // Send message to chat
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput);
    setChatInput('');
  };

  // Switch channel directly in player
  const handleSwitchChannelInRoom = (channel: 1 | 2 | 3) => {
    setCurrentChannel(channel);
    setIframeLoading(true);
    if (syncedMedia) {
      void syncMediaToExternalRoom({
        ...syncedMedia,
        channel,
      });
    }
  };

  // Fullscreen controls
  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      try {
        if (typeof document.exitFullscreen === 'function') {
          document.exitFullscreen().catch(() => {});
        }
      } catch {
        // ignore
      }
    } else if (playerScreenRef.current) {
      try {
        const el = playerScreenRef.current as any;
        if (typeof el.requestFullscreen === 'function') {
          el.requestFullscreen().catch(() => {});
        } else if (typeof el.webkitRequestFullscreen === 'function') {
          el.webkitRequestFullscreen();
        }
      } catch {
        // ignore
      }
    }
  };

  // Compute stream URL for iframe
  const streamSrc = useMemo(() => {
    if (!syncedMedia) return null;
    const superCdnType = syncedMedia.mediaType === 'tv' ? 'tvshow' : 'movie';
    const streamParams = new URLSearchParams({
      type: superCdnType,
      imdb: syncedMedia.imdbId || '',
      tmdbId: String(syncedMedia.tmdbId),
      channel: String(currentChannel),
    });
    if (superCdnType === 'tvshow') {
      streamParams.set('season', String(syncedMedia.season || 1));
      streamParams.set('episode', String(syncedMedia.episode || 1));
    }
    return `/api/supercdn/stream?${streamParams.toString()}`;
  }, [syncedMedia, currentChannel]);

  // =========================================================================
  // VIEW A: INSIDE ACTIVE ROOM (Player on top, comfortable clean chat below)
  // =========================================================================
  if (isConnected && roomId) {
    return (
      <div
        ref={playerScreenRef}
        className="w-full min-h-[calc(100vh-64px)] bg-[#0A0A0A] text-white flex flex-col"
      >
        {/* Top Slim Room Bar */}
        <header className="h-12 px-4 sm:px-6 bg-[#0E0E0E] border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={disconnectExternalRoom}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#E50914] text-white text-xs font-bold border border-white/10 transition-colors cursor-pointer shrink-0"
              title="Sair da sala"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>

            <div className="flex items-center gap-2 truncate">
              <span className="text-[11px] font-bold text-[#A1A1A1] uppercase tracking-wider hidden sm:inline">
                Sala:
              </span>
              <span className="font-mono text-xs sm:text-sm font-extrabold text-[#E50914] bg-white/[0.05] px-2 py-0.5 rounded border border-white/10">
                {roomId}
              </span>
              {syncedMedia && (
                <span className="text-xs text-white/90 font-semibold truncate hidden md:inline">
                  • {syncedMedia.title}
                  {syncedMedia.mediaType === 'tv' && syncedMedia.season
                    ? ` (T${syncedMedia.season}:E${syncedMedia.episode || 1})`
                    : ''}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Copy invite link */}
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#E50914]" />
                  <span className="hidden xs:inline">Convidar</span>
                </>
              )}
            </button>

            {/* Peers count */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-semibold text-[#A1A1A1]">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>{peers.length}</span>
            </div>

            {/* Toggle Fullscreen */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white transition-colors cursor-pointer"
              title="Tela Cheia"
            >
              {isNativeFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </header>

        {/* Content Container */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* PLAYER AREA: On portrait/mobile, behaves like YouTube (sticky/top 16:9 screen). On desktop, fills main column */}
          <div
            className={`flex flex-col bg-black transition-all ${
              isLandscape
                ? 'w-full h-full flex-1'
                : 'w-full lg:flex-1 lg:h-full shrink-0'
            }`}
          >
            {/* Video Screen Frame */}
            <div
              className={`relative bg-black w-full overflow-hidden flex items-center justify-center ${
                isLandscape
                  ? 'h-full flex-1'
                  : 'aspect-video max-h-[42vh] lg:max-h-none lg:h-[calc(100vh-120px)]'
              }`}
            >
              {iframeLoading && streamSrc && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm gap-2">
                  <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
                  <p className="text-xs font-bold text-white/80">Carregando transmissão...</p>
                </div>
              )}

              {streamSrc ? (
                <iframe
                  ref={iframeRef}
                  key={`${syncedMedia?.tmdbId}-${syncedMedia?.season || 0}-${syncedMedia?.episode || 0}-${currentChannel}`}
                  src={streamSrc}
                  title={syncedMedia?.title || 'Love Flix Player'}
                  width="100%"
                  height="100%"
                  scrolling="no"
                  frameBorder="0"
                  onLoad={() => setIframeLoading(false)}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  className="w-full h-full border-0 bg-black"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-[#A1A1A1] space-y-3">
                  <Clapperboard className="w-10 h-10 text-white/30" />
                  <p className="text-sm font-bold text-white">Nenhum conteúdo selecionado</p>
                  <p className="text-xs text-white/50 max-w-sm">
                    A sala está aberta e pronta. Escolha um filme ou série para transmitir.
                  </p>
                </div>
              )}
            </div>

            {/* Quick Channel Bar below video (visible when not in fullscreen/pure landscape) */}
            {!isLandscape && (
              <div className="px-4 py-2 bg-[#101010] border-y border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Tv className="w-3.5 h-3.5 text-[#E50914] shrink-0" />
                  <span className="text-[11px] font-bold text-[#A1A1A1] uppercase tracking-wider shrink-0">
                    Canais:
                  </span>
                  <div className="flex items-center gap-1">
                    {CHANNELS.map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => handleSwitchChannelInRoom(ch.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                          currentChannel === ch.id
                            ? 'bg-[#E50914] text-white shadow'
                            : 'bg-white/[0.05] text-[#A1A1A1] hover:text-white hover:bg-white/[0.1]'
                        }`}
                      >
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-[11px] font-medium text-[#A1A1A1] truncate">
                  {syncedMedia?.title}
                </div>
              </div>
            )}
          </div>

          {/* CHAT AREA:
              - In portrait orientation: Appears right below the video (like YouTube mobile) or side panel on desktop
              - In landscape orientation: Automatically HIDDEN so the user can enjoy full cinematic movie immersion */}
          {!isLandscape && (
            <div className="flex-1 lg:w-96 lg:max-w-md lg:border-l border-white/[0.08] bg-[#0E0E0E] flex flex-col min-h-[300px] lg:h-[calc(100vh-112px)] overflow-hidden">
              {/* Chat Header */}
              <div className="px-4 py-2.5 bg-[#141414] border-b border-white/[0.06] flex items-center justify-between shrink-0">
                <span className="text-xs font-bold text-white/90">Chat da Sala</span>
                <span className="text-[11px] text-[#A1A1A1] font-medium">
                  {chatMessages.length} {chatMessages.length === 1 ? 'mensagem' : 'mensagens'}
                </span>
              </div>

              {/* Chat Feed */}
              <div
                ref={chatScrollRef}
                className="flex-1 p-3.5 overflow-y-auto space-y-2.5 no-scrollbar min-h-0"
              >
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#A1A1A1]/60 space-y-1.5">
                    <p className="text-xs font-medium">Nenhuma mensagem ainda.</p>
                    <p className="text-[11px]">Envie uma mensagem para quem estiver na sala!</p>
                  </div>
                ) : (
                  chatMessages.map((msg) => {
                    const isMe = msg.name === (profile?.name || 'Love Flix');
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
                          className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words ${
                            isMe
                              ? 'bg-[#E50914] text-white rounded-tr-none'
                              : 'bg-[#1D1D1D] text-white/95 border border-white/[0.06] rounded-tl-none'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={handleSendChat}
                className="p-2.5 bg-[#121212] border-t border-white/[0.08] flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Conversar na sala..."
                  className="flex-1 h-10 px-3.5 rounded-xl bg-[#1C1C1C] border border-white/10 text-xs text-white placeholder:text-[#A1A1A1] focus:border-[#E50914] focus:outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="w-10 h-10 rounded-xl bg-[#E50914] hover:bg-[#FF253A] disabled:opacity-40 disabled:hover:bg-[#E50914] flex items-center justify-center text-white shrink-0 transition-transform active:scale-95 cursor-pointer"
                  title="Enviar mensagem"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </div>
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

          {/* Channel Selector */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#A1A1A1]">
              Selecione o Canal de Transmissão:
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {CHANNELS.map((ch) => {
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
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-white">{ch.label}</span>
                      {isSelected && <span className="w-2 h-2 rounded-full bg-[#E50914]" />}
                    </div>
                    <span className="text-[11px] text-[#A1A1A1] block">{ch.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="button"
            disabled={isSubmitting}
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
                onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
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
          </form>
        )}
      </div>
    </div>
  );
};
