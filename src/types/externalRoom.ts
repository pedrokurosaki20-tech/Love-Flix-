export type ExternalPlaybackAction =
  | 'init'
  | 'play'
  | 'pause'
  | 'seek'
  | 'ratechange'
  | 'sync';

export interface ExternalStreamMetadata {
  mode: 'hls' | 'video' | 'embed' | 'unavailable';
  streamUrl: string | null;
  playerEmbedUrl: string;
  subtitleTracks: Array<{
    label: string;
    lang: string;
    src: string;
    isDefault?: boolean;
  }>;
  availableChannels: Array<1 | 2 | 3>;
}

export interface ExternalRoomMedia {
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
  stream: ExternalStreamMetadata | null;
  updatedBy: string;
  updatedAtMs: number;
}

export interface ExternalRoomPlayback {
  paused: boolean;
  positionSec: number;
  playbackRate: number;
  action: ExternalPlaybackAction;
  seq: number;
  eventId: string;
  actorId: string;
  actorName: string;
  updatedAtMs: number;
}

export interface ExternalRoomPeer {
  peerId: string;
  name: string;
  source: 'loveflix' | 'external';
  joinedAtMs: number;
  lastSeenMs: number;
}

export interface ChatMessage {
  id: string;
  peerId: string;
  name: string;
  text: string;
  createdAtMs: number;
}

export interface ReactionEvent {
  id: string;
  peerId: string;
  name: string;
  emoji: string;
  createdAtMs: number;
}

export interface ExternalRoomSnapshot {
  roomId: string;
  seq: number;
  serverNowMs: number;
  externalAppUrl: string | null;
  webhookConfigured: boolean;
  media: ExternalRoomMedia | null;
  playback: ExternalRoomPlayback;
  peers: ExternalRoomPeer[];
  chatMessages?: ChatMessage[];
}

export interface ExternalRoomConnectOptions {
  roomId: string;
  returnUrl?: string;
  webhookUrl?: string;
  externalWsUrl?: string;
  authToken?: string;
  silent?: boolean;
}

export interface ExternalMediaSelectionInput {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  imdbId?: string | null;
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  channel: 1 | 2 | 3;
}

export interface BridgeCredentialsResponse {
  ok: boolean;
  bridgeApiKey: string;
  endpoints: {
    baseUrl: string;
    connectRoom: string;
    roomState: string;
    syncMedia: string;
    syncPlayback: string;
    catalog: string;
    streamSource: string;
    websocket: string;
    deepLinkTemplate: string;
  };
}
