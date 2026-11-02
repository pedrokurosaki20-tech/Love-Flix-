import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { MediaType, PageRouteId, TMDBMediaItem } from '../types/tmdb';
import { getMediaTitle, resolveMediaType } from '../services/tmdb';
import { useUserData } from './UserDataContext';

export interface RouteState {
  page: PageRouteId;
  mediaType?: 'movie' | 'tv';
  id?: number;
  query?: string;
  genreId?: string;
  genreName?: string;
}

export interface WatchModalRequest {
  mediaType: 'movie' | 'tv';
  id: number;
  title: string;
  imdbId?: string | null;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  item?: TMDBMediaItem;
}

export interface ActivePlayerSession {
  mediaType: 'movie' | 'tv';
  id: number;
  title: string;
  imdbId: string | null;
  channel: 1 | 2 | 3;
  season?: number;
  episode?: number;
  episodeTitle?: string;
}

interface NavigationContextValue {
  route: RouteState;
  navigate: (next: RouteState) => void;
  navigateToPage: (page: PageRouteId, extra?: Partial<RouteState>) => void;
  openMediaDetail: (item: TMDBMediaItem | { id: number; media_type: 'movie' | 'tv' }) => void;
  openPersonDetail: (personId: number) => void;
  openCollectionDetail: (collectionId: number) => void;
  openSearchWithQuery: (query?: string) => void;

  watchRequest: WatchModalRequest | null;
  openWatchModal: (request: WatchModalRequest) => void;
  closeWatchModal: () => void;

  activePlayer: ActivePlayerSession | null;
  startPlayerSession: (session: ActivePlayerSession) => void;
  switchPlayerChannel: (channel: 1 | 2 | 3) => void;
  updateActivePlayerImdb: (imdbId: string | null) => void;
  closePlayerSession: () => void;

  // Kept so HeroBanner and MediaCard "Assistir" buttons seamlessly open the 3-channel card
  playTrailerForItem: (item: TMDBMediaItem) => void;
}

const PAGE_TO_PATH: Record<PageRouteId, string> = {
  home: '/',
  movies: '/filmes',
  series: '/series',
  animes: '/animes',
  doramas: '/doramas',
  documentaries: '/documentarios',
  search: '/pesquisa',
  'my-flix': '/minha-flix',
  'my-account': '/minha-conta',
  detail: '/detalhes',
  person: '/artista',
  collection: '/colecao',
};

const PATH_TO_PAGE: Record<string, PageRouteId> = Object.entries(PAGE_TO_PATH).reduce(
  (acc, [page, p]) => {
    acc[p] = page as PageRouteId;
    return acc;
  },
  {} as Record<string, PageRouteId>
);

function parseLocationToRoute(): RouteState {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const searchParams = new URLSearchParams(window.location.search);

  const detailMatch = pathname.match(/^\/detalhes\/(movie|tv)\/(\d+)$/);
  if (detailMatch) {
    return {
      page: 'detail',
      mediaType: detailMatch[1] as 'movie' | 'tv',
      id: Number(detailMatch[2]),
    };
  }

  const personMatch = pathname.match(/^\/artista\/(\d+)$/);
  if (personMatch) {
    return {
      page: 'person',
      id: Number(personMatch[1]),
    };
  }

  const colMatch = pathname.match(/^\/colecao\/(\d+)$/);
  if (colMatch) {
    return {
      page: 'collection',
      id: Number(colMatch[1]),
    };
  }

  const matchedPage = PATH_TO_PAGE[pathname] || 'home';
  return {
    page: matchedPage,
    query: searchParams.get('q') || undefined,
    genreId: searchParams.get('genero') || undefined,
    genreName: searchParams.get('nome') || undefined,
  };
}

function buildUrlFromRoute(route: RouteState): string {
  if (route.page === 'detail' && route.mediaType && route.id) {
    return `/detalhes/${route.mediaType}/${route.id}`;
  }
  if (route.page === 'person' && route.id) {
    return `/artista/${route.id}`;
  }
  if (route.page === 'collection' && route.id) {
    return `/colecao/${route.id}`;
  }

  const basePath = PAGE_TO_PATH[route.page] || '/';
  const params = new URLSearchParams();
  if (route.query) params.set('q', route.query);
  if (route.genreId) params.set('genero', route.genreId);
  if (route.genreName) params.set('nome', route.genreName);

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [route, setRoute] = useState<RouteState>(parseLocationToRoute);
  const [watchRequest, setWatchRequest] = useState<WatchModalRequest | null>(null);
  const [activePlayer, setActivePlayer] = useState<ActivePlayerSession | null>(null);

  const { recordHistoryVisit, history } = useUserData();

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseLocationToRoute());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((next: RouteState) => {
    const nextUrl = buildUrlFromRoute(next);
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.pushState({}, '', nextUrl);
    }
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateToPage = useCallback(
    (page: PageRouteId, extra: Partial<RouteState> = {}) => {
      navigate({ page, ...extra });
    },
    [navigate]
  );

  const openMediaDetail = useCallback(
    (item: TMDBMediaItem | { id: number; media_type: 'movie' | 'tv' }) => {
      const resolved: MediaType = resolveMediaType(item as TMDBMediaItem, 'movie');
      if (resolved === 'person') {
        navigate({ page: 'person', id: item.id });
        return;
      }
      navigate({ page: 'detail', mediaType: resolved, id: item.id });
    },
    [navigate]
  );

  const openPersonDetail = useCallback(
    (personId: number) => {
      navigate({ page: 'person', id: personId });
    },
    [navigate]
  );

  const openCollectionDetail = useCallback(
    (collectionId: number) => {
      navigate({ page: 'collection', id: collectionId });
    },
    [navigate]
  );

  const openSearchWithQuery = useCallback(
    (query?: string) => {
      navigate({ page: 'search', query });
    },
    [navigate]
  );

  const openWatchModal = useCallback(
    (request: WatchModalRequest) => {
      if (request.item) {
        recordHistoryVisit(
          request.item,
          'continuing',
          request.mediaType === 'tv' && request.season && request.episode
            ? {
                season: request.season,
                episode: request.episode,
                title: request.episodeTitle || '',
              }
            : undefined
        );
      }
      setWatchRequest(request);
    },
    [recordHistoryVisit]
  );

  const closeWatchModal = useCallback(() => {
    setWatchRequest(null);
  }, []);

  const startPlayerSession = useCallback((session: ActivePlayerSession) => {
    setWatchRequest(null);
    setActivePlayer(session);
  }, []);

  const switchPlayerChannel = useCallback((channel: 1 | 2 | 3) => {
    setActivePlayer((prev) => (prev ? { ...prev, channel } : null));
  }, []);

  const updateActivePlayerImdb = useCallback((imdbId: string | null) => {
    setActivePlayer((prev) => (prev ? { ...prev, imdbId } : null));
  }, []);

  const closePlayerSession = useCallback(() => {
    setActivePlayer(null);
  }, []);

  const playTrailerForItem = useCallback(
    (item: TMDBMediaItem) => {
      const mediaType = resolveMediaType(item, 'movie') === 'tv' ? 'tv' : 'movie';
      const tracked =
        mediaType === 'tv'
          ? history.find((h) => h.id === item.id && h.media_type === 'tv')
          : undefined;
      openWatchModal({
        mediaType,
        id: item.id,
        title: getMediaTitle(item),
        season: mediaType === 'tv' ? tracked?.trackedSeason || 1 : undefined,
        episode: mediaType === 'tv' ? tracked?.trackedEpisode || 1 : undefined,
        episodeTitle: mediaType === 'tv' ? tracked?.trackedEpisodeTitle : undefined,
        item,
      });
    },
    [history, openWatchModal]
  );

  const value = useMemo<NavigationContextValue>(
    () => ({
      route,
      navigate,
      navigateToPage,
      openMediaDetail,
      openPersonDetail,
      openCollectionDetail,
      openSearchWithQuery,
      watchRequest,
      openWatchModal,
      closeWatchModal,
      activePlayer,
      startPlayerSession,
      switchPlayerChannel,
      updateActivePlayerImdb,
      closePlayerSession,
      playTrailerForItem,
    }),
    [
      route,
      navigate,
      navigateToPage,
      openMediaDetail,
      openPersonDetail,
      openCollectionDetail,
      openSearchWithQuery,
      watchRequest,
      openWatchModal,
      closeWatchModal,
      activePlayer,
      startPlayerSession,
      switchPlayerChannel,
      updateActivePlayerImdb,
      closePlayerSession,
      playTrailerForItem,
    ]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used inside NavigationProvider');
  }
  return ctx;
}
