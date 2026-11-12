import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ChatMessage,
  ExternalMediaSelectionInput,
  ExternalPlaybackAction,
  ExternalRoomConnectOptions,
  ExternalRoomMedia,
  ExternalRoomPeer,
  ExternalRoomPlayback,
  ExternalRoomSnapshot,
  ReactionEvent,
} from '../types/externalRoom';
import { useNavigation } from './NavigationContext';
import { useUserData } from './UserDataContext';

const SESSION_CONFIG_KEY = 'loveflix_external_room_connection_v2';
const PEER_ID_KEY = 'loveflix_external_bridge_peer_id_v2';

interface StoredConnectionConfig {
  roomId: string;
  pickerMode: boolean;
  returnUrl: string;
  webhookUrl: string;
  externalWsUrl: string;
  sessionToken: string;
}

type RemotePlaybackListener = (playback: ExternalRoomPlayback, livePositionSec: number) => void;

interface ExternalRoomContextValue {
  isConnected: boolean;
  isPickerMode: boolean;
  connecting: boolean;
  roomId: string | null;
  returnUrl: string;
  syncedMedia: ExternalRoomMedia | null;
  syncedPlayback: ExternalRoomPlayback | null;
  peers: ExternalRoomPeer[];
  chatMessages: ChatMessage[];
  reactions: ReactionEvent[];
  connectExternalRoom: (
    options: ExternalRoomConnectOptions & { pickerMode?: boolean; userName?: string }
  ) => Promise<boolean>;
  createRoom: (customId?: string) => Promise<string | null>;
  disconnectExternalRoom: () => void;
  syncMediaToExternalRoom: (
    selection: ExternalMediaSelectionInput
  ) => Promise<ExternalRoomMedia | null>;
  syncPlaybackToExternalRoom: (params: {
    action: ExternalPlaybackAction;
    positionSec: number;
    paused: boolean;
    playbackRate?: number;
  }) => void;
  sendChatMessage: (text: string) => void;
  sendReaction: (emoji: string) => void;
  getLiveRoomPositionSec: (overridePlayback?: ExternalRoomPlayback | null) => number;
  subscribeRemotePlayback: (listener: RemotePlaybackListener) => () => void;
  returnToExternalRoomApp: () => void;
  isApplyingRemoteMediaChange: () => boolean;
}

const ExternalRoomContext = createContext<ExternalRoomContextValue | null>(null);

function getOrCreatePeerId(): string {
  try {
    const existing = sessionStorage.getItem(PEER_ID_KEY);
    if (existing && existing.length >= 8) return existing;
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const id = `lf_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    sessionStorage.setItem(PEER_ID_KEY, id);
    return id;
  } catch {
    return `lf_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function loadSavedConnection(): StoredConnectionConfig | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConnectionConfig;
    if (parsed && typeof parsed.roomId === 'string' && parsed.roomId.trim().length >= 3) {
      return parsed;
    }
  } catch {
    // ignore storage partition restrictions in cross-origin iframes
  }
  return null;
}

function saveConnectionConfig(cfg: StoredConnectionConfig | null): void {
  try {
    if (!cfg) {
      sessionStorage.removeItem(SESSION_CONFIG_KEY);
    } else {
      sessionStorage.setItem(SESSION_CONFIG_KEY, JSON.stringify(cfg));
    }
  } catch {
    // ignore storage partition restrictions in cross-origin iframes
  }
}

function postCrossWindowBridgeMessage(payload: Record<string, unknown>): void {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, '*');
    }
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, '*');
    }
  } catch {
    // ignore cross-origin frame restrictions
  }
}

export const ExternalRoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activePlayer, startPlayerSession } = useNavigation();
  const { pushToast, profile } = useUserData();

  const peerId = useMemo(getOrCreatePeerId, []);
  const [config, setConfig] = useState<StoredConnectionConfig | null>(loadSavedConnection);
  const [connecting, setConnecting] = useState(false);
  const [syncedMedia, setSyncedMedia] = useState<ExternalRoomMedia | null>(null);
  const [syncedPlayback, setSyncedPlayback] = useState<ExternalRoomPlayback | null>(null);
  const [peers, setPeers] = useState<ExternalRoomPeer[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);

  const seqRef = useRef<number>(0);
  const clockOffsetMsRef = useRef<number>(0);
  const serverWsRef = useRef<WebSocket | null>(null);
  const externalWsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRetryCountRef = useRef<number>(0);
  const applyingRemoteMediaRef = useRef<boolean>(false);
  const activePlayerRef = useRef(activePlayer);
  activePlayerRef.current = activePlayer;

  const playbackListenersRef = useRef<Set<RemotePlaybackListener>>(new Set());

  const getLiveRoomPositionSec = useCallback(
    (overridePlayback?: ExternalRoomPlayback | null): number => {
      const pb = overridePlayback ?? syncedPlayback;
      if (!pb) return 0;
      if (pb.paused) return Math.max(0, pb.positionSec);
      const alignedNow = Date.now() + clockOffsetMsRef.current;
      const elapsedSec = Math.max(0, (alignedNow - pb.updatedAtMs) / 1000);
      const rate = pb.playbackRate > 0 ? pb.playbackRate : 1;
      return Math.max(0, pb.positionSec + elapsedSec * rate);
    },
    [syncedPlayback]
  );

  const applyAuthoritativePlayback = useCallback(
    (incoming: ExternalRoomPlayback, notifySubscribers: boolean) => {
      setSyncedPlayback(incoming);
      if (notifySubscribers && incoming.actorId !== peerId) {
        const liveSec = incoming.paused
          ? Math.max(0, incoming.positionSec)
          : Math.max(
              0,
              incoming.positionSec +
                Math.max(0, (Date.now() + clockOffsetMsRef.current - incoming.updatedAtMs) / 1000) *
                  (incoming.playbackRate || 1)
            );
        for (const listener of playbackListenersRef.current) {
          listener(incoming, liveSec);
        }
      }
    },
    [peerId]
  );

  const applyAuthoritativeMedia = useCallback(
    (incoming: ExternalRoomMedia | null, actorId?: string) => {
      setSyncedMedia((prev) => {
        const changed =
          Boolean(incoming) &&
          (!prev ||
            prev.tmdbId !== incoming!.tmdbId ||
            prev.mediaType !== incoming!.mediaType ||
            prev.season !== incoming!.season ||
            prev.episode !== incoming!.episode ||
            prev.channel !== incoming!.channel);

        if (changed && incoming && actorId && actorId !== peerId) {
          const currentPlayer = activePlayerRef.current;
          if (currentPlayer) {
            applyingRemoteMediaRef.current = true;
            startPlayerSession({
              mediaType: incoming.mediaType,
              id: incoming.tmdbId,
              title: incoming.title,
              imdbId: incoming.imdbId,
              channel: incoming.channel,
              season: incoming.season,
              episode: incoming.episode,
              episodeTitle: incoming.episodeTitle,
            });
            setTimeout(() => {
              applyingRemoteMediaRef.current = false;
            }, 600);
          }
        }
        return incoming;
      });
    },
    [peerId, startPlayerSession]
  );

  const ingestRoomSnapshot = useCallback(
    (snapshot: ExternalRoomSnapshot, isInitial: boolean) => {
      if (typeof snapshot.serverNowMs === 'number') {
        clockOffsetMsRef.current = Math.round(snapshot.serverNowMs - Date.now());
      }
      seqRef.current = Math.max(seqRef.current, snapshot.seq || 0);
      if (Array.isArray(snapshot.peers)) {
        setPeers(snapshot.peers);
      }
      if (Array.isArray(snapshot.chatMessages)) {
        setChatMessages(snapshot.chatMessages);
      }
      applyAuthoritativeMedia(snapshot.media, snapshot.playback?.actorId);
      if (snapshot.playback) {
        applyAuthoritativePlayback(snapshot.playback, !isInitial);
      }
    },
    [applyAuthoritativeMedia, applyAuthoritativePlayback]
  );

  const connectExternalRoom = useCallback(
    async (
      options: ExternalRoomConnectOptions & { pickerMode?: boolean; userName?: string }
    ): Promise<boolean> => {
      const cleanRoomId = options.roomId.trim().toUpperCase();
      if (!/^[a-zA-Z0-9_-]{3,64}$/.test(cleanRoomId)) {
        return false;
      }

      const activeName = options.userName?.trim() || profile?.name || 'Love Flix';
      setConnecting(true);
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (options.authToken) {
          headers['X-LoveFlix-Key'] = options.authToken.trim();
        }

        const res = await fetch(`/api/bridge/rooms/${encodeURIComponent(cleanRoomId)}/connect`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            peerId,
            peerName: activeName,
            source: 'loveflix',
            returnUrl: options.returnUrl?.trim() || undefined,
            webhookUrl: options.webhookUrl?.trim() || undefined,
          }),
        });

        if (!res.ok) return false;

        const data = (await res.json()) as {
          ok: boolean;
          sessionToken?: string;
          room?: ExternalRoomSnapshot;
        };

        const resolvedReturnUrl =
          options.returnUrl?.trim() || data.room?.externalAppUrl || '';
        const nextConfig: StoredConnectionConfig = {
          roomId: cleanRoomId,
          pickerMode: Boolean(options.pickerMode),
          returnUrl: resolvedReturnUrl,
          webhookUrl: options.webhookUrl?.trim() || '',
          externalWsUrl: options.externalWsUrl?.trim() || '',
          sessionToken: data.sessionToken || options.authToken?.trim() || '',
        };

        seqRef.current = 0;
        saveConnectionConfig(nextConfig);
        setConfig(nextConfig);

        if (data.room) {
          ingestRoomSnapshot(data.room, true);
        }

        postCrossWindowBridgeMessage({
          type: 'LOVEFLIX_ROOM_CONNECTED',
          roomId: cleanRoomId,
          pickerMode: nextConfig.pickerMode,
          room: data.room || null,
        });

        return true;
      } catch {
        return false;
      } finally {
        setConnecting(false);
      }
    },
    [ingestRoomSnapshot, peerId]
  );

  const disconnectExternalRoom = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (serverWsRef.current) {
      try {
        if (serverWsRef.current.readyState === WebSocket.OPEN) {
          serverWsRef.current.send(JSON.stringify({ type: 'room:leave' }));
        }
        serverWsRef.current.close();
      } catch {
        // ignore
      }
      serverWsRef.current = null;
    }
    if (externalWsRef.current) {
      try {
        externalWsRef.current.close();
      } catch {
        // ignore
      }
      externalWsRef.current = null;
    }

    setConfig(null);
    setSyncedMedia(null);
    setSyncedPlayback(null);
    setPeers([]);
    setChatMessages([]);
    setReactions([]);
    seqRef.current = 0;
    saveConnectionConfig(null);
  }, []);

  const createRoom = useCallback(
    async (customId?: string): Promise<string | null> => {
      let code = (customId || '').trim().toUpperCase();
      if (!code) {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let randomPart = '';
        for (let i = 0; i < 4; i++) {
          randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        code = `FLIX-${randomPart}`;
      }
      const success = await connectExternalRoom({
        roomId: code,
        userName: profile?.name || 'Love Flix',
      });
      return success ? code : null;
    },
    [connectExternalRoom, profile?.name]
  );

  const sendChatMessage = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || !config?.roomId) return;
      const currentUserName = profile?.name || 'Espectador Flix';
      const localMsg: ChatMessage = {
        id: `msg_local_${Date.now()}`,
        peerId,
        name: currentUserName,
        text: clean,
        createdAtMs: Date.now(),
      };
      setChatMessages((prev) => [...prev.slice(-60), localMsg]);

      if (serverWsRef.current && serverWsRef.current.readyState === WebSocket.OPEN) {
        serverWsRef.current.send(
          JSON.stringify({
            type: 'chat:send',
            roomId: config.roomId,
            text: clean,
          })
        );
      }
    },
    [config?.roomId, peerId, profile?.name]
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      if (!emoji || !config?.roomId) return;
      const currentUserName = profile?.name || 'Espectador Flix';
      const localRx: ReactionEvent = {
        id: `rx_local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        peerId,
        name: currentUserName,
        emoji,
        createdAtMs: Date.now(),
      };
      setReactions((prev) => [...prev.slice(-25), localRx]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== localRx.id));
      }, 4000);

      if (serverWsRef.current && serverWsRef.current.readyState === WebSocket.OPEN) {
        serverWsRef.current.send(
          JSON.stringify({
            type: 'reaction:send',
            roomId: config.roomId,
            emoji,
          })
        );
      }
    },
    [config?.roomId, peerId, profile?.name]
  );

  // Silently establish external room bridge when opened with ?sala=... or ?room=...
  useEffect(() => {
    postCrossWindowBridgeMessage({ type: 'LOVEFLIX_APP_READY' });

    const params = new URLSearchParams(window.location.search);
    const urlRoom =
      params.get('sala') || params.get('room') || params.get('externalRoom') || '';
    if (!urlRoom.trim()) return;

    const modeParam = (params.get('mode') || '').toLowerCase();
    const isEmbeddedFrame = window.parent && window.parent !== window;
    const pickerMode =
      modeParam === 'picker' ||
      params.get('picker') === '1' ||
      (isEmbeddedFrame && modeParam !== 'player' && modeParam !== 'watch');

    const returnUrl = params.get('returnUrl') || params.get('callbackUrl') || '';
    const webhookUrl = params.get('webhookUrl') || params.get('webhook') || '';
    const externalWsUrl = params.get('wsUrl') || params.get('externalWs') || '';
    const token = params.get('token') || params.get('key') || '';

    [
      'sala',
      'room',
      'externalRoom',
      'mode',
      'picker',
      'returnUrl',
      'callbackUrl',
      'webhookUrl',
      'webhook',
      'wsUrl',
      'externalWs',
      'token',
      'key',
    ].forEach((k) => params.delete(k));
    const remainingQs = params.toString();
    const cleanUrl = `${window.location.pathname}${remainingQs ? `?${remainingQs}` : ''}`;
    window.history.replaceState({}, '', cleanUrl);

    void connectExternalRoom({
      roomId: urlRoom.trim(),
      pickerMode,
      returnUrl,
      webhookUrl,
      externalWsUrl,
      authToken: token,
      silent: true,
    });
  }, [connectExternalRoom]);

  // Listen to cross-window postMessage events when embedded/opened by the external room app
  useEffect(() => {
    const onWindowMessage = (event: MessageEvent) => {
      const d = event.data;
      if (!d || typeof d !== 'object') return;

      if (d.type === 'LOVEFLIX_ROOM_CONNECT' && typeof d.roomId === 'string') {
        void connectExternalRoom({
          roomId: d.roomId,
          pickerMode: d.mode === 'picker' || Boolean(d.pickerMode),
          returnUrl: typeof d.returnUrl === 'string' ? d.returnUrl : undefined,
          webhookUrl: typeof d.webhookUrl === 'string' ? d.webhookUrl : undefined,
          externalWsUrl: typeof d.wsUrl === 'string' ? d.wsUrl : undefined,
          authToken: typeof d.token === 'string' ? d.token : undefined,
          silent: true,
        });
        return;
      }

      if (d.type === 'LOVEFLIX_ROOM_DISCONNECT') {
        disconnectExternalRoom();
        return;
      }

      if (d.type === 'LOVEFLIX_EXTERNAL_PLAYBACK' && d.playback && config) {
        const pb = d.playback as Partial<ExternalRoomPlayback>;
        const synthesized: ExternalRoomPlayback = {
          paused: Boolean(pb.paused),
          positionSec: Number(pb.positionSec) || 0,
          playbackRate: Number(pb.playbackRate) || 1,
          action: (pb.action as ExternalPlaybackAction) || (pb.paused ? 'pause' : 'play'),
          seq: (pb.seq || seqRef.current) + 1,
          eventId: pb.eventId || `ext-pm-${Date.now()}`,
          actorId: pb.actorId || 'external-window',
          actorName: pb.actorName || 'Sala',
          updatedAtMs: Date.now() + clockOffsetMsRef.current,
        };
        applyAuthoritativePlayback(synthesized, true);
      }
    };

    window.addEventListener('message', onWindowMessage);
    return () => window.removeEventListener('message', onWindowMessage);
  }, [applyAuthoritativePlayback, config, connectExternalRoom, disconnectExternalRoom]);

  // Maintain Server WebSocket + Adaptive HTTP Sync + Optional External App WebSocket
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    wsRetryCountRef.current = 0;

    const connectServerWs = () => {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const qs = new URLSearchParams({ roomId: config.roomId });
      if (config.sessionToken) qs.set('token', config.sessionToken);
      const wsUrl = `${proto}//${window.location.host}/api/bridge/ws?${qs.toString()}`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        return;
      }
      serverWsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        wsRetryCountRef.current = 0;
        const myName = profile?.name || 'Love Flix';
        ws.send(JSON.stringify({ type: 'clock:ping', clientSendMs: Date.now() }));
        ws.send(
          JSON.stringify({
            type: 'room:join',
            roomId: config.roomId,
            peerId,
            name: myName,
            source: 'loveflix',
          })
        );
      };

      ws.onmessage = (ev) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
          const mType = String(msg.type || '');

          if (mType === 'clock:pong') {
            const sent = Number(msg.clientSendMs) || Date.now();
            const serverNow = Number(msg.serverNowMs) || Date.now();
            const rtt = Math.max(0, Date.now() - sent);
            clockOffsetMsRef.current = Math.round(serverNow + rtt / 2 - Date.now());
            return;
          }

          if (mType === 'room:snapshot' && msg.room) {
            ingestRoomSnapshot(msg.room as ExternalRoomSnapshot, true);
            return;
          }

          if (mType === 'media:updated' && msg.media) {
            if (typeof msg.seq === 'number') seqRef.current = Math.max(seqRef.current, msg.seq);
            applyAuthoritativeMedia(
              msg.media as ExternalRoomMedia,
              typeof msg.actorId === 'string' ? msg.actorId : undefined
            );
            if (msg.playback) {
              applyAuthoritativePlayback(msg.playback as ExternalRoomPlayback, true);
            }
            return;
          }

          if (mType === 'playback:updated' && msg.playback) {
            if (typeof msg.seq === 'number') seqRef.current = Math.max(seqRef.current, msg.seq);
            applyAuthoritativePlayback(msg.playback as ExternalRoomPlayback, true);
            return;
          }

          if ((mType === 'peer:joined' || mType === 'peer:left') && Array.isArray(msg.peers)) {
            setPeers(msg.peers as ExternalRoomPeer[]);
            return;
          }

          if (mType === 'chat:message' && msg.message) {
            const chatMsg = msg.message as ChatMessage;
            setChatMessages((prev) => {
              if (prev.some((m) => m.id === chatMsg.id)) return prev;
              return [...prev.slice(-60), chatMsg];
            });
            return;
          }

          if (mType === 'reaction:event' && msg.reaction) {
            const rx = msg.reaction as ReactionEvent;
            setReactions((prev) => [...prev.slice(-25), rx]);
            setTimeout(() => {
              setReactions((prev) => prev.filter((r) => r.id !== rx.id));
            }, 4000);
            return;
          }
        } catch {
          // ignore malformed ws message
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        wsRetryCountRef.current += 1;
        if (wsRetryCountRef.current > 4) return;
        const delay = Math.min(1200 * Math.pow(1.8, wsRetryCountRef.current - 1), 8000);
        reconnectTimerRef.current = setTimeout(connectServerWs, delay);
      };
    };

    connectServerWs();

    if (config.externalWsUrl && /^wss?:\/\//i.test(config.externalWsUrl)) {
      try {
        const extWs = new WebSocket(config.externalWsUrl);
        externalWsRef.current = extWs;
        extWs.onopen = () => {
          extWs.send(
            JSON.stringify({
              type: 'loveflix:join',
              roomId: config.roomId,
              peerId,
            })
          );
        };
        extWs.onmessage = (ev) => {
          if (cancelled) return;
          try {
            const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
            if (msg.playback && typeof msg.playback === 'object') {
              const raw = msg.playback as Partial<ExternalRoomPlayback>;
              if (raw.actorId === peerId) return;
              applyAuthoritativePlayback(
                {
                  paused: Boolean(raw.paused),
                  positionSec: Number(raw.positionSec) || 0,
                  playbackRate: Number(raw.playbackRate) || 1,
                  action: (raw.action as ExternalPlaybackAction) || (raw.paused ? 'pause' : 'play'),
                  seq: (raw.seq || seqRef.current) + 1,
                  eventId: raw.eventId || `ext-ws-${Date.now()}`,
                  actorId: raw.actorId || 'external-ws',
                  actorName: raw.actorName || 'Sala',
                  updatedAtMs: Date.now() + clockOffsetMsRef.current,
                },
                true
              );
            }
          } catch {
            // ignore
          }
        };
      } catch {
        // ignore
      }
    }

    const pollInterval = setInterval(() => {
      if (cancelled || document.visibilityState === 'hidden') return;
      if (serverWsRef.current && serverWsRef.current.readyState === WebSocket.OPEN) {
        return;
      }
      const qs = new URLSearchParams({
        sinceSeq: String(seqRef.current),
        peerId,
      });
      if (config.sessionToken) qs.set('token', config.sessionToken);

      fetch(`/api/bridge/rooms/${encodeURIComponent(config.roomId)}?${qs.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data?.ok || data.unchanged || !data.room) return;
          ingestRoomSnapshot(data.room as ExternalRoomSnapshot, false);
        })
        .catch(() => {});
    }, 1800);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (serverWsRef.current) {
        try {
          serverWsRef.current.close();
        } catch {
          // ignore
        }
        serverWsRef.current = null;
      }
      if (externalWsRef.current) {
        try {
          externalWsRef.current.close();
        } catch {
          // ignore
        }
        externalWsRef.current = null;
      }
    };
  }, [
    applyAuthoritativeMedia,
    applyAuthoritativePlayback,
    config,
    ingestRoomSnapshot,
    peerId,
  ]);

  const syncMediaToExternalRoom = useCallback(
    async (selection: ExternalMediaSelectionInput): Promise<ExternalRoomMedia | null> => {
      if (!config) return null;
      const eventId = `media-${peerId}-${Date.now()}`;

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.sessionToken) {
          headers['X-Bridge-Token'] = config.sessionToken;
        }

        const res = await fetch(
          `/api/bridge/rooms/${encodeURIComponent(config.roomId)}/media`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              actorId: peerId,
              actorName: 'Love Flix',
              eventId,
              media: selection,
            }),
          }
        );

        if (!res.ok) return null;
        const data = (await res.json()) as { ok: boolean; room?: ExternalRoomSnapshot };
        const resolvedMedia = data.room?.media || null;

        if (data.room && resolvedMedia) {
          seqRef.current = Math.max(seqRef.current, data.room.seq || 0);
          setSyncedMedia(resolvedMedia);
          setSyncedPlayback(data.room.playback);

          // Emit both event names so parent room iframe or popup catches selection in 0ms
          postCrossWindowBridgeMessage({
            type: 'LOVEFLIX_MEDIA_SELECTED',
            roomId: config.roomId,
            media: resolvedMedia,
            playback: data.room.playback,
          });
          postCrossWindowBridgeMessage({
            type: 'LOVEFLIX_ROOM_MEDIA',
            roomId: config.roomId,
            media: resolvedMedia,
            playback: data.room.playback,
          });

          if (externalWsRef.current && externalWsRef.current.readyState === WebSocket.OPEN) {
            externalWsRef.current.send(
              JSON.stringify({
                type: 'loveflix:media',
                roomId: config.roomId,
                media: resolvedMedia,
                playback: data.room.playback,
              })
            );
          }
        }
        return resolvedMedia;
      } catch {
        return null;
      }
    },
    [config, peerId, pushToast]
  );

  const syncPlaybackToExternalRoom = useCallback(
    (params: {
      action: ExternalPlaybackAction;
      positionSec: number;
      paused: boolean;
      playbackRate?: number;
    }) => {
      if (!config) return;
      const eventId = `pb-${peerId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const playbackPayload = {
        action: params.action,
        positionSec: Math.max(0, Number(params.positionSec) || 0),
        paused: Boolean(params.paused),
        playbackRate: params.playbackRate || 1,
        eventId,
        actorId: peerId,
        actorName: 'Love Flix',
      };

      const optimistic: ExternalRoomPlayback = {
        ...playbackPayload,
        seq: seqRef.current + 1,
        updatedAtMs: Date.now() + clockOffsetMsRef.current,
      };
      setSyncedPlayback(optimistic);

      if (serverWsRef.current && serverWsRef.current.readyState === WebSocket.OPEN) {
        serverWsRef.current.send(
          JSON.stringify({
            type: 'playback:set',
            roomId: config.roomId,
            playback: playbackPayload,
          })
        );
      } else {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.sessionToken) {
          headers['X-Bridge-Token'] = config.sessionToken;
        }
        fetch(`/api/bridge/rooms/${encodeURIComponent(config.roomId)}/playback`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            actorId: peerId,
            actorName: 'Love Flix',
            playback: playbackPayload,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.room?.seq) {
              seqRef.current = Math.max(seqRef.current, d.room.seq);
            }
          })
          .catch(() => {});
      }

      postCrossWindowBridgeMessage({
        type: 'LOVEFLIX_ROOM_PLAYBACK',
        roomId: config.roomId,
        playback: optimistic,
      });

      if (externalWsRef.current && externalWsRef.current.readyState === WebSocket.OPEN) {
        externalWsRef.current.send(
          JSON.stringify({
            type: 'loveflix:playback',
            roomId: config.roomId,
            playback: optimistic,
          })
        );
      }
    },
    [config, peerId]
  );

  const subscribeRemotePlayback = useCallback((listener: RemotePlaybackListener) => {
    playbackListenersRef.current.add(listener);
    return () => {
      playbackListenersRef.current.delete(listener);
    };
  }, []);

  const returnToExternalRoomApp = useCallback(() => {
    if (!config?.returnUrl) return;
    window.location.assign(config.returnUrl);
  }, [config?.returnUrl]);

  const isApplyingRemoteMediaChange = useCallback(() => applyingRemoteMediaRef.current, []);

  const value = useMemo<ExternalRoomContextValue>(
    () => ({
      isConnected: Boolean(config?.roomId),
      isPickerMode: Boolean(config?.pickerMode),
      connecting,
      roomId: config?.roomId || null,
      returnUrl: config?.returnUrl || '',
      syncedMedia,
      syncedPlayback,
      peers,
      chatMessages,
      reactions,
      connectExternalRoom,
      createRoom,
      disconnectExternalRoom,
      syncMediaToExternalRoom,
      syncPlaybackToExternalRoom,
      sendChatMessage,
      sendReaction,
      getLiveRoomPositionSec,
      subscribeRemotePlayback,
      returnToExternalRoomApp,
      isApplyingRemoteMediaChange,
    }),
    [
      config,
      connecting,
      syncedMedia,
      syncedPlayback,
      peers,
      chatMessages,
      reactions,
      connectExternalRoom,
      createRoom,
      disconnectExternalRoom,
      syncMediaToExternalRoom,
      syncPlaybackToExternalRoom,
      sendChatMessage,
      sendReaction,
      getLiveRoomPositionSec,
      subscribeRemotePlayback,
      returnToExternalRoomApp,
      isApplyingRemoteMediaChange,
    ]
  );

  return (
    <ExternalRoomContext.Provider value={value}>{children}</ExternalRoomContext.Provider>
  );
};

export function useExternalRoom(): ExternalRoomContextValue {
  const ctx = useContext(ExternalRoomContext);
  if (!ctx) {
    throw new Error('useExternalRoom must be used inside ExternalRoomProvider');
  }
  return ctx;
}
