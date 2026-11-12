import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, Loader2, MessageCircle, Play, Search, Send, Users } from 'lucide-react';
import { getMediaTitle, getPosterUrl, resolveMediaType, tmdbService } from '../services/tmdb';
import type { TMDBMediaItem } from '../types/tmdb';
import type { ExternalRoomMedia, ExternalRoomPlayback } from '../types/externalRoom';

interface ChatMessage {
  id: string;
  peerId: string;
  name: string;
  text: string;
  sentAtMs: number;
}

const CHANNELS: Array<{ id: 1 | 2 | 3; label: string }> = [
  { id: 1, label: 'Canal 1' },
  { id: 2, label: 'Canal 2' },
  { id: 3, label: 'Canal 3' },
];

function getPeerId(): string {
  try {
    const key = 'loveflix_watch_party_peer';
    const saved = sessionStorage.getItem(key);
    if (saved) return saved;
    const id = `lf_${crypto.randomUUID()}`;
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return `lf_${Math.random().toString(36).slice(2, 12)}`;
  }
}

function generateRoomId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function messageTime(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

export const WatchPartyPage: React.FC = () => {
  const peerId = useMemo(getPeerId, []);
  const [roomId, setRoomId] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [guestName, setGuestName] = useState(() => {
    try { return localStorage.getItem('loveflix_watch_party_name') || ''; } catch { return ''; }
  });
  const [connection, setConnection] = useState<'idle' | 'connecting' | 'connected' | 'offline'>('idle');
  const [media, setMedia] = useState<ExternalRoomMedia | null>(null);
  const [playback, setPlayback] = useState<ExternalRoomPlayback | null>(null);
  const [peers, setPeers] = useState<Array<{ peerId: string; name: string }>>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TMDBMediaItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<TMDBMediaItem | null>(null);
  const [channel, setChannel] = useState<1 | 2 | 3>(1);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [copied, setCopied] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomRef = useRef('');
  const peerRef = useRef(peerId);
  const mediaRef = useRef<ExternalRoomMedia | null>(null);
  const playbackRef = useRef<ExternalRoomPlayback | null>(null);
  const applyingRemoteRef = useRef(false);

  const inviteUrl = roomId
    ? `${window.location.origin}/sessao?room=${encodeURIComponent(roomId)}`
    : '';

  const sendWs = useCallback((payload: Record<string, unknown>) => {
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }, []);

  const applySnapshot = useCallback((snapshot: { media?: ExternalRoomMedia | null; playback?: ExternalRoomPlayback; peers?: Array<{ peerId: string; name: string }> }) => {
    if (snapshot.media !== undefined) {
      mediaRef.current = snapshot.media;
      setMedia(snapshot.media);
    }
    if (snapshot.playback) {
      playbackRef.current = snapshot.playback;
      setPlayback(snapshot.playback);
    }
    if (snapshot.peers) setPeers(snapshot.peers);
  }, []);

  const connectRoom = useCallback(async (rawRoomId: string) => {
    const cleanRoomId = rawRoomId.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,64}$/.test(cleanRoomId)) return;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    wsRef.current?.close();
    roomRef.current = cleanRoomId;
    setRoomId(cleanRoomId);
    setConnection('connecting');

    try {
      const connectResponse = await fetch(`/api/bridge/rooms/${encodeURIComponent(cleanRoomId)}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peerId,
          peerName: (guestName.trim() || 'Convidado').slice(0, 40),
          source: 'loveflix',
        }),
      });
      if (!connectResponse.ok) throw new Error('Não foi possível abrir esta sala.');
      const connectedRoom = await connectResponse.json() as { room?: { media?: ExternalRoomMedia | null; playback?: ExternalRoomPlayback; peers?: Array<{ peerId: string; name: string }> } };
      if (connectedRoom.room) applySnapshot(connectedRoom.room);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/bridge/ws?roomId=${encodeURIComponent(cleanRoomId)}`);
      wsRef.current = socket;
      socket.onopen = () => {
        if (wsRef.current !== socket) return;
        setConnection('connected');
        socket.send(JSON.stringify({ type: 'clock:ping', clientSendMs: Date.now() }));
        socket.send(JSON.stringify({ type: 'room:join', roomId: cleanRoomId, peerId, name: (guestName.trim() || 'Convidado').slice(0, 40), source: 'loveflix' }));
        socket.send(JSON.stringify({ type: 'chat:history' }));
      };
      socket.onmessage = (event) => {
        if (wsRef.current !== socket) return;
        try {
          const payload = JSON.parse(String(event.data)) as Record<string, any>;
          if (payload.type === 'room:snapshot' && payload.room) {
            applySnapshot(payload.room);
          } else if (payload.type === 'media:updated' && payload.media) {
            applySnapshot({ media: payload.media, playback: payload.playback });
          } else if (payload.type === 'playback:updated' && payload.playback) {
            const nextPlayback = payload.playback as ExternalRoomPlayback;
            playbackRef.current = nextPlayback;
            setPlayback(nextPlayback);
            if (nextPlayback.actorId !== peerRef.current) {
              applyingRemoteRef.current = true;
              iframeRef.current?.contentWindow?.postMessage({
                type: 'LOVEFLIX_PLAYER_COMMAND',
                command: nextPlayback.action === 'seek' ? 'seek' : nextPlayback.paused ? 'pause' : 'play',
                positionSec: Math.max(0, nextPlayback.positionSec),
                paused: nextPlayback.paused,
                playbackRate: nextPlayback.playbackRate || 1,
              }, '*');
              window.setTimeout(() => { applyingRemoteRef.current = false; }, 700);
            }
          } else if ((payload.type === 'peer:joined' || payload.type === 'peer:left') && Array.isArray(payload.peers)) {
            setPeers(payload.peers);
          } else if (payload.type === 'chat:snapshot' && Array.isArray(payload.messages)) {
            setChat(payload.messages.slice(-100));
          } else if (payload.type === 'chat:message' && payload.message) {
            setChat((previous) => previous.some((item) => item.id === payload.message.id)
              ? previous
              : [...previous, payload.message as ChatMessage].slice(-100));
          } else if (payload.type === 'error') {
            setConnection('offline');
          }
        } catch { /* ignore malformed room event */ }
      };
      socket.onerror = () => {
        if (wsRef.current === socket) setConnection('offline');
      };
      socket.onclose = () => {
        if (wsRef.current !== socket) return;
        setConnection('offline');
        reconnectTimerRef.current = setTimeout(() => {
          if (roomRef.current === cleanRoomId) void connectRoom(cleanRoomId);
        }, 1800);
      };
    } catch {
      setConnection('offline');
    }
  }, [applySnapshot, guestName, peerId]);

  useEffect(() => {
    peerRef.current = peerId;
  }, [peerId]);

  useEffect(() => {
    const roomFromInvite = new URLSearchParams(window.location.search).get('room');
    if (roomFromInvite) void connectRoom(roomFromInvite);
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []); // Initial invite link only.

  useEffect(() => {
    mediaRef.current = media;
    if (media) setIframeLoading(true);
  }, [media?.tmdbId, media?.mediaType, media?.channel, media?.season, media?.episode]);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.length]);

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const response = await tmdbService.searchMulti(query.trim(), 1);
      setResults((response.results || []).filter((item) => item.media_type === 'movie' || item.media_type === 'tv').slice(0, 12));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectContent = (item: TMDBMediaItem) => {
    setSelected(item);
    setChannel(1);
    setSeason(1);
    setEpisode(1);
  };

  const startTogether = () => {
    if (!selected || connection !== 'connected') return;
    const mediaType = resolveMediaType(selected, 'movie') === 'tv' ? 'tv' : 'movie';
    const payload: Record<string, unknown> = {
      mediaType,
      tmdbId: selected.id,
      title: getMediaTitle(selected),
      posterPath: selected.poster_path,
      backdropPath: selected.backdrop_path,
      channel,
    };
    if (mediaType === 'tv') {
      payload.season = Math.max(1, season);
      payload.episode = Math.max(1, episode);
    }
    sendWs({ type: 'media:set', eventId: `media-${peerId}-${Date.now()}`, media: payload });
    setResults([]);
    setSelected(null);
  };

  const sendChat = (event: React.FormEvent) => {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text || connection !== 'connected') return;
    sendWs({ type: 'chat:send', message: { id: `${peerId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text } });
    setChatDraft('');
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard requires secure browser context */ }
  };

  const handlePlayerMessage = useCallback((event: MessageEvent) => {
    if (!iframeRef.current?.contentWindow || event.source !== iframeRef.current.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'LOVEFLIX_CHANNEL_FALLBACK') {
      const current = mediaRef.current;
      if (!current) return;
      const nextChannel: 1 | 2 | 3 | null = current.channel === 1 ? 2 : current.channel === 2 ? 3 : null;
      if (nextChannel) {
        sendWs({ type: 'media:set', eventId: `fallback-${peerId}-${Date.now()}`, media: { ...current, channel: nextChannel } });
      }
      return;
    }
    if (data.type !== 'LOVEFLIX_PLAYER_EVENT' || applyingRemoteRef.current) return;
    const action = String(data.action || '');
    if (!['play', 'pause', 'seek', 'ratechange'].includes(action)) return;
    sendWs({
      type: 'playback:set',
      playback: {
        action,
        positionSec: Math.max(0, Number(data.positionSec) || 0),
        paused: Boolean(data.paused),
        playbackRate: Number(data.playbackRate) || 1,
        eventId: `pb-${peerId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      },
    });
  }, [peerId, sendWs]);

  useEffect(() => {
    window.addEventListener('message', handlePlayerMessage);
    return () => window.removeEventListener('message', handlePlayerMessage);
  }, [handlePlayerMessage]);

  const playerUrl = useMemo(() => {
    if (!media || !roomId) return '';
    const params = new URLSearchParams({
      type: media.mediaType === 'tv' ? 'tvshow' : 'movie',
      tmdbId: String(media.tmdbId),
      imdb: media.imdbId || '',
      channel: String(media.channel),
      room: roomId,
    });
    if (media.mediaType === 'tv') {
      params.set('season', String(media.season || 1));
      params.set('episode', String(media.episode || 1));
    }
    return `/api/supercdn/stream?${params.toString()}`;
  }, [media, roomId]);

  const inviteLink = roomId ? `${window.location.origin}/sessao?room=${encodeURIComponent(roomId)}` : '';
  const displayName = guestName.trim() || 'Convidado';

  return (
    <div className="min-h-[calc(100dvh-120px)] bg-[#080808] text-white flex flex-col">
      <header className="px-4 sm:px-7 py-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-[#FF253A]">Assistir em grupo</p>
          <h1 className="font-display text-xl sm:text-2xl font-extrabold">Sessão Flix</h1>
        </div>
        {roomId && <div className="flex items-center gap-2">
          <input aria-label="Seu nome na sala" value={guestName} maxLength={40} onChange={(event) => {
            const next = event.target.value;
            setGuestName(next);
            try { localStorage.setItem('loveflix_watch_party_name', next); } catch { /* storage disabled */ }
          }} placeholder="Seu nome" className="w-28 sm:w-36 px-3 py-2 rounded-lg bg-[#151515] border border-white/10 text-xs outline-none focus:border-[#E50914]" />
          <span className="px-3 py-2 rounded-lg bg-[#151515] border border-white/10 font-mono text-xs">{roomId}</span>
          <button type="button" onClick={() => void copyInvite()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#191919] hover:bg-[#252525] border border-white/10 text-xs font-bold">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}{copied ? 'Copiado' : 'Convidar'}
          </button>
        </div>}
      </header>

      {!roomId ? <section className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-[#111] border border-white/10 p-6 space-y-4">
          <div className="text-center"><Users className="w-8 h-8 text-[#E50914] mx-auto mb-2" /><h2 className="font-bold text-lg">Crie ou entre em uma sala</h2><p className="text-sm text-white/55 mt-1">Convide outras pessoas e assistam juntos em sincronia.</p></div>
          <label className="block"><span className="text-xs text-white/60">Seu nome</span><input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={40} placeholder="Como você quer aparecer?" className="mt-1 w-full px-3 py-2.5 rounded-lg bg-[#1a1a1a] border border-white/10 text-sm outline-none focus:border-[#E50914]" /></label>
          <button type="button" onClick={() => void connectRoom(generateRoomId())} className="w-full px-4 py-2.5 rounded-lg bg-[#E50914] hover:bg-[#ff253a] text-sm font-bold">Criar sala</button>
          <form onSubmit={(event) => { event.preventDefault(); void connectRoom(roomCodeInput); }} className="flex gap-2">
            <input value={roomCodeInput} onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())} maxLength={64} placeholder="Código da sala" className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-[#1a1a1a] border border-white/10 text-sm outline-none focus:border-[#E50914]" />
            <button disabled={connection === 'connecting'} className="px-4 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-bold disabled:opacity-50">{connection === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entrar'}</button>
          </form>
          {connection === 'offline' && <p role="alert" className="text-xs text-rose-300">Não foi possível conectar. Confira o código e tente novamente.</p>}
        </div>
      </section> : <main className="flex-1 min-h-0 flex flex-col lg:flex-row max-w-7xl w-full mx-auto p-3 sm:p-5 gap-4">
        <section className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="w-full aspect-video max-h-[48vh] bg-black rounded-2xl overflow-hidden border border-white/10 relative">
            {media && playerUrl ? <>
              <iframe key={`${media.tmdbId}-${media.channel}-${media.season || 0}-${media.episode || 0}`} ref={iframeRef} src={playerUrl} title={`Sessão Flix — ${media.title}`} className="w-full h-full border-0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen onLoad={() => setIframeLoading(false)} />
              {iframeLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/70 pointer-events-none"><Loader2 className="w-8 h-8 animate-spin text-[#E50914]" /></div>}
            </> : <div className="w-full h-full flex flex-col items-center justify-center text-center p-6"><Play className="w-10 h-10 text-[#E50914] mb-3" /><p className="font-bold">Escolham algo para assistir</p><p className="text-xs text-white/50 mt-1">A reprodução e os controles serão compartilhados com a sala.</p></div>}
          </div>
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="min-w-0"><p className="font-bold text-sm truncate">{media?.title || 'Nenhum conteúdo selecionado'}</p><p className="text-[11px] text-white/45">{connection === 'connected' ? 'Sala conectada · sincronização em tempo real' : connection === 'connecting' ? 'Conectando à sala…' : 'Reconectando…'}</p></div>
            <div className="flex items-center gap-1.5 text-xs text-white/55 shrink-0"><Users className="w-4 h-4" />{peers.length || (connection === 'connected' ? 1 : 0)}</div>
          </div>

          <section className="rounded-2xl bg-[#111] border border-white/[0.08] p-4">
            <h2 className="font-bold text-sm mb-3 inline-flex items-center gap-2"><Search className="w-4 h-4 text-[#FF253A]" />Escolher conteúdo</h2>
            <form onSubmit={runSearch} className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar filmes ou séries…" className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-[#1a1a1a] border border-white/10 text-sm outline-none focus:border-[#E50914]" /><button disabled={searching} className="px-3.5 rounded-lg bg-[#E50914] hover:bg-[#ff253a] disabled:opacity-60 text-xs font-bold">{searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}</button></form>
            {results.length > 0 && <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 max-h-56 overflow-y-auto">{results.map((item) => {
              const type = resolveMediaType(item, 'movie');
              const isSelected = selected?.id === item.id && resolveMediaType(selected, 'movie') === type;
              const image = getPosterUrl(item.poster_path, 'w342');
              return <button key={`${type}-${item.id}`} type="button" onClick={() => selectContent(item)} className={`flex items-center gap-2 p-2 rounded-xl text-left border transition-colors ${isSelected ? 'border-[#E50914] bg-[#E50914]/10' : 'border-white/[0.08] bg-[#171717] hover:bg-[#202020]'}`}>
                {image ? <img src={image} alt="" className="w-10 h-14 object-cover rounded-md bg-black" /> : <div className="w-10 h-14 rounded-md bg-black" />}
                <span className="min-w-0"><span className="block text-xs font-bold line-clamp-2">{getMediaTitle(item)}</span><span className="block text-[10px] text-white/45 mt-1">{type === 'tv' ? 'Série' : 'Filme'}</span></span>
              </button>;
            })}</div>}
            {selected && <div className="mt-3 pt-3 border-t border-white/[0.08] flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold mr-auto truncate">Selecionado: {getMediaTitle(selected)}</span>
              {resolveMediaType(selected, 'movie') === 'tv' && <><label className="text-[10px] text-white/55">Temporada<input type="number" min={1} value={season} onChange={(event) => setSeason(Math.max(1, Number(event.target.value) || 1))} className="ml-1 w-14 px-2 py-1 rounded bg-[#202020] text-white" /></label><label className="text-[10px] text-white/55">Ep.<input type="number" min={1} value={episode} onChange={(event) => setEpisode(Math.max(1, Number(event.target.value) || 1))} className="ml-1 w-14 px-2 py-1 rounded bg-[#202020] text-white" /></label></>}
              <div className="flex items-center gap-1">{CHANNELS.map((item) => <button key={item.id} type="button" onClick={() => setChannel(item.id)} className={`px-2 py-1.5 rounded text-[10px] font-bold ${channel === item.id ? 'bg-[#E50914] text-white' : 'bg-[#202020] text-white/55'}`}>{item.label}</button>)}</div>
              <button type="button" disabled={connection !== 'connected'} onClick={startTogether} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#E50914] disabled:opacity-50 text-xs font-bold"><Play className="w-3.5 h-3.5 fill-current" />Assistir juntos</button>
            </div>}
          </section>
        </section>

        <aside className="w-full lg:w-[360px] shrink-0 min-h-[360px] lg:min-h-0 flex flex-col rounded-2xl bg-[#111] border border-white/[0.08] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between"><div><h2 className="font-bold text-sm inline-flex items-center gap-2"><MessageCircle className="w-4 h-4 text-[#FF253A]" />Chat da sessão</h2><p className="text-[10px] text-white/40 mt-0.5">Conversa ao vivo com a sala</p></div><span className={`w-2 h-2 rounded-full ${connection === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} /> </div>
          <div className="flex-1 min-h-[240px] lg:min-h-0 overflow-y-auto p-3 space-y-3" aria-live="polite">{chat.length === 0 && <p className="text-center text-xs text-white/35 py-8">As mensagens da sala aparecem aqui.</p>}{chat.map((item) => <article key={item.id} className="text-xs"><div className="flex items-baseline gap-2"><span className={`font-bold ${item.peerId === peerId ? 'text-[#FF5965]' : 'text-white/80'}`}>{item.name}</span><time className="text-[9px] text-white/30">{messageTime(item.sentAtMs)}</time></div><p className="mt-0.5 text-white/75 break-words whitespace-pre-wrap">{item.text}</p></article>)}<div ref={chatEndRef} /></div>
          <form onSubmit={sendChat} className="p-3 border-t border-white/[0.08] flex gap-2"><input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={500} placeholder="Escreva uma mensagem…" disabled={connection !== 'connected'} className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-[#1a1a1a] border border-white/10 text-xs outline-none focus:border-[#E50914] disabled:opacity-50" /><button type="submit" disabled={!chatDraft.trim() || connection !== 'connected'} className="w-10 h-10 rounded-xl bg-[#E50914] hover:bg-[#ff253a] disabled:opacity-40 flex items-center justify-center" aria-label="Enviar mensagem"><Send className="w-4 h-4" /></button></form>
        </aside>
      </main>}
    </div>
  );
};
