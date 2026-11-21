import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
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
const SESSION_SNAPSHOT_KEY = 'loveflix_external_room_snapshot_v1';
const RECENT_HOST_ROOMS_KEY = 'loveflix_recent_host_rooms_v1';
const PEER_ID_KEY = 'loveflix_external_bridge_peer_id_v2';

interface StoredConnectionConfig {
  roomId: string;
  pickerMode: boolean;
  returnUrl: string;
  webhookUrl: string;
  externalWsUrl: string;
  sessionToken: string;
  isHost?: boolean;
}

interface PresencePeerPayload {
  peerId: string;
  name: string;
  avatarSrc?: string;
  source: 'loveflix' | 'external';
  joinedAtMs: number;
  isHost?: boolean;
  mediaSummary?: {
    mediaType: 'movie' | 'tv';
    tmdbId: number;
    imdbId: string | null;
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    season?: number;
    episode?: number;
    episodeTitle?: string;
    channel: 1 | 2 | 3;
  } | null;
}

type RemotePlaybackListener = (playback: ExternalRoomPlayback, livePositionSec: number) => void;

export interface CreateRoomOptions {
  customId?: string;
  initialMedia?: ExternalMediaSelectionInput;
  initialWelcomeMessage?: string;
}

interface ExternalRoomContextValue {
  peerId: string;
  isConnected: boolean;
  isPickerMode: boolean;
  connecting: boolean;
  lastConnectionError: string | null;
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
  createRoom: (optionsOrId?: string | CreateRoomOptions) => Promise<string | null>;
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

function loadSavedSnapshot(roomId: string | null): ExternalRoomSnapshot | null {
  if (!roomId) return null;
  try {
    const raw = sessionStorage.getItem(SESSION_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExternalRoomSnapshot;
    if (parsed && parsed.roomId === roomId) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveSnapshotCache(snapshot: ExternalRoomSnapshot | null): void {
  try {
    if (!snapshot) {
      sessionStorage.removeItem(SESSION_SNAPSHOT_KEY);
    } else {
      sessionStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(snapshot));
    }
  } catch {
    // ignore
  }
}

function saveRecentHostRoom(snapshot: ExternalRoomSnapshot): void {
  if (!snapshot.roomId || !snapshot.media) return;
  try {
    const raw = localStorage.getItem(RECENT_HOST_ROOMS_KEY);
    const map = raw
      ? (JSON.parse(raw) as Record<string, { snapshot: ExternalRoomSnapshot; expiresAtMs: number }>)
      : {};
    const now = Date.now();
    for (const [k, v] of Object.entries(map)) {
      if (!v || v.expiresAtMs <= now) delete map[k];
    }
    map[snapshot.roomId] = {
      snapshot,
      expiresAtMs: now + 6 * 60 * 60 * 1000,
    };
    localStorage.setItem(RECENT_HOST_ROOMS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function loadRecentHostRoom(roomId: string): ExternalRoomSnapshot | null {
  try {
    const raw = localStorage.getItem(RECENT_HOST_ROOMS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<
      string,
      { snapshot: ExternalRoomSnapshot; expiresAtMs: number }
    >;
    const entry = map[roomId];
    if (!entry || entry.expiresAtMs <= Date.now() || !entry.snapshot?.media) {
      return null;
    }
    return entry.snapshot;
  } catch {
    return null;
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

function normalizeRoomCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
}

function mergePeersLists(
  presencePeers: ExternalRoomPeer[],
  serverPeers: ExternalRoomPeer[]
): ExternalRoomPeer[] {
  const byId = new Map<string, ExternalRoomPeer>();
  const now = Date.now();
  for (const p of serverPeers) {
    if (!p?.peerId) continue;
    if (now - (p.lastSeenMs || 0) > 120_000) continue;
    byId.set(p.peerId, p);
  }
  for (const p of presencePeers) {
    if (!p?.peerId) continue;
    const prev = byId.get(p.peerId);
    byId.set(p.peerId, {
      ...(prev || {}),
      ...p,
      avatarSrc: p.avatarSrc || prev?.avatarSrc,
      lastSeenMs: now,
    });
  }
  return Array.from(byId.values()).sort((a, b) => (a.joinedAtMs || 0) - (b.joinedAtMs || 0));
}

function extractPresencePeers(channel: RealtimeChannel): {
  peers: ExternalRoomPeer[];
  fallbackMedia: PresencePeerPayload['mediaSummary'];
} {
  const state = channel.presenceState<PresencePeerPayload>();
  const peers: ExternalRoomPeer[] = [];
  let fallbackMedia: PresencePeerPayload['mediaSummary'] = null;
  const now = Date.now();

  for (const [key, entries] of Object.entries(state || {})) {
    const latest = Array.isArray(entries) && entries.length > 0 ? entries[entries.length - 1] : null;
    if (!latest) continue;
    const pId = latest.peerId || key;
    peers.push({
      peerId: pId,
      name: latest.name || 'Participante',
      avatarSrc: latest.avatarSrc,
      source: latest.source === 'external' ? 'external' : 'loveflix',
      joinedAtMs: Number(latest.joinedAtMs) || now,
      lastSeenMs: now,
      isHost: Boolean(latest.isHost),
    });
    if (!fallbackMedia && latest.mediaSummary) {
      fallbackMedia = latest.mediaSummary;
    }
  }
  return { peers, fallbackMedia };
}

export const ExternalRoomProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activePlayer, startPlayerSession } = useNavigation();
  const { profile } = useUserData();

  const peerId = useMemo(getOrCreatePeerId, []);
  const initialConfig = useMemo(loadSavedConnection, []);
  const initialSnapshot = useMemo(
    () => loadSavedSnapshot(initialConfig?.roomId || null),
    [initialConfig?.roomId]
  );

  const [config, setConfig] = useState<StoredConnectionConfig | null>(initialConfig);
  const configRef = useRef<StoredConnectionConfig | null>(config);
  const [connecting, setConnecting] = useState(false);
  const [lastConnectionError, setLastConnectionError] = useState<string | null>(null);
  const [syncedMedia, setSyncedMedia] = useState<ExternalRoomMedia | null>(
    initialSnapshot?.media || null
  );
  const [syncedPlayback, setSyncedPlayback] = useState<ExternalRoomPlayback | null>(
    initialSnapshot?.playback || null
  );
  const [peers, setPeers] = useState<ExternalRoomPeer[]>(initialSnapshot?.peers || []);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(
    initialSnapshot?.chatMessages || []
  );
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);

  const seqRef = useRef<number>(initialSnapshot?.seq || 0);
  const clockOffsetMsRef = useRef<number>(0);
  const serverWsRef = useRef<WebSocket | null>(null);
  const externalWsRef = useRef<WebSocket | null>(null);
  const supabaseChannelRef = useRef<RealtimeChannel | null>(null);
  const realtimeSubscribedRef = useRef<boolean>(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRetryCountRef = useRef<number>(0);
  const serverPeersRef = useRef<ExternalRoomPeer[]>(initialSnapshot?.peers || []);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const pendingChatMessagesRef = useRef<
    Array<{ id: string; roomId: string; text: string; createdAtMs: number }>
  >([]);
  const applyingRemoteMediaRef = useRef<boolean>(false);
  const activePlayerRef = useRef(activePlayer);
  activePlayerRef.current = activePlayer;

  const latestRoomDataRef = useRef({
    syncedMedia,
    syncedPlayback,
    chatMessages,
    peers,
    profileName: profile?.name || 'Love Flix',
    avatarSrc: profile?.avatarSrc,
  });
  latestRoomDataRef.current = {
    syncedMedia,
    syncedPlayback,
    chatMessages,
    peers,
    profileName: profile?.name || 'Love Flix',
    avatarSrc: profile?.avatarSrc,
  };

  const playbackListenersRef = useRef<Set<RemotePlaybackListener>>(new Set());

  const markEventIdSeen = useCallback((eventId?: string): boolean => {
    if (!eventId) return true;
    if (seenEventIdsRef.current.has(eventId)) return false;
    seenEventIdsRef.current.add(eventId);
    if (seenEventIdsRef.current.size > 400) {
      const oldest = seenEventIdsRef.current.values().next().value;
      if (oldest) seenEventIdsRef.current.delete(oldest);
    }
    return true;
  }, []);

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

  // Persist lightweight snapshot cache whenever room media/chat changes for smooth tab refresh
  useEffect(() => {
    if (!config?.roomId) {
      saveSnapshotCache(null);
      return;
    }
    if (!syncedMedia && chatMessages.length === 0) return;
    const cachedSnapshot: ExternalRoomSnapshot = {
      roomId: config.roomId,
      seq: seqRef.current,
      serverNowMs: Date.now(),
      externalAppUrl: config.returnUrl || null,
      webhookConfigured: Boolean(config.webhookUrl),
      media: syncedMedia,
      playback: syncedPlayback || {
        paused: true,
        positionSec: 0,
        playbackRate: 1,
        action: 'init',
        seq: seqRef.current,
        eventId: 'cache-init',
        actorId: peerId,
        actorName: profile?.name || 'Love Flix',
        updatedAtMs: Date.now(),
      },
      peers,
      chatMessages: chatMessages.slice(-40),
    };
    saveSnapshotCache(cachedSnapshot);
    if (syncedMedia) {
      saveRecentHostRoom(cachedSnapshot);
    }
  }, [
    chatMessages,
    config?.returnUrl,
    config?.roomId,
    config?.webhookUrl,
    peerId,
    peers,
    profile?.name,
    syncedMedia,
    syncedPlayback,
  ]);

  const applyAuthoritativePlayback = useCallback(
    (incoming: ExternalRoomPlayback, notifySubscribers: boolean) => {
      if (incoming.eventId && !markEventIdSeen(incoming.eventId) && notifySubscribers) {
        return;
      }
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
    [markEventIdSeen, peerId]
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
      const snapshotSeq = snapshot.seq || 0;
      if (snapshotSeq < seqRef.current && syncedMedia) return;

      if (typeof snapshot.serverNowMs === 'number') {
        clockOffsetMsRef.current = Math.round(snapshot.serverNowMs - Date.now());
      }
      seqRef.current = Math.max(seqRef.current, snapshotSeq);

      if (Array.isArray(snapshot.peers)) {
        serverPeersRef.current = snapshot.peers;
        setPeers((current) => mergePeersLists(current, snapshot.peers));
      }

      if (Array.isArray(snapshot.chatMessages) && snapshot.chatMessages.length > 0) {
        setChatMessages((current) => {
          const byId = new Map<string, ChatMessage>();
          for (const m of snapshot.chatMessages!) {
            if (m?.id) byId.set(m.id, m);
          }
          for (const m of current) {
            if (!m?.id) continue;
            if (!byId.has(m.id)) {
              const dup = snapshot.chatMessages!.some(
                (rm) =>
                  rm.peerId === m.peerId &&
                  rm.text === m.text &&
                  Math.abs(rm.createdAtMs - m.createdAtMs) < 15_000
              );
              if (!dup) byId.set(m.id, m);
            }
          }
          return Array.from(byId.values())
            .sort((a, b) => a.createdAtMs - b.createdAtMs)
            .slice(-60);
        });
      }

      if (snapshot.media) {
        applyAuthoritativeMedia(snapshot.media, snapshot.playback?.actorId);
      }
      if (snapshot.playback) {
        applyAuthoritativePlayback(snapshot.playback, !isInitial);
      }
    },
    [applyAuthoritativeMedia, applyAuthoritativePlayback, syncedMedia]
  );

  // Probe Supabase Realtime channel when backend memory doesn't hold the room (e.g., Vercel serverless cross-instance)
  const probeRealtimeRoom = useCallback(
    async (roomId: string): Promise<ExternalRoomSnapshot | null> => {
      if (!supabase) return null;
      const channelName = `sessao-flix-probe:${roomId}:${Date.now()}`;
      void channelName;

      return new Promise<ExternalRoomSnapshot | null>((resolve) => {
        let settled = false;
        const sbChannel = supabase!.channel(`sessao-flix:${roomId}`, {
          config: {
            broadcast: { self: false, ack: false },
            presence: { key: `${peerId}_probe` },
          },
        });

        const finish = (result: ExternalRoomSnapshot | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          void supabase!
            .removeChannel(sbChannel)
            .catch(() => {})
            .finally(() => resolve(result));
        };

        const timeoutId = setTimeout(() => {
          const { peers: pPeers, fallbackMedia } = extractPresencePeers(sbChannel);
          if (pPeers.length > 0 && fallbackMedia) {
            const now = Date.now();
            finish({
              roomId,
              seq: 1,
              serverNowMs: now,
              externalAppUrl: null,
              webhookConfigured: false,
              media: {
                mediaType: fallbackMedia.mediaType,
                tmdbId: fallbackMedia.tmdbId,
                imdbId: fallbackMedia.imdbId,
                title: fallbackMedia.title,
                posterPath: fallbackMedia.posterPath,
                backdropPath: fallbackMedia.backdropPath,
                posterUrl: fallbackMedia.posterPath
                  ? `https://image.tmdb.org/t/p/w500${fallbackMedia.posterPath}`
                  : null,
                backdropUrl: fallbackMedia.backdropPath
                  ? `https://image.tmdb.org/t/p/w1280${fallbackMedia.backdropPath}`
                  : null,
                season: fallbackMedia.season,
                episode: fallbackMedia.episode,
                episodeTitle: fallbackMedia.episodeTitle,
                channel: fallbackMedia.channel,
                stream: null,
                updatedBy: pPeers[0]?.name || 'Anfitrião',
                updatedAtMs: now,
              },
              playback: {
                paused: false,
                positionSec: 0,
                playbackRate: 1,
                action: 'init',
                seq: 1,
                eventId: `probe-${now}`,
                actorId: pPeers[0]?.peerId || 'host',
                actorName: pPeers[0]?.name || 'Anfitrião',
                updatedAtMs: now,
              },
              peers: pPeers,
              chatMessages: [],
            });
            return;
          }
          finish(null);
        }, 2500);

        sbChannel
          .on('broadcast', { event: 'room:snapshot' }, ({ payload }) => {
            const snap = (payload as { snapshot?: ExternalRoomSnapshot })?.snapshot;
            if (snap && snap.roomId === roomId) {
              finish(snap);
            }
          })
          .on('presence', { event: 'sync' }, () => {
            const { peers: pPeers } = extractPresencePeers(sbChannel);
            if (pPeers.length > 0) {
              void sbChannel.send({
                type: 'broadcast',
                event: 'room:request_snapshot',
                payload: { requesterId: peerId },
              });
            }
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              void sbChannel.send({
                type: 'broadcast',
                event: 'room:request_snapshot',
                payload: { requesterId: peerId },
              });
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              finish(null);
            }
          });
      });
    },
    [peerId]
  );

  const connectExternalRoom = useCallback(
    async (
      options: ExternalRoomConnectOptions & {
        pickerMode?: boolean;
        userName?: string;
        initialMedia?: ExternalMediaSelectionInput;
        initialWelcomeMessage?: string;
      }
    ): Promise<boolean> => {
      const cleanRoomId = normalizeRoomCode(options.roomId);
      if (cleanRoomId.length < 3 || cleanRoomId.length > 64) {
        setLastConnectionError('Código de sala inválido.');
        return false;
      }

      const mode: 'create' | 'join' =
        options.mode === 'create' ? 'create' : options.mode === 'join' ? 'join' : 'join';
      const activeName = options.userName?.trim() || profile?.name || 'Love Flix';
      setLastConnectionError(null);
      setConnecting(true);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (options.authToken) {
          headers['X-LoveFlix-Key'] = options.authToken.trim();
        }

        const initialMsgId = options.initialWelcomeMessage
          ? `msg_welcome_${peerId}_${Date.now()}`
          : undefined;

        const res = await fetch(`/api/bridge/rooms/${encodeURIComponent(cleanRoomId)}/connect`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            mode,
            peerId,
            peerName: activeName,
            avatarSrc: profile?.avatarSrc,
            source: 'loveflix',
            returnUrl: options.returnUrl?.trim() || undefined,
            webhookUrl: options.webhookUrl?.trim() || undefined,
            media: options.initialMedia || undefined,
            initialMessage: options.initialWelcomeMessage || undefined,
            initialMessageId: initialMsgId,
          }),
        });

        let resolvedRoom: ExternalRoomSnapshot | null = null;
        let sessionToken = options.authToken?.trim() || '';

        if (res.ok) {
          const data = (await res.json()) as {
            ok: boolean;
            sessionToken?: string;
            room?: ExternalRoomSnapshot;
          };
          resolvedRoom = data.room || null;
          sessionToken = data.sessionToken || sessionToken;
        } else if (res.status === 404 && mode === 'join') {
          // Serverless instance didn't have the room in memory; check active Realtime room first,
          // then fallback to recent room opened on this device if host exited and re-entered.
          const realtimeSnapshot =
            (await probeRealtimeRoom(cleanRoomId)) || loadRecentHostRoom(cleanRoomId);
          if (!realtimeSnapshot) {
            setLastConnectionError(
              'Sala não encontrada ou encerrada. Confira o código com quem abriu a sala.'
            );
            return false;
          }

          resolvedRoom = realtimeSnapshot;
          // Hydrate current serverless backend instance in background if media is present
          if (realtimeSnapshot.media) {
            const firstWelcome = (realtimeSnapshot.chatMessages || [])[0];
            void fetch(`/api/bridge/rooms/${encodeURIComponent(cleanRoomId)}/connect`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                mode: 'create',
                peerId,
                peerName: activeName,
                avatarSrc: profile?.avatarSrc,
                source: 'loveflix',
                media: {
                  mediaType: realtimeSnapshot.media.mediaType,
                  tmdbId: realtimeSnapshot.media.tmdbId,
                  imdbId: realtimeSnapshot.media.imdbId,
                  title: realtimeSnapshot.media.title,
                  posterPath: realtimeSnapshot.media.posterPath,
                  backdropPath: realtimeSnapshot.media.backdropPath,
                  season: realtimeSnapshot.media.season,
                  episode: realtimeSnapshot.media.episode,
                  episodeTitle: realtimeSnapshot.media.episodeTitle,
                  channel: realtimeSnapshot.media.channel,
                },
                initialMessage: firstWelcome?.text || undefined,
                initialMessageId: firstWelcome?.id || undefined,
              }),
            }).catch(() => {});
          }
        } else {
          const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
          setLastConnectionError(errJson?.error || 'Não foi possível entrar na sala.');
          return false;
        }

        const resolvedReturnUrl =
          options.returnUrl?.trim() || resolvedRoom?.externalAppUrl || '';
        const nextConfig: StoredConnectionConfig = {
          roomId: cleanRoomId,
          pickerMode: Boolean(options.pickerMode),
          returnUrl: resolvedReturnUrl,
          webhookUrl: options.webhookUrl?.trim() || '',
          externalWsUrl: options.externalWsUrl?.trim() || '',
          sessionToken,
          isHost: mode === 'create',
        };

        seqRef.current = 0;
        seenEventIdsRef.current.clear();
        configRef.current = nextConfig;
        pendingChatMessagesRef.current = pendingChatMessagesRef.current.filter(
          (message) => message.roomId === cleanRoomId
        );
        saveConnectionConfig(nextConfig);
        setConfig(nextConfig);

        if (resolvedRoom) {
          ingestRoomSnapshot(resolvedRoom, true);
        }

        postCrossWindowBridgeMessage({
          type: 'LOVEFLIX_ROOM_CONNECTED',
          roomId: cleanRoomId,
          pickerMode: nextConfig.pickerMode,
          room: resolvedRoom,
        });

        return true;
      } catch {
        setLastConnectionError('Erro de conexão ao tentar entrar na sala.');
        return false;
      } finally {
        setConnecting(false);
      }
    },
    [ingestRoomSnapshot, peerId, probeRealtimeRoom, profile?.avatarSrc, profile?.name]
  );

  const disconnectExternalRoom = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (supabaseChannelRef.current && supabase) {
      const ch = supabaseChannelRef.current;
      supabaseChannelRef.current = null;
      realtimeSubscribedRef.current = false;
      void supabase.removeChannel(ch).catch(() => {});
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

    configRef.current = null;
    pendingChatMessagesRef.current = [];
    serverPeersRef.current = [];
    seenEventIdsRef.current.clear();
    setConfig(null);
    setLastConnectionError(null);
    setSyncedMedia(null);
    setSyncedPlayback(null);
    setPeers([]);
    setChatMessages([]);
    setReactions([]);
    seqRef.current = 0;
    saveConnectionConfig(null);
    saveSnapshotCache(null);
  }, []);

  const createRoom = useCallback(
    async (optionsOrId?: string | CreateRoomOptions): Promise<string | null> => {
      const opts: CreateRoomOptions =
        typeof optionsOrId === 'string' ? { customId: optionsOrId } : optionsOrId || {};

      let code = normalizeRoomCode(opts.customId || '');
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
        mode: 'create',
        userName: profile?.name || 'Love Flix',
        initialMedia: opts.initialMedia,
        initialWelcomeMessage: opts.initialWelcomeMessage,
      });
      return success ? code : null;
    },
    [connectExternalRoom, profile?.name]
  );

  const sendChatMessage = useCallback(
    (text: string) => {
      const clean = text.trim();
      const activeConfig = configRef.current;
      if (!clean || !activeConfig?.roomId) return;
      const currentUserName = profile?.name || 'Espectador Flix';
      const now = Date.now();
      const msgId = `msg_${peerId}_${now}_${Math.random().toString(36).slice(2, 6)}`;
      const localMsg: ChatMessage = {
        id: msgId,
        peerId,
        name: currentUserName,
        text: clean,
        createdAtMs: now,
      };
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === msgId)) return prev;
        return [...prev.slice(-60), localMsg];
      });

      // 1. Real-time Supabase broadcast (instant delivery across Vercel/mobile/tabs)
      if (supabaseChannelRef.current && realtimeSubscribedRef.current) {
        void supabaseChannelRef.current.send({
          type: 'broadcast',
          event: 'chat:message',
          payload: {
            message: localMsg,
            seq: seqRef.current + 1,
          },
        });
      }

      // 2. Node WS if connected, otherwise HTTP fallback endpoint so server/DB persists too
      if (serverWsRef.current && serverWsRef.current.readyState === WebSocket.OPEN) {
        serverWsRef.current.send(
          JSON.stringify({
            type: 'chat:send',
            roomId: activeConfig.roomId,
            id: msgId,
            createdAtMs: now,
            text: clean,
          })
        );
      } else {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (activeConfig.sessionToken) {
          headers['X-Bridge-Token'] = activeConfig.sessionToken;
        }
        fetch(`/api/bridge/rooms/${encodeURIComponent(activeConfig.roomId)}/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: msgId,
            peerId,
            peerName: currentUserName,
            text: clean,
            createdAtMs: now,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.room?.seq) {
              seqRef.current = Math.max(seqRef.current, d.room.seq);
            }
          })
          .catch(() => {
            pendingChatMessagesRef.current.push({
              id: msgId,
              roomId: activeConfig.roomId,
              text: clean,
              createdAtMs: now,
            });
          });
      }
    },
    [peerId, profile?.name]
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      if (!emoji || !config?.roomId) return;
      const currentUserName = profile?.name || 'Espectador Flix';
      const rxId = `rx_${peerId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const localRx: ReactionEvent = {
        id: rxId,
        peerId,
        name: currentUserName,
        emoji,
        createdAtMs: Date.now(),
      };
      markEventIdSeen(rxId);
      setReactions((prev) => [...prev.slice(-25), localRx]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== rxId));
      }, 4000);

      if (supabaseChannelRef.current && realtimeSubscribedRef.current) {
        void supabaseChannelRef.current.send({
          type: 'broadcast',
          event: 'reaction:event',
          payload: { reaction: localRx },
        });
      }

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
    [config?.roomId, markEventIdSeen, peerId, profile?.name]
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
      mode: pickerMode ? 'create' : 'join',
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
          mode: d.mode === 'picker' || Boolean(d.pickerMode) ? 'create' : 'join',
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

  // Maintain Supabase Realtime Channel + Node WebSocket + Adaptive HTTP Sync
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    wsRetryCountRef.current = 0;

    // -----------------------------------------------------------------------
    // A. Supabase Realtime Channel (Presence + Broadcast over wss://)
    //    Works identically on Vercel serverless & local Node dev.
    // -----------------------------------------------------------------------
    if (supabase) {
      const sbChannel = supabase.channel(`sessao-flix:${config.roomId}`, {
        config: {
          broadcast: { self: false, ack: false },
          presence: { key: peerId },
        },
      });
      supabaseChannelRef.current = sbChannel;
      realtimeSubscribedRef.current = false;

      const buildPresencePayload = (): PresencePeerPayload => {
        const m = latestRoomDataRef.current.syncedMedia;
        return {
          peerId,
          name: latestRoomDataRef.current.profileName,
          avatarSrc: latestRoomDataRef.current.avatarSrc,
          source: 'loveflix',
          joinedAtMs: Date.now(),
          isHost: Boolean(config.isHost),
          mediaSummary: m
            ? {
                mediaType: m.mediaType,
                tmdbId: m.tmdbId,
                imdbId: m.imdbId,
                title: m.title,
                posterPath: m.posterPath,
                backdropPath: m.backdropPath,
                season: m.season,
                episode: m.episode,
                episodeTitle: m.episodeTitle,
                channel: m.channel,
              }
            : null,
        };
      };

      sbChannel
        .on('presence', { event: 'sync' }, () => {
          if (cancelled) return;
          const { peers: presencePeers } = extractPresencePeers(sbChannel);
          setPeers(mergePeersLists(presencePeers, serverPeersRef.current));
        })
        .on('broadcast', { event: 'room:request_snapshot' }, ({ payload }) => {
          if (cancelled) return;
          const reqId = (payload as { requesterId?: string })?.requesterId;
          if (!reqId || reqId === peerId) return;
          const current = latestRoomDataRef.current;
          if (!current.syncedMedia && current.chatMessages.length === 0) return;

          const sendSnapshot = () => {
            if (cancelled || !realtimeSubscribedRef.current) return;
            const d = latestRoomDataRef.current;
            const pb = d.syncedPlayback;
            const livePb: ExternalRoomPlayback = pb
              ? {
                  ...pb,
                  positionSec: pb.paused
                    ? Math.max(0, pb.positionSec)
                    : Number(
                        Math.max(
                          0,
                          pb.positionSec +
                            Math.max(
                              0,
                              (Date.now() + clockOffsetMsRef.current - pb.updatedAtMs) / 1000
                            ) *
                              (pb.playbackRate || 1)
                        ).toFixed(3)
                      ),
                  updatedAtMs: Date.now(),
                }
              : {
                  paused: false,
                  positionSec: 0,
                  playbackRate: 1,
                  action: 'init',
                  seq: seqRef.current,
                  eventId: `snap-${Date.now()}`,
                  actorId: peerId,
                  actorName: d.profileName,
                  updatedAtMs: Date.now(),
                };

            void sbChannel.send({
              type: 'broadcast',
              event: 'room:snapshot',
              payload: {
                targetPeerId: reqId,
                snapshot: {
                  roomId: config.roomId,
                  seq: seqRef.current,
                  serverNowMs: Date.now(),
                  externalAppUrl: config.returnUrl || null,
                  webhookConfigured: Boolean(config.webhookUrl),
                  media: d.syncedMedia,
                  playback: livePb,
                  peers: d.peers,
                  chatMessages: d.chatMessages.slice(-50),
                } satisfies ExternalRoomSnapshot,
              },
            });
          };

          if (config.isHost) {
            sendSnapshot();
          } else {
            setTimeout(sendSnapshot, 180);
          }
        })
        .on('broadcast', { event: 'room:snapshot' }, ({ payload }) => {
          if (cancelled) return;
          const p = payload as { targetPeerId?: string; snapshot?: ExternalRoomSnapshot };
          if (p.targetPeerId && p.targetPeerId !== peerId && latestRoomDataRef.current.syncedMedia) {
            return;
          }
          if (p.snapshot) {
            ingestRoomSnapshot(p.snapshot, !latestRoomDataRef.current.syncedMedia);
          }
        })
        .on('broadcast', { event: 'media:updated' }, ({ payload }) => {
          if (cancelled) return;
          const p = payload as {
            media?: ExternalRoomMedia;
            playback?: ExternalRoomPlayback;
            actorId?: string;
            seq?: number;
            eventId?: string;
          };
          if (p.eventId && !markEventIdSeen(p.eventId)) return;
          if (typeof p.seq === 'number') seqRef.current = Math.max(seqRef.current, p.seq);
          if (p.media) {
            applyAuthoritativeMedia(p.media, p.actorId);
          }
          if (p.playback) {
            applyAuthoritativePlayback(p.playback, true);
          }
        })
        .on('broadcast', { event: 'playback:updated' }, ({ payload }) => {
          if (cancelled) return;
          const p = payload as { playback?: ExternalRoomPlayback; seq?: number };
          if (typeof p.seq === 'number') seqRef.current = Math.max(seqRef.current, p.seq);
          if (p.playback) {
            applyAuthoritativePlayback(p.playback, true);
          }
        })
        .on('broadcast', { event: 'chat:message' }, ({ payload }) => {
          if (cancelled) return;
          const p = payload as { message?: ChatMessage; seq?: number };
          if (typeof p.seq === 'number') seqRef.current = Math.max(seqRef.current, p.seq);
          if (p.message?.id) {
            const chatMsg = p.message;
            setChatMessages((prev) => {
              if (prev.some((m) => m.id === chatMsg.id)) return prev;
              return [...prev.slice(-60), chatMsg];
            });
          }
        })
        .on('broadcast', { event: 'reaction:event' }, ({ payload }) => {
          if (cancelled) return;
          const rx = (payload as { reaction?: ReactionEvent })?.reaction;
          if (!rx?.id || !markEventIdSeen(rx.id)) return;
          setReactions((prev) => [...prev.slice(-25), rx]);
          setTimeout(() => {
            setReactions((prev) => prev.filter((r) => r.id !== rx.id));
          }, 4000);
        })
        .subscribe((status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            realtimeSubscribedRef.current = true;
            void sbChannel.track(buildPresencePayload());
            if (!latestRoomDataRef.current.syncedMedia) {
              void sbChannel.send({
                type: 'broadcast',
                event: 'room:request_snapshot',
                payload: { requesterId: peerId },
              });
            }
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            realtimeSubscribedRef.current = false;
          }
        });
    }

    // -----------------------------------------------------------------------
    // B. Server Node WebSocket (active on local/VPS Node server)
    // -----------------------------------------------------------------------
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
        const myName = latestRoomDataRef.current.profileName || 'Love Flix';
        ws.send(JSON.stringify({ type: 'clock:ping', clientSendMs: Date.now() }));
        ws.send(
          JSON.stringify({
            type: 'room:join',
            roomId: config.roomId,
            peerId,
            name: myName,
            avatarSrc: latestRoomDataRef.current.avatarSrc,
            source: 'loveflix',
          })
        );
        const queuedMessages = pendingChatMessagesRef.current.filter(
          (message) => message.roomId === config.roomId
        );
        pendingChatMessagesRef.current = pendingChatMessagesRef.current.filter(
          (message) => message.roomId !== config.roomId
        );
        queuedMessages.forEach((message) => {
          ws.send(
            JSON.stringify({
              type: 'chat:send',
              roomId: message.roomId,
              id: message.id,
              createdAtMs: message.createdAtMs,
              text: message.text,
            })
          );
        });
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
            serverPeersRef.current = msg.peers as ExternalRoomPeer[];
            setPeers((current) => mergePeersLists(current, serverPeersRef.current));
            return;
          }

          if (mType === 'chat:message' && msg.message) {
            if (typeof msg.seq === 'number') {
              seqRef.current = Math.max(seqRef.current, msg.seq);
            }
            const chatMsg = msg.message as ChatMessage;
            setChatMessages((prev) => {
              if (prev.some((m) => m.id === chatMsg.id)) return prev;
              return [...prev.slice(-60), chatMsg];
            });
            return;
          }

          if (mType === 'reaction:event' && msg.reaction) {
            const rx = msg.reaction as ReactionEvent;
            if (!markEventIdSeen(rx.id)) return;
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
        // On serverless hosts (e.g. Vercel), Supabase Realtime handles WebSockets; avoid spamming WS retries
        if (wsRetryCountRef.current > (realtimeSubscribedRef.current ? 1 : 3)) return;
        const delay = Math.min(1500 * Math.pow(1.8, wsRetryCountRef.current - 1), 8000);
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

    // Fallback HTTP poll ONLY when neither Node WS nor Supabase Realtime is connected
    const pollInterval = setInterval(() => {
      if (cancelled || document.visibilityState === 'hidden') return;
      if (
        (serverWsRef.current && serverWsRef.current.readyState === WebSocket.OPEN) ||
        realtimeSubscribedRef.current
      ) {
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
    }, 2200);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (supabaseChannelRef.current && supabase) {
        const ch = supabaseChannelRef.current;
        supabaseChannelRef.current = null;
        realtimeSubscribedRef.current = false;
        void supabase.removeChannel(ch).catch(() => {});
      }
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
    markEventIdSeen,
    peerId,
  ]);

  // Keep Supabase Presence metadata up to date when user profile or synced media changes
  useEffect(() => {
    if (!config || !supabaseChannelRef.current || !realtimeSubscribedRef.current) return;
    void supabaseChannelRef.current.track({
      peerId,
      name: profile?.name || 'Love Flix',
      avatarSrc: profile?.avatarSrc,
      source: 'loveflix',
      joinedAtMs: Date.now(),
      isHost: Boolean(config.isHost),
      mediaSummary: syncedMedia
        ? {
            mediaType: syncedMedia.mediaType,
            tmdbId: syncedMedia.tmdbId,
            imdbId: syncedMedia.imdbId,
            title: syncedMedia.title,
            posterPath: syncedMedia.posterPath,
            backdropPath: syncedMedia.backdropPath,
            season: syncedMedia.season,
            episode: syncedMedia.episode,
            episodeTitle: syncedMedia.episodeTitle,
            channel: syncedMedia.channel,
          }
        : null,
    } satisfies PresencePeerPayload);
  }, [config, peerId, profile?.avatarSrc, profile?.name, syncedMedia]);

  const syncMediaToExternalRoom = useCallback(
    async (selection: ExternalMediaSelectionInput): Promise<ExternalRoomMedia | null> => {
      const activeConfig = configRef.current;
      if (!activeConfig) return null;
      const eventId = `media-${peerId}-${Date.now()}`;
      const actorName = profile?.name || 'Love Flix';

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (activeConfig.sessionToken) {
          headers['X-Bridge-Token'] = activeConfig.sessionToken;
        }

        const res = await fetch(
          `/api/bridge/rooms/${encodeURIComponent(activeConfig.roomId)}/media`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              actorId: peerId,
              actorName,
              eventId,
              media: selection,
            }),
          }
        );

        if (!res.ok) return null;
        const data = (await res.json()) as { ok: boolean; room?: ExternalRoomSnapshot };
        const resolvedMedia = data.room?.media || null;

        if (data.room && resolvedMedia) {
          const responseSeq = data.room.seq || 0;
          if (responseSeq >= seqRef.current) {
            seqRef.current = responseSeq;
            setSyncedMedia(resolvedMedia);
            setSyncedPlayback(data.room.playback);

            if (supabaseChannelRef.current && realtimeSubscribedRef.current) {
              markEventIdSeen(eventId);
              void supabaseChannelRef.current.send({
                type: 'broadcast',
                event: 'media:updated',
                payload: {
                  eventId,
                  seq: responseSeq,
                  actorId: peerId,
                  media: resolvedMedia,
                  playback: data.room.playback,
                },
              });
            }

            postCrossWindowBridgeMessage({
              type: 'LOVEFLIX_MEDIA_SELECTED',
              roomId: activeConfig.roomId,
              media: resolvedMedia,
              playback: data.room.playback,
            });
            postCrossWindowBridgeMessage({
              type: 'LOVEFLIX_ROOM_MEDIA',
              roomId: activeConfig.roomId,
              media: resolvedMedia,
              playback: data.room.playback,
            });

            if (externalWsRef.current && externalWsRef.current.readyState === WebSocket.OPEN) {
              externalWsRef.current.send(
                JSON.stringify({
                  type: 'loveflix:media',
                  roomId: activeConfig.roomId,
                  media: resolvedMedia,
                  playback: data.room.playback,
                })
              );
            }
          }
        }
        return resolvedMedia;
      } catch {
        return null;
      }
    },
    [markEventIdSeen, peerId, profile?.name]
  );

  const syncPlaybackToExternalRoom = useCallback(
    (params: {
      action: ExternalPlaybackAction;
      positionSec: number;
      paused: boolean;
      playbackRate?: number;
    }) => {
      if (!config) return;
      const actorName = profile?.name || 'Love Flix';
      const eventId = `pb-${peerId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const playbackPayload = {
        action: params.action,
        positionSec: Math.max(0, Number(params.positionSec) || 0),
        paused: Boolean(params.paused),
        playbackRate: params.playbackRate || 1,
        eventId,
        actorId: peerId,
        actorName,
      };

      const optimistic: ExternalRoomPlayback = {
        ...playbackPayload,
        seq: seqRef.current + 1,
        updatedAtMs: Date.now() + clockOffsetMsRef.current,
      };
      markEventIdSeen(eventId);
      setSyncedPlayback(optimistic);

      if (supabaseChannelRef.current && realtimeSubscribedRef.current) {
        void supabaseChannelRef.current.send({
          type: 'broadcast',
          event: 'playback:updated',
          payload: {
            seq: optimistic.seq,
            playback: optimistic,
          },
        });
      }

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
            actorName,
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
    [config, markEventIdSeen, peerId, profile?.name]
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
      peerId,
      isConnected: Boolean(config?.roomId),
      isPickerMode: Boolean(config?.pickerMode),
      connecting,
      lastConnectionError,
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
      peerId,
      config,
      connecting,
      lastConnectionError,
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
