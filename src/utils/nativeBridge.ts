export interface NativeCanal2Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
  showFloatingControls: boolean;
}

export interface LoveFlixNativeBridge {
  isNativeApp?: () => boolean;
  openCanal2?: (
    url: string,
    audioPref: string,
    introPlaying: boolean,
    boundsJson: string
  ) => void;
  updateCanal2Bounds?: (boundsJson: string) => void;
  setCanal2IntroActive?: (introPlaying: boolean) => void;
  setNativeFullscreen?: (fullscreen: boolean) => void;
  closeCanal2?: () => void;
}

declare global {
  interface Window {
    LoveFlixNative?: LoveFlixNativeBridge;
  }
}

export function isAndroidNativeCanal2Available(): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = window.LoveFlixNative;
  return Boolean(
    bridge &&
      typeof bridge.openCanal2 === 'function' &&
      typeof bridge.closeCanal2 === 'function'
  );
}

export function computeNormalizedElementBounds(
  el: HTMLElement | null,
  options: { visible?: boolean; showFloatingControls?: boolean } = {}
): NativeCanal2Bounds {
  if (!el || typeof window === 'undefined') {
    return {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      visible: false,
      showFloatingControls: false,
    };
  }

  const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const rect = el.getBoundingClientRect();

  const left = Math.max(0, Math.min(1, rect.left / vw));
  const top = Math.max(0, Math.min(1, rect.top / vh));
  const right = Math.max(left, Math.min(1, rect.right / vw));
  const bottom = Math.max(top, Math.min(1, rect.bottom / vh));

  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const hasArea = width > 0.02 && height > 0.02;

  return {
    left,
    top,
    width,
    height,
    visible: Boolean(options.visible !== false && hasArea),
    showFloatingControls: Boolean(options.showFloatingControls),
  };
}

export interface ResolvedCanal2StreamResponse {
  available: boolean;
  resolvedChannel: 1 | 2 | 3;
  url: string | null;
}

export async function resolveCanal2DirectStream(params: {
  mediaType: 'movie' | 'tv';
  id: number;
  imdbId?: string | null;
  season?: number;
  episode?: number;
  audioPref: 'pt' | 'original';
  signal?: AbortSignal;
}): Promise<ResolvedCanal2StreamResponse> {
  const superCdnType = params.mediaType === 'tv' ? 'tvshow' : 'movie';
  const qs = new URLSearchParams({
    type: superCdnType,
    imdb: params.imdbId || '',
    tmdbId: String(params.id),
    channel: '2',
    audioPref: params.audioPref,
    mode: 'json',
  });
  if (superCdnType === 'tvshow') {
    qs.set('season', String(params.season || 1));
    qs.set('episode', String(params.episode || 1));
  }

  const res = await fetch(`/api/supercdn/stream?${qs.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: params.signal,
  });

  if (!res.ok) {
    return { available: false, resolvedChannel: 2, url: null };
  }

  const data = (await res.json()) as {
    available?: boolean;
    resolvedChannel?: number;
    url?: string | null;
  };

  const resolvedChannel: 1 | 2 | 3 =
    data.resolvedChannel === 1 ? 1 : data.resolvedChannel === 3 ? 3 : 2;

  return {
    available: Boolean(data.available),
    resolvedChannel,
    url: typeof data.url === 'string' && data.url ? data.url : null,
  };
}
