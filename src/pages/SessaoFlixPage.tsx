import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clapperboard,
  Copy,
  Flame,
  Loader2,
  LogOut,
  Play,
  Radio,
  Search,
  Send,
  UserRound,
  Users,
  X,
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
import { LOVEFLIX_PRESET_AVATARS } from '../utils/avatars';

const CHANNELS: Array<{ id: 1 | 2 | 3; label: string; desc: string }> = [
  { id: 1, label: 'Canal 1', desc: 'Embed Primário' },
  { id: 2, label: 'Canal 2', desc: 'SuperFlix HD' },
  { id: 3, label: 'Canal 3', desc: 'StreamBetter Rápido' },
];

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
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Keep player channel in sync with room state
  useEffect(() => {
    if (syncedMedia?.channel) {
      setCurrentChannel(syncedMedia.channel);
    }
  }, [syncedMedia?.channel]);

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
    if (!selectedItem) {
      pushToast('Selecione um filme ou série antes de abrir a sala.');
      return;
    }
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
      const synced = await syncMediaToExternalRoom({
        mediaType,
        tmdbId: selectedItem.id,
        title,
        posterPath: selectedItem.poster_path || null,
        backdropPath: selectedItem.backdrop_path || null,
        season: mediaType === 'tv' ? selectedSeason : undefined,
        episode: mediaType === 'tv' ? selectedEpisode : undefined,
        channel: selectedChannel,
      });

      if (!synced) {
        pushToast('Não foi possível carregar o conteúdo na sala.');
        disconnectExternalRoom();
        return;
      }

      sendChatMessage(buildSessionWelcomeMessage(newRoomId));
      pushToast(`Sala ${newRoomId} aberta com sucesso!`, 'accent');
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

  useEffect(() => {
    setIframeLoading(true);
  }, [streamSrc]);

  // =========================================================================
  // VIEW A: DEDICATED WATCH ROOM
  // =========================================================================
  if (isConnected && roomId) {
    return (
      <div className="fixed inset-0 z-[100] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#050505] text-white">
        <main className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="relative min-h-0 flex-1 bg-black">
            <div className="absolute left-3 right-3 top-3 z-20 flex items-center justify-between gap-3 sm:left-5 sm:right-5 sm:top-5">
              <button
                type="button"
                onClick={() => {
                  setIsParticipantsOpen(false);
                  disconnectExternalRoom();
                }}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-black/60 px-4 text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-[#E50914] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E50914]"
                title="Sair da sala"
              >
                <LogOut className="h-4 w-4" />
                <span>Sair</span>
              </button>

              <button
                type="button"
                onClick={() => setIsParticipantsOpen(true)}
                aria-label="Abrir participantes"
                aria-expanded={isParticipantsOpen}
                className="relative flex h-10 w-12 items-center justify-center rounded-full border border-white/15 bg-black/60 text-[#FF6470] backdrop-blur-md transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E50914]"
                title="Participantes"
              >
                <UserRound className="absolute left-[10px] top-[11px] h-4 w-4 fill-[#E50914]/25" />
                <UserRound className="absolute right-[9px] top-[13px] h-3.5 w-3.5 fill-[#FF6470]/25" />
              </button>
            </div>

            {streamSrc ? (
              <>
                <iframe
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
                  className="absolute inset-0 h-full w-full border-0 bg-black"
                />
                {iframeLoading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/85 backdrop-blur-sm">
                    <Loader2 className="h-8 w-8 animate-spin text-[#E50914]" />
                    <p className="text-xs font-bold text-white/80">Carregando transmissão...</p>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/60">
                {isSubmitting ? (
                  <Loader2 className="h-8 w-8 animate-spin text-[#E50914]" />
                ) : (
                  <Clapperboard className="h-10 w-10 text-white/30" />
                )}
                <p className="text-sm font-semibold">
                  {isSubmitting ? 'Preparando sua sessão...' : 'Aguardando o conteúdo da sessão...'}
                </p>
              </div>
            )}
          </section>

          <section className="flex min-h-[210px] max-h-[50%] basis-[42%] shrink-0 flex-col overflow-hidden border-t border-white/10 bg-[#0E0E0E] lg:h-auto lg:max-h-none lg:min-h-0 lg:basis-auto lg:shrink lg:border-l lg:border-t-0 lg:w-[360px] xl:w-[400px]">
            <header className="flex h-12 shrink-0 items-center border-b border-white/[0.08] bg-[#111111] px-4">
              <span className="text-sm font-bold text-white/90">Chat da Sala</span>
            </header>

            <div
              ref={chatScrollRef}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5 no-scrollbar"
            >
              {chatMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center text-[#A1A1A1]/70">
                  <p className="text-xs font-medium">O chat começa aqui.</p>
                </div>
              ) : (
                chatMessages.map((msg) => {
                  if (isSessionWelcomeMessage(msg.text)) {
                    const [headline, intro, invitation, idLabel, idValue, closing] =
                      msg.text.split('\n');
                    return (
                      <article
                        key={msg.id}
                        className="mx-auto w-full max-w-sm space-y-3 rounded-2xl border border-[#E50914]/25 bg-gradient-to-br from-[#251012] to-[#151112] p-4 shadow-lg shadow-black/20"
                      >
                        <div className="space-y-1.5">
                          <h2 className="text-sm font-extrabold leading-snug text-white">{headline}</h2>
                          <p className="text-xs leading-relaxed text-white/75">{intro}</p>
                          <p className="text-xs leading-relaxed text-white/75">{invitation}</p>
                        </div>
                        <div className="rounded-xl border border-[#E50914]/25 bg-black/30 px-3 py-2.5">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#FF7A83]">
                            {idLabel}
                          </p>
                          <button
                            type="button"
                            onClick={handleCopyRoomId}
                            className="flex w-full items-center justify-between gap-2 text-left font-mono text-lg font-black tracking-wide text-white hover:text-[#FF7A83]"
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
