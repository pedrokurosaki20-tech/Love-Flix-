import crypto from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import {
  FALLBACK_SERVER_KEY,
  buildHlsProxyPath,
  type SubtitleTrackItem,
} from './hlsEngine.js';
import { discoverCuratedDoramas } from './catalogAvailability.js';
import {
  checkTitleChannelAvailability,
  resolveSuperCdnChannel,
} from './supercdnResolver.js';

export type BridgePlaybackAction =
  | 'init'
  | 'play'
  | 'pause'
  | 'seek'
  | 'ratechange'
  | 'sync';

export interface BridgeStreamMetadata {
  mode: 'hls' | 'video' | 'embed' | 'unavailable';
  streamUrl: string | null;
  playerEmbedUrl: string;
  subtitleTracks: SubtitleTrackItem[];
  availableChannels: Array<1 | 2 | 3>;
}

export interface BridgeMediaState {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  imdbId: string | null;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  channel: 1 | 2 | 3;
  stream: BridgeStreamMetadata | null;
  updatedBy: string;
  updatedAtMs: number;
}

export interface BridgePlaybackState {
  paused: boolean;
  positionSec: number;
  playbackRate: number;
  action: BridgePlaybackAction;
  seq: number;
  eventId: string;
  actorId: string;
  actorName: string;
  updatedAtMs: number;
}

export interface BridgePeerInfo {
  peerId: string;
  name: string;
  source: 'loveflix' | 'external';
  joinedAtMs: number;
  lastSeenMs: number;
}

export interface BridgeChatMessage {
  id: string;
  peerId: string;
  name: string;
  text: string;
  createdAtMs: number;
}

export interface BridgeRoomRecord {
  roomId: string;
  media: BridgeMediaState | null;
  playback: BridgePlaybackState;
  webhookUrl: string | null;
  externalAppUrl: string | null;
  peers: Map<string, BridgePeerInfo>;
  chatMessages: BridgeChatMessage[];
  seenEventIds: Set<string>;
  seq: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export type BridgeBroadcastFn = (
  roomId: string,
  payload: Record<string, unknown>,
  excludePeerId?: string
) => void;

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const ROOM_IDLE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_BRIDGE_ROOMS = 600;

export const bridgeRoomsStore = new Map<string, BridgeRoomRecord>();
let realtimeBroadcaster: BridgeBroadcastFn | null = null;

export function registerBridgeBroadcaster(fn: BridgeBroadcastFn): void {
  realtimeBroadcaster = fn;
}

export function notifyBridgeRealtimePeers(
  roomId: string,
  payload: Record<string, unknown>,
  excludePeerId?: string
): void {
  if (realtimeBroadcaster) {
    realtimeBroadcaster(roomId, payload, excludePeerId);
  }
}

const INTERNAL_BRIDGE_SEED = 'lvfx-internal-bridge-core-9f4c2e8a71b64d30a5e2';

function getBridgeSigningSecret(): string {
  const customEnv = (process.env.LOVEFLIX_BRIDGE_SECRET || '').trim();
  const seed =
    customEnv && customEnv !== 'YOUR_LOVEFLIX_BRIDGE_SECRET'
      ? customEnv
      : INTERNAL_BRIDGE_SEED;
  return crypto
    .createHash('sha256')
    .update(`loveflix-bridge-signing-v1:${seed}`)
    .digest('hex');
}

export function getPlatformBridgeApiKey(): string {
  const defaultSecret = crypto
    .createHash('sha256')
    .update(`loveflix-bridge-signing-v1:${INTERNAL_BRIDGE_SEED}`)
    .digest('hex');
  const digest = crypto
    .createHmac('sha256', defaultSecret)
    .update('loveflix-platform-api-key:v1')
    .digest('hex')
    .slice(0, 36);
  return `lf_live_${digest}`;
}

function getAcceptedPlatformBridgeKeys(): string[] {
  const keys = [getPlatformBridgeApiKey()];
  const envDrivenDigest = crypto
    .createHmac('sha256', getBridgeSigningSecret())
    .update('loveflix-platform-api-key:v1')
    .digest('hex')
    .slice(0, 36);
  const envKey = `lf_live_${envDrivenDigest}`;
  if (!keys.includes(envKey)) keys.push(envKey);

  const customEnv = (process.env.LOVEFLIX_BRIDGE_SECRET || '').trim();
  if (customEnv && customEnv !== 'YOUR_LOVEFLIX_BRIDGE_SECRET' && customEnv.length >= 8) {
    keys.push(customEnv);
  }
  return keys;
}

export function createRoomSessionToken(roomId: string, ttlSec = 86_400): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${roomId}.${exp}`;
  const sig = crypto
    .createHmac('sha256', getBridgeSigningSecret())
    .update(`room-token:${payload}`)
    .digest('hex')
    .slice(0, 28);
  return `lf_room_${Buffer.from(roomId, 'utf8').toString('base64url')}.${exp}.${sig}`;
}

export function verifyRoomSessionToken(token: string, expectedRoomId?: string): boolean {
  if (!token || !token.startsWith('lf_room_')) return false;
  const parts = token.slice('lf_room_'.length).split('.');
  if (parts.length !== 3) return false;
  try {
    const roomId = Buffer.from(parts[0], 'base64url').toString('utf8');
    const exp = Number(parts[1]);
    const sig = parts[2];
    if (!roomId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return false;
    }
    if (expectedRoomId && roomId !== expectedRoomId) {
      return false;
    }
    const expectedSig = crypto
      .createHmac('sha256', getBridgeSigningSecret())
      .update(`room-token:${roomId}.${exp}`)
      .digest('hex')
      .slice(0, 28);
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

export function isBridgeAuthorized(
  tokenOrKey: string | undefined | null,
  roomId?: string
): boolean {
  const clean = String(tokenOrKey || '').trim();
  if (!clean) return false;
  const validKeys = getAcceptedPlatformBridgeKeys();
  for (const key of validKeys) {
    if (
      clean.length === key.length &&
      crypto.timingSafeEqual(Buffer.from(clean), Buffer.from(key))
    ) {
      return true;
    }
  }
  return verifyRoomSessionToken(clean, roomId);
}

function extractRequestToken(req: Request): string {
  const headerKey = req.headers['x-loveflix-key'] || req.headers['x-bridge-token'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && /^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, '').trim();
  }
  if (typeof req.query.key === 'string' && req.query.key.trim()) {
    return req.query.key.trim();
  }
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return '';
}

function isSameOriginLoveFlixRequest(req: Request): boolean {
  const host = String(req.headers.host || '').toLowerCase();
  if (!host) return false;
  const referer = String(req.headers.referer || '');
  const origin = String(req.headers.origin || '');
  const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();

  if (secFetchSite === 'same-origin') return true;
  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() === host) return true;
    } catch {
      // ignore
    }
  }
  if (referer) {
    try {
      if (new URL(referer).host.toLowerCase() === host) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export function isValidBridgeRoomId(roomId: string): boolean {
  return /^[a-zA-Z0-9_-]{3,64}$/.test(roomId);
}

function sanitizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // ignore invalid URL
  }
  return null;
}

function pruneBridgeRooms(): void {
  const now = Date.now();
  for (const [id, room] of bridgeRoomsStore.entries()) {
    for (const [peerId, peer] of room.peers.entries()) {
      if (now - peer.lastSeenMs > 90_000) {
        room.peers.delete(peerId);
      }
    }
    if (room.peers.size === 0 && now - room.updatedAtMs > ROOM_IDLE_TTL_MS) {
      bridgeRoomsStore.delete(id);
    }
  }
  while (bridgeRoomsStore.size > MAX_BRIDGE_ROOMS) {
    const oldestKey = bridgeRoomsStore.keys().next().value;
    if (!oldestKey) break;
    bridgeRoomsStore.delete(oldestKey);
  }
}

export function getOrCreateBridgeRoom(roomId: string): BridgeRoomRecord {
  pruneBridgeRooms();
  let room = bridgeRoomsStore.get(roomId);
  if (!room) {
    const now = Date.now();
    room = {
      roomId,
      media: null,
      playback: {
        paused: true,
        positionSec: 0,
        playbackRate: 1,
        action: 'init',
        seq: 0,
        eventId: `init-${now}`,
        actorId: 'system',
        actorName: 'Sistema',
        updatedAtMs: now,
      },
      webhookUrl: null,
      externalAppUrl: null,
      peers: new Map(),
      chatMessages: [],
      seenEventIds: new Set(),
      seq: 0,
      createdAtMs: now,
      updatedAtMs: now,
    };
    bridgeRoomsStore.set(roomId, room);
  }
  return room;
}

export function computeLiveBridgePositionSec(
  playback: BridgePlaybackState,
  nowMs = Date.now()
): number {
  if (playback.paused) return Math.max(0, playback.positionSec);
  const elapsedSec = Math.max(0, (nowMs - playback.updatedAtMs) / 1000);
  const rate = playback.playbackRate > 0 ? playback.playbackRate : 1;
  return Math.max(0, playback.positionSec + elapsedSec * rate);
}

export function serializeBridgeRoom(room: BridgeRoomRecord) {
  const now = Date.now();
  return {
    roomId: room.roomId,
    seq: room.seq,
    serverNowMs: now,
    externalAppUrl: room.externalAppUrl,
    webhookConfigured: Boolean(room.webhookUrl),
    media: room.media,
    playback: {
      ...room.playback,
      positionSec: Number(computeLiveBridgePositionSec(room.playback, now).toFixed(3)),
      updatedAtMs: now,
    },
    peers: Array.from(room.peers.values()),
    chatMessages: (room.chatMessages || []).slice(-50),
  };
}

export function addChatMessageToBridgeRoom(
  room: BridgeRoomRecord,
  msg: { peerId: string; name: string; text: string }
): BridgeChatMessage {
  if (!room.chatMessages) room.chatMessages = [];
  const chatMsg: BridgeChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    peerId: msg.peerId,
    name: msg.name,
    text: msg.text.slice(0, 500),
    createdAtMs: Date.now(),
  };
  room.chatMessages.push(chatMsg);
  if (room.chatMessages.length > 80) {
    room.chatMessages.shift();
  }
  return chatMsg;
}

function recordSeenEventId(room: BridgeRoomRecord, eventId: string): boolean {
  if (!eventId) return true;
  if (room.seenEventIds.has(eventId)) return false;
  room.seenEventIds.add(eventId);
  if (room.seenEventIds.size > 500) {
    const oldest = room.seenEventIds.values().next().value;
    if (oldest) room.seenEventIds.delete(oldest);
  }
  return true;
}

function dispatchRoomWebhook(
  room: BridgeRoomRecord,
  eventType: 'media:updated' | 'playback:updated',
  data: Record<string, unknown>
): void {
  if (!room.webhookUrl) return;
  const target = room.webhookUrl;
  const body = JSON.stringify({
    event: eventType,
    roomId: room.roomId,
    seq: room.seq,
    sentAtMs: Date.now(),
    ...data,
  });
  const sig = crypto
    .createHmac('sha256', getBridgeSigningSecret())
    .update(body)
    .digest('hex');

  fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-LoveFlix-Event': eventType,
      'X-LoveFlix-Room': room.roomId,
      'X-LoveFlix-Signature': `sha256=${sig}`,
    },
    body,
    signal: AbortSignal.timeout(4500),
  }).catch(() => {
    // Non-blocking outbound webhook delivery
  });
}

function resolveRequestOrigin(req?: Request): string {
  if (req) {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
      .split(',')[0]
      .trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim();
    if (host) return `${proto}://${host}`;
  }
  return (process.env.APP_URL || 'https://love-flix.vercel.app').replace(/\/+$/, '');
}

async function lookupTmdbMetadataIfMissing(
  mediaType: 'movie' | 'tv',
  tmdbId: number
): Promise<{
  imdbId: string | null;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
}> {
  const apiKey = process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
  if (!apiKey || !tmdbId) {
    return { imdbId: null, title: '', posterPath: null, backdropPath: null };
  }
  try {
    const url = new URL(`${TMDB_BASE_URL}/${mediaType}/${tmdbId}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', 'pt-BR');
    url.searchParams.set('append_to_response', 'external_ids');
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) {
      return { imdbId: null, title: '', posterPath: null, backdropPath: null };
    }
    const json = (await res.json()) as {
      imdb_id?: string | null;
      external_ids?: { imdb_id?: string | null };
      title?: string;
      name?: string;
      poster_path?: string | null;
      backdrop_path?: string | null;
    };
    return {
      imdbId: json.imdb_id || json.external_ids?.imdb_id || null,
      title: json.title || json.name || '',
      posterPath: json.poster_path || null,
      backdropPath: json.backdrop_path || null,
    };
  } catch {
    return { imdbId: null, title: '', posterPath: null, backdropPath: null };
  }
}

export async function resolveBridgeStreamMetadata(params: {
  originUrl: string;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  imdbId: string | null;
  season?: number;
  episode?: number;
  channel: 1 | 2 | 3;
}): Promise<{ imdbId: string | null; stream: BridgeStreamMetadata }> {
  const { originUrl, mediaType, tmdbId, channel } = params;
  const seasonStr = String(Math.max(1, params.season || 1));
  const episodeStr = String(Math.max(1, params.episode || 1));
  const superType: 'movie' | 'tvshow' = mediaType === 'tv' ? 'tvshow' : 'movie';

  let imdbId = params.imdbId && /^tt\d{4,12}$/i.test(params.imdbId) ? params.imdbId : null;
  if (!imdbId && tmdbId > 0) {
    const meta = await lookupTmdbMetadataIfMissing(mediaType, tmdbId);
    imdbId = meta.imdbId;
  }

  const embedQuery = new URLSearchParams({
    type: superType,
    imdb: imdbId || '',
    tmdbId: String(tmdbId || ''),
    channel: String(channel),
  });
  if (superType === 'tvshow') {
    embedQuery.set('season', seasonStr);
    embedQuery.set('episode', episodeStr);
  }
  const playerEmbedUrl = `${originUrl}/api/supercdn/stream?${embedQuery.toString()}`;

  try {
    const [availability, resolved] = await Promise.all([
      checkTitleChannelAvailability({
        type: superType,
        imdb: imdbId || '',
        tmdbId: tmdbId ? String(tmdbId) : undefined,
        season: seasonStr,
        episode: episodeStr,
      }).catch(() => ({
        availableChannels: [1, 2, 3] as Array<1 | 2 | 3>,
        recommendedChannel: 1 as const,
        channels: { 1: true, 2: true, 3: true },
      })),
      resolveSuperCdnChannel({
        type: superType,
        imdb: imdbId || '',
        tmdbId: tmdbId ? String(tmdbId) : undefined,
        season: seasonStr,
        episode: episodeStr,
        channel,
        warmOnly: false,
      }).catch(() => null),
    ]);

    const subtitles = (resolved?.subtitleTracks || []).map((t) => ({
      ...t,
      src: t.src.startsWith('/') ? `${originUrl}${t.src}` : t.src,
    }));

    if (resolved && resolved.available) {
      if (resolved.masterHlsUrl && resolved.embedOrigin) {
        const relProxy = buildHlsProxyPath(
          resolved.masterHlsUrl,
          resolved.embedOrigin,
          'manifest'
        );
        return {
          imdbId,
          stream: {
            mode: 'hls',
            streamUrl: `${originUrl}${relProxy}`,
            playerEmbedUrl,
            subtitleTracks: subtitles,
            availableChannels: availability.availableChannels,
          },
        };
      }

      if (resolved.directMediaUrl) {
        const isHls = /\.m3u8(\?|$)/i.test(resolved.directMediaUrl);
        return {
          imdbId,
          stream: {
            mode: isHls ? 'hls' : 'video',
            streamUrl: resolved.directMediaUrl,
            playerEmbedUrl,
            subtitleTracks: subtitles,
            availableChannels: availability.availableChannels,
          },
        };
      }

      if (resolved.kind === 'redirect' && resolved.url) {
        return {
          imdbId,
          stream: {
            mode: 'embed',
            streamUrl: resolved.url,
            playerEmbedUrl,
            subtitleTracks: [],
            availableChannels: availability.availableChannels,
          },
        };
      }
    }

    return {
      imdbId,
      stream: {
        mode: 'unavailable',
        streamUrl: null,
        playerEmbedUrl,
        subtitleTracks: [],
        availableChannels: availability.availableChannels,
      },
    };
  } catch {
    return {
      imdbId,
      stream: {
        mode: 'embed',
        streamUrl: playerEmbedUrl,
        playerEmbedUrl,
        subtitleTracks: [],
        availableChannels: [1, 2, 3],
      },
    };
  }
}

export async function applyBridgeMediaUpdate(params: {
  room: BridgeRoomRecord;
  originUrl: string;
  rawMedia: Record<string, unknown>;
  actorId: string;
  actorName: string;
  eventId?: string;
}): Promise<BridgeMediaState | null> {
  const { room, originUrl, rawMedia, actorId, actorName } = params;
  const tmdbId = Number(rawMedia.tmdbId || rawMedia.id) || 0;
  const rawType = String(rawMedia.mediaType || rawMedia.type || 'movie').toLowerCase();
  const mediaType: 'movie' | 'tv' =
    rawType === 'tv' || rawType === 'tvshow' || rawType === 'series' ? 'tv' : 'movie';

  if (!tmdbId && !rawMedia.imdbId) return null;

  const eventId =
    String(params.eventId || rawMedia.eventId || '').trim() ||
    `media-${actorId}-${Date.now()}`;
  if (!recordSeenEventId(room, eventId)) {
    return room.media;
  }

  const rawCh = Number(rawMedia.channel);
  const channel: 1 | 2 | 3 = rawCh === 2 ? 2 : rawCh === 3 ? 3 : 1;
  const season = mediaType === 'tv' ? Math.max(1, Number(rawMedia.season) || 1) : undefined;
  const episode = mediaType === 'tv' ? Math.max(1, Number(rawMedia.episode) || 1) : undefined;
  const episodeTitle =
    mediaType === 'tv' && rawMedia.episodeTitle
      ? String(rawMedia.episodeTitle).slice(0, 180)
      : undefined;

  let title = String(rawMedia.title || '').trim().slice(0, 200);
  let imdbId =
    typeof rawMedia.imdbId === 'string' && /^tt\d{4,12}$/i.test(rawMedia.imdbId.trim())
      ? rawMedia.imdbId.trim()
      : null;
  let posterPath =
    typeof rawMedia.posterPath === 'string' ? rawMedia.posterPath.slice(0, 200) : null;
  let backdropPath =
    typeof rawMedia.backdropPath === 'string' ? rawMedia.backdropPath.slice(0, 200) : null;

  if ((!title || !imdbId || !posterPath) && tmdbId > 0) {
    const fetched = await lookupTmdbMetadataIfMissing(mediaType, tmdbId);
    if (!title && fetched.title) title = fetched.title;
    if (!imdbId && fetched.imdbId) imdbId = fetched.imdbId;
    if (!posterPath && fetched.posterPath) posterPath = fetched.posterPath;
    if (!backdropPath && fetched.backdropPath) backdropPath = fetched.backdropPath;
  }

  const resolvedStream = await resolveBridgeStreamMetadata({
    originUrl,
    mediaType,
    tmdbId,
    imdbId,
    season,
    episode,
    channel,
  });

  if (!imdbId && resolvedStream.imdbId) {
    imdbId = resolvedStream.imdbId;
  }

  const now = Date.now();
  const isDifferentEpisodeOrTitle =
    !room.media ||
    room.media.tmdbId !== tmdbId ||
    room.media.mediaType !== mediaType ||
    room.media.season !== season ||
    room.media.episode !== episode;

  const mediaState: BridgeMediaState = {
    mediaType,
    tmdbId,
    imdbId,
    title: title || 'Conteúdo selecionado',
    posterPath,
    backdropPath,
    posterUrl: posterPath ? `${TMDB_IMAGE_BASE}/w500${posterPath}` : null,
    backdropUrl: backdropPath ? `${TMDB_IMAGE_BASE}/w1280${backdropPath}` : null,
    season,
    episode,
    episodeTitle,
    channel,
    stream: resolvedStream.stream,
    updatedBy: actorName || actorId,
    updatedAtMs: now,
  };

  room.media = mediaState;
  room.seq += 1;
  room.updatedAtMs = now;

  if (isDifferentEpisodeOrTitle) {
    room.playback = {
      paused: false,
      positionSec: 0,
      playbackRate: 1,
      action: 'init',
      seq: room.seq,
      eventId: `pb-${eventId}`,
      actorId,
      actorName: actorName || 'Participante',
      updatedAtMs: now,
    };
  }

  const eventPayload = {
    type: 'media:updated',
    roomId: room.roomId,
    seq: room.seq,
    media: room.media,
    playback: room.playback,
    actorId,
    actorName,
    serverNowMs: now,
  };

  notifyBridgeRealtimePeers(room.roomId, eventPayload);
  dispatchRoomWebhook(room, 'media:updated', {
    media: room.media,
    playback: room.playback,
    actorId,
    actorName,
  });

  return mediaState;
}

export function applyBridgePlaybackUpdate(params: {
  room: BridgeRoomRecord;
  rawPlayback: Record<string, unknown>;
  actorId: string;
  actorName: string;
  excludePeerId?: string;
}): BridgePlaybackState {
  const { room, rawPlayback, actorId, actorName, excludePeerId } = params;
  const now = Date.now();
  const eventId =
    String(rawPlayback.eventId || '').trim() ||
    `pb-${actorId}-${now}-${Math.random().toString(36).slice(2, 6)}`;

  if (!recordSeenEventId(room, eventId)) {
    return room.playback;
  }

  const rawAction = String(rawPlayback.action || '').toLowerCase();
  const allowedActions: BridgePlaybackAction[] = [
    'init',
    'play',
    'pause',
    'seek',
    'ratechange',
    'sync',
  ];
  const paused =
    typeof rawPlayback.paused === 'boolean'
      ? rawPlayback.paused
      : rawAction === 'pause'
      ? true
      : rawAction === 'play'
      ? false
      : room.playback.paused;

  const action: BridgePlaybackAction = allowedActions.includes(
    rawAction as BridgePlaybackAction
  )
    ? (rawAction as BridgePlaybackAction)
    : paused
    ? 'pause'
    : 'play';

  const rawPos = Number(rawPlayback.positionSec);
  const positionSec =
    Number.isFinite(rawPos) && rawPos >= 0
      ? rawPos
      : computeLiveBridgePositionSec(room.playback, now);

  const rawRate = Number(rawPlayback.playbackRate);
  const playbackRate =
    Number.isFinite(rawRate) && rawRate >= 0.25 && rawRate <= 4
      ? rawRate
      : room.playback.playbackRate || 1;

  room.seq += 1;
  room.playback = {
    paused,
    positionSec: Number(positionSec.toFixed(3)),
    playbackRate,
    action,
    seq: room.seq,
    eventId,
    actorId,
    actorName: actorName || 'Participante',
    updatedAtMs: now,
  };
  room.updatedAtMs = now;

  const eventPayload = {
    type: 'playback:updated',
    roomId: room.roomId,
    seq: room.seq,
    playback: room.playback,
    serverNowMs: now,
  };

  notifyBridgeRealtimePeers(room.roomId, eventPayload, excludePeerId);
  dispatchRoomWebhook(room, 'playback:updated', {
    playback: room.playback,
    media: room.media,
  });

  return room.playback;
}

function applyBridgeCors(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-LoveFlix-Key, X-Bridge-Token'
  );
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

function ensureBridgeRequestAuth(req: Request, res: Response, roomId?: string): boolean {
  if (isSameOriginLoveFlixRequest(req)) return true;
  const token = extractRequestToken(req);
  if (isBridgeAuthorized(token, roomId)) return true;
  res.status(401).json({
    ok: false,
    error:
      'Autenticação necessária. Envie o cabeçalho X-LoveFlix-Key ou Authorization: Bearer <chave>.',
  });
  return false;
}

export function registerExternalBridgeRoutes(app: Express): void {
  app.use('/api/bridge', applyBridgeCors);

  // 1. Integration Credentials & Endpoints (same-origin Love Flix owner panel)
  app.get('/api/bridge/credentials', (req: Request, res: Response) => {
    if (!isSameOriginLoveFlixRequest(req) && !isBridgeAuthorized(extractRequestToken(req))) {
      res.status(403).json({
        ok: false,
        error: 'Acesso restrito ao painel da plataforma Love Flix.',
      });
      return;
    }

    const origin = resolveRequestOrigin(req);
    const wsProto = origin.startsWith('https://') ? 'wss://' : 'ws://';
    const wsBase = origin.replace(/^https?:\/\//, wsProto);

    res.json({
      ok: true,
      bridgeApiKey: getPlatformBridgeApiKey(),
      endpoints: {
        baseUrl: `${origin}/api/bridge`,
        connectRoom: `${origin}/api/bridge/rooms/:roomId/connect`,
        roomState: `${origin}/api/bridge/rooms/:roomId`,
        syncMedia: `${origin}/api/bridge/rooms/:roomId/media`,
        syncPlayback: `${origin}/api/bridge/rooms/:roomId/playback`,
        catalog: `${origin}/api/bridge/catalog`,
        streamSource: `${origin}/api/bridge/stream-source`,
        websocket: `${wsBase}/api/bridge/ws`,
        deepLinkTemplate: `${origin}/?sala={ROOM_ID}&mode=picker`,
      },
    });
  });

  // 2. Connect / Pair Room Session (returns room-scoped session token + authoritative state)
  app.post('/api/bridge/rooms/:roomId/connect', (req: Request, res: Response) => {
    const roomId = String(req.params.roomId || '').trim();
    if (!isValidBridgeRoomId(roomId)) {
      res.status(400).json({ ok: false, error: 'Código de sala inválido (use 3 a 64 caracteres).' });
      return;
    }
    if (!ensureBridgeRequestAuth(req, res, roomId)) return;

    const room = getOrCreateBridgeRoom(roomId);
    const webhookUrl = sanitizeHttpUrl(req.body?.webhookUrl);
    const externalAppUrl = sanitizeHttpUrl(req.body?.externalAppUrl || req.body?.returnUrl);
    if (webhookUrl !== null || req.body?.webhookUrl === '') {
      room.webhookUrl = webhookUrl;
    }
    if (externalAppUrl !== null || req.body?.externalAppUrl === '') {
      room.externalAppUrl = externalAppUrl;
    }

    const peerId = String(req.body?.peerId || '').trim().slice(0, 64);
    if (peerId) {
      const now = Date.now();
      room.peers.set(peerId, {
        peerId,
        name: String(req.body?.peerName || 'Sala Conectada').trim().slice(0, 40),
        source: req.body?.source === 'external' ? 'external' : 'loveflix',
        joinedAtMs: room.peers.get(peerId)?.joinedAtMs || now,
        lastSeenMs: now,
      });
    }

    room.updatedAtMs = Date.now();
    const sessionToken = createRoomSessionToken(roomId);

    res.json({
      ok: true,
      sessionToken,
      room: serializeBridgeRoom(room),
    });
  });

  // 3. Read Authoritative Room State (supports ?sinceSeq=N for lightweight delta checks)
  app.get('/api/bridge/rooms/:roomId', (req: Request, res: Response) => {
    const roomId = String(req.params.roomId || '').trim();
    if (!isValidBridgeRoomId(roomId)) {
      res.status(400).json({ ok: false, error: 'Código de sala inválido.' });
      return;
    }
    if (!ensureBridgeRequestAuth(req, res, roomId)) return;

    const room = getOrCreateBridgeRoom(roomId);
    const peerId = String(req.query.peerId || '').trim().slice(0, 64);
    if (peerId && room.peers.has(peerId)) {
      const p = room.peers.get(peerId);
      if (p) p.lastSeenMs = Date.now();
    }

    const sinceSeq = Number(req.query.sinceSeq);
    if (Number.isFinite(sinceSeq) && sinceSeq === room.seq) {
      res.json({
        ok: true,
        unchanged: true,
        seq: room.seq,
        serverNowMs: Date.now(),
      });
      return;
    }

    res.json({
      ok: true,
      unchanged: false,
      room: serializeBridgeRoom(room),
    });
  });

  // 4. Update Synced Content (Movie, Series, Anime, Dorama, Documentary, Season, Episode, Channel)
  app.post('/api/bridge/rooms/:roomId/media', async (req: Request, res: Response) => {
    try {
      const roomId = String(req.params.roomId || '').trim();
      if (!isValidBridgeRoomId(roomId)) {
        res.status(400).json({ ok: false, error: 'Código de sala inválido.' });
        return;
      }
      if (!ensureBridgeRequestAuth(req, res, roomId)) return;

      const room = getOrCreateBridgeRoom(roomId);
      const rawMedia =
        req.body?.media && typeof req.body.media === 'object'
          ? (req.body.media as Record<string, unknown>)
          : (req.body as Record<string, unknown>);

      const actorId = String(req.body?.actorId || 'loveflix-user').slice(0, 64);
      const actorName = String(req.body?.actorName || 'Love Flix').slice(0, 40);
      const originUrl = resolveRequestOrigin(req);

      const updated = await applyBridgeMediaUpdate({
        room,
        originUrl,
        rawMedia,
        actorId,
        actorName,
        eventId: typeof req.body?.eventId === 'string' ? req.body.eventId : undefined,
      });

      if (!updated) {
        res.status(400).json({
          ok: false,
          error: 'Informe tmdbId (ou id) e mediaType ("movie" ou "tv").',
        });
        return;
      }

      res.json({
        ok: true,
        room: serializeBridgeRoom(room),
      });
    } catch {
      res.status(500).json({ ok: false, error: 'Falha ao sincronizar conteúdo da sala.' });
    }
  });

  // 5. Update Synced Playback (play, pause, seek / adiantar / retroceder, playbackRate)
  app.post('/api/bridge/rooms/:roomId/playback', (req: Request, res: Response) => {
    const roomId = String(req.params.roomId || '').trim();
    if (!isValidBridgeRoomId(roomId)) {
      res.status(400).json({ ok: false, error: 'Código de sala inválido.' });
      return;
    }
    if (!ensureBridgeRequestAuth(req, res, roomId)) return;

    const room = getOrCreateBridgeRoom(roomId);
    const rawPlayback =
      req.body?.playback && typeof req.body.playback === 'object'
        ? (req.body.playback as Record<string, unknown>)
        : (req.body as Record<string, unknown>);

    const actorId = String(req.body?.actorId || rawPlayback.actorId || 'peer').slice(0, 64);
    const actorName = String(req.body?.actorName || rawPlayback.actorName || 'Participante').slice(
      0,
      40
    );

    applyBridgePlaybackUpdate({
      room,
      rawPlayback,
      actorId,
      actorName,
    });

    res.json({
      ok: true,
      room: serializeBridgeRoom(room),
    });
  });

  // 6. Direct Stream Resolver for External Room Player (Movies, Series, Animes, Doramas, Docs)
  app.get('/api/bridge/stream-source', async (req: Request, res: Response) => {
    try {
      if (!ensureBridgeRequestAuth(req, res)) return;

      const rawType = String(req.query.mediaType || req.query.type || 'movie').toLowerCase();
      const mediaType: 'movie' | 'tv' =
        rawType === 'tv' || rawType === 'tvshow' || rawType === 'series' ? 'tv' : 'movie';
      const tmdbId = Number(req.query.tmdbId || req.query.id) || 0;
      const imdbId =
        typeof req.query.imdb === 'string' && /^tt\d{4,12}$/i.test(req.query.imdb.trim())
          ? req.query.imdb.trim()
          : null;
      const season = Math.max(1, Number(req.query.season) || 1);
      const episode = Math.max(1, Number(req.query.episode) || 1);
      const rawCh = Number(req.query.channel) || 1;
      const channel: 1 | 2 | 3 = rawCh === 2 ? 2 : rawCh === 3 ? 3 : 1;

      if (!tmdbId && !imdbId) {
        res.status(400).json({ ok: false, error: 'Informe tmdbId ou imdb.' });
        return;
      }

      const originUrl = resolveRequestOrigin(req);
      const resolved = await resolveBridgeStreamMetadata({
        originUrl,
        mediaType,
        tmdbId,
        imdbId,
        season,
        episode,
        channel,
      });

      res.json({
        ok: true,
        mediaType,
        tmdbId,
        imdbId: resolved.imdbId,
        season: mediaType === 'tv' ? season : undefined,
        episode: mediaType === 'tv' ? episode : undefined,
        channel,
        ...resolved.stream,
      });
    } catch {
      res.status(502).json({ ok: false, error: 'Falha ao resolver stream para a sala externa.' });
    }
  });

  // 7. Catalog Search & Category Endpoint for External Room App
  app.get('/api/bridge/catalog', async (req: Request, res: Response) => {
    try {
      if (!ensureBridgeRequestAuth(req, res)) return;

      const apiKey = process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
      const query = String(req.query.q || req.query.query || '').trim();
      const category = String(req.query.category || 'trending').toLowerCase();
      const page = String(Math.max(1, Number(req.query.page) || 1));

      if (!query && category === 'doramas') {
        const doramas = await discoverCuratedDoramas({ page });
        res.json({ ok: true, ...(doramas || { page: 1, results: [], total_pages: 0 }) });
        return;
      }

      const url = new URL(
        query
          ? `${TMDB_BASE_URL}/search/multi`
          : category === 'movies'
          ? `${TMDB_BASE_URL}/discover/movie`
          : category === 'series'
          ? `${TMDB_BASE_URL}/discover/tv`
          : category === 'animes'
          ? `${TMDB_BASE_URL}/discover/tv`
          : category === 'documentaries'
          ? `${TMDB_BASE_URL}/discover/movie`
          : `${TMDB_BASE_URL}/trending/all/week`
      );

      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('language', 'pt-BR');
      url.searchParams.set('include_adult', 'false');
      url.searchParams.set('page', page);

      if (query) {
        url.searchParams.set('query', query);
      } else if (category === 'animes') {
        url.searchParams.set('with_genres', '16');
        url.searchParams.set('with_original_language', 'ja');
      } else if (category === 'documentaries') {
        url.searchParams.set('with_genres', '99');
      }

      const upstream = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(9000),
      });
      const json = await upstream.json();
      res.status(upstream.status).json({ ok: upstream.ok, ...json });
    } catch {
      res.status(502).json({ ok: false, error: 'Falha ao consultar catálogo Love Flix.' });
    }
  });
}
