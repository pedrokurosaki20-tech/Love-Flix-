import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STUDIO_AVATARS, type MediaType, type TMDBMediaItem } from '../types/tmdb';
import { resolveMediaType } from '../services/tmdb';

export interface SavedMediaEntry {
  id: number;
  media_type: 'movie' | 'tv';
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  origin_country?: string[];
  original_language?: string;
  addedAt: string;
}

export interface PlaybackProgressSlot {
  // Structured slot ready for integration with a real video player
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: string;
}

export interface HistoryEntry extends SavedMediaEntry {
  visitedAt: string;
  interactionType: 'viewed' | 'continuing' | 'completed';
  trackedSeason?: number;
  trackedEpisode?: number;
  trackedEpisodeTitle?: string;
  playbackProgress?: PlaybackProgressSlot | null;
}

export interface UserProfileConfig {
  id: string;
  name: string;
  email: string;
  avatarSrc: string;
  favoriteGenreIds: number[];
  preferredLanguage: string;
  autoplayHero: boolean;
  compactCards: boolean;
  accentPreset: 'classic' | 'vivid' | 'ruby';
}

interface ProfileDataBucket {
  profile: UserProfileConfig;
  myList: SavedMediaEntry[];
  favorites: SavedMediaEntry[];
  watchLater: SavedMediaEntry[];
  watched: SavedMediaEntry[];
  history: HistoryEntry[];
  recentSearches: string[];
}

interface StoredRootState {
  activeProfileId: string;
  isProfileLocked: boolean;
  profiles: Record<string, ProfileDataBucket>;
}

export interface ToastMessage {
  id: string;
  text: string;
  variant?: 'default' | 'accent';
}

interface UserDataContextValue {
  profile: UserProfileConfig;
  allProfiles: UserProfileConfig[];
  isProfileSwitcherOpen: boolean;
  setProfileSwitcherOpen: (open: boolean) => void;
  switchProfile: (profileId: string) => void;
  createNewProfile: (name: string, avatarSrc: string) => void;
  updateProfile: (updates: Partial<UserProfileConfig>) => void;

  myList: SavedMediaEntry[];
  favorites: SavedMediaEntry[];
  watchLater: SavedMediaEntry[];
  watched: SavedMediaEntry[];
  history: HistoryEntry[];
  continueWatching: HistoryEntry[];
  recentSearches: string[];

  isInMyList: (id: number, mediaType: MediaType) => boolean;
  isFavorite: (id: number, mediaType: MediaType) => boolean;
  isInWatchLater: (id: number, mediaType: MediaType) => boolean;
  isWatched: (id: number, mediaType: MediaType) => boolean;

  toggleMyList: (item: TMDBMediaItem) => void;
  toggleFavorite: (item: TMDBMediaItem) => void;
  toggleWatchLater: (item: TMDBMediaItem) => void;
  toggleWatched: (item: TMDBMediaItem) => void;

  recordHistoryVisit: (
    item: TMDBMediaItem,
    interactionType?: 'viewed' | 'continuing' | 'completed',
    episodeInfo?: { season: number; episode: number; title?: string }
  ) => void;
  removeFromHistory: (id: number, mediaType: MediaType) => void;
  removeFromContinueWatching: (id: number, mediaType: MediaType) => void;
  clearHistory: () => void;

  addRecentSearch: (term: string) => void;
  removeRecentSearch: (term: string) => void;
  clearRecentSearches: () => void;

  exportUserDataJson: () => string;
  importUserDataJson: (rawJson: string) => boolean;

  toasts: ToastMessage[];
  pushToast: (text: string, variant?: 'default' | 'accent') => void;
}

const STORAGE_KEY = 'loveflix_storage_v1';

const DEFAULT_PROFILES: Record<string, ProfileDataBucket> = {
  main: {
    profile: {
      id: 'main',
      name: 'Cinéfilo Principal',
      email: 'contato@loveflix.app',
      avatarSrc: STUDIO_AVATARS[0].src,
      favoriteGenreIds: [28, 878, 53, 18],
      preferredLanguage: 'pt-BR',
      autoplayHero: true,
      compactCards: false,
      accentPreset: 'classic',
    },
    myList: [],
    favorites: [],
    watchLater: [],
    watched: [],
    history: [],
    recentSearches: [],
  },
  anime: {
    profile: {
      id: 'anime',
      name: 'Otaku & Doramas',
      email: 'anime@loveflix.app',
      avatarSrc: STUDIO_AVATARS[2].src,
      favoriteGenreIds: [16, 10759, 10765, 10749],
      preferredLanguage: 'pt-BR',
      autoplayHero: true,
      compactCards: false,
      accentPreset: 'vivid',
    },
    myList: [],
    favorites: [],
    watchLater: [],
    watched: [],
    history: [],
    recentSearches: [],
  },
};

function createSavedEntry(item: TMDBMediaItem): SavedMediaEntry {
  const mediaType = resolveMediaType(item, 'movie') === 'tv' ? 'tv' : 'movie';
  return {
    id: item.id,
    media_type: mediaType,
    title: item.title,
    name: item.name,
    original_title: item.original_title,
    original_name: item.original_name,
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
    release_date: item.release_date,
    first_air_date: item.first_air_date,
    vote_average: item.vote_average,
    genre_ids: item.genre_ids || item.genres?.map((g) => g.id) || [],
    origin_country: item.origin_country,
    original_language: item.original_language,
    addedAt: new Date().toISOString(),
  };
}

function loadInitialState(): StoredRootState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredRootState;
      if (parsed && parsed.profiles && parsed.activeProfileId && parsed.profiles[parsed.activeProfileId]) {
        return parsed;
      }
    }
  } catch {
    // fallback to defaults
  }
  return {
    activeProfileId: 'main',
    isProfileLocked: false,
    profiles: DEFAULT_PROFILES,
  };
}

const UserDataContext = createContext<UserDataContextValue | null>(null);

export const UserDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<StoredRootState>(loadInitialState);
  const [isProfileSwitcherOpen, setProfileSwitcherOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state]);

  const activeBucket = state.profiles[state.activeProfileId] || state.profiles.main;

  // Sync CSS accent variables with user's selected accent preset
  useEffect(() => {
    const preset = activeBucket.profile.accentPreset;
    const root = document.documentElement;
    if (preset === 'vivid') {
      root.style.setProperty('--brand-primary', '#FF253A');
      root.style.setProperty('--brand-highlight', '#FF4757');
    } else if (preset === 'ruby') {
      root.style.setProperty('--brand-primary', '#C11119');
      root.style.setProperty('--brand-highlight', '#E50914');
    } else {
      root.style.setProperty('--brand-primary', '#E50914');
      root.style.setProperty('--brand-highlight', '#FF253A');
    }
  }, [activeBucket.profile.accentPreset]);

  const pushToast = useCallback((text: string, variant: 'default' | 'accent' = 'default') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { id, text, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  const updateActiveBucket = useCallback(
    (updater: (bucket: ProfileDataBucket) => ProfileDataBucket) => {
      setState((prev) => {
        const current = prev.profiles[prev.activeProfileId] || prev.profiles.main;
        return {
          ...prev,
          profiles: {
            ...prev.profiles,
            [prev.activeProfileId]: updater(current),
          },
        };
      });
    },
    []
  );

  const switchProfile = useCallback(
    (profileId: string) => {
      if (state.profiles[profileId]) {
        setState((prev) => ({
          ...prev,
          activeProfileId: profileId,
          isProfileLocked: false,
        }));
        setProfileSwitcherOpen(false);
        pushToast(`Perfil alterado para ${state.profiles[profileId].profile.name}`, 'accent');
      }
    },
    [state.profiles, pushToast]
  );

  const createNewProfile = useCallback(
    (name: string, avatarSrc: string) => {
      const cleanName = name.trim();
      if (!cleanName) return;
      const id = `profile_${Date.now()}`;
      const newBucket: ProfileDataBucket = {
        profile: {
          id,
          name: cleanName,
          email: '',
          avatarSrc: avatarSrc || STUDIO_AVATARS[0].src,
          favoriteGenreIds: [28, 35, 18],
          preferredLanguage: 'pt-BR',
          autoplayHero: true,
          compactCards: false,
          accentPreset: 'classic',
        },
        myList: [],
        favorites: [],
        watchLater: [],
        watched: [],
        history: [],
        recentSearches: [],
      };
      setState((prev) => ({
        ...prev,
        activeProfileId: id,
        profiles: {
          ...prev.profiles,
          [id]: newBucket,
        },
      }));
      setProfileSwitcherOpen(false);
      pushToast(`Novo perfil "${cleanName}" criado`, 'accent');
    },
    [pushToast]
  );

  const updateProfile = useCallback(
    (updates: Partial<UserProfileConfig>) => {
      updateActiveBucket((bucket) => ({
        ...bucket,
        profile: { ...bucket.profile, ...updates },
      }));
      pushToast('Preferências do perfil salvas');
    },
    [updateActiveBucket, pushToast]
  );

  const isInMyList = useCallback(
    (id: number, mediaType: MediaType) =>
      activeBucket.myList.some((x) => x.id === id && x.media_type === mediaType),
    [activeBucket.myList]
  );

  const isFavorite = useCallback(
    (id: number, mediaType: MediaType) =>
      activeBucket.favorites.some((x) => x.id === id && x.media_type === mediaType),
    [activeBucket.favorites]
  );

  const isInWatchLater = useCallback(
    (id: number, mediaType: MediaType) =>
      activeBucket.watchLater.some((x) => x.id === id && x.media_type === mediaType),
    [activeBucket.watchLater]
  );

  const isWatched = useCallback(
    (id: number, mediaType: MediaType) =>
      activeBucket.watched.some((x) => x.id === id && x.media_type === mediaType),
    [activeBucket.watched]
  );

  const toggleMyList = useCallback(
    (item: TMDBMediaItem) => {
      const entry = createSavedEntry(item);
      const label = entry.title || entry.name || 'Conteúdo';
      const exists = activeBucket.myList.some(
        (x) => x.id === entry.id && x.media_type === entry.media_type
      );
      updateActiveBucket((bucket) => ({
        ...bucket,
        myList: exists
          ? bucket.myList.filter((x) => !(x.id === entry.id && x.media_type === entry.media_type))
          : [entry, ...bucket.myList],
      }));
      pushToast(
        exists ? `"${label}" removido da Minha Lista` : `"${label}" adicionado à Minha Lista`,
        exists ? 'default' : 'accent'
      );
    },
    [activeBucket.myList, updateActiveBucket, pushToast]
  );

  const toggleFavorite = useCallback(
    (item: TMDBMediaItem) => {
      const entry = createSavedEntry(item);
      const label = entry.title || entry.name || 'Conteúdo';
      const exists = activeBucket.favorites.some(
        (x) => x.id === entry.id && x.media_type === entry.media_type
      );
      updateActiveBucket((bucket) => ({
        ...bucket,
        favorites: exists
          ? bucket.favorites.filter((x) => !(x.id === entry.id && x.media_type === entry.media_type))
          : [entry, ...bucket.favorites],
      }));
      pushToast(
        exists ? `"${label}" removido dos Favoritos` : `"${label}" adicionado aos Favoritos`,
        exists ? 'default' : 'accent'
      );
    },
    [activeBucket.favorites, updateActiveBucket, pushToast]
  );

  const toggleWatchLater = useCallback(
    (item: TMDBMediaItem) => {
      const entry = createSavedEntry(item);
      const label = entry.title || entry.name || 'Conteúdo';
      const exists = activeBucket.watchLater.some(
        (x) => x.id === entry.id && x.media_type === entry.media_type
      );
      updateActiveBucket((bucket) => ({
        ...bucket,
        watchLater: exists
          ? bucket.watchLater.filter((x) => !(x.id === entry.id && x.media_type === entry.media_type))
          : [entry, ...bucket.watchLater],
      }));
      pushToast(
        exists ? `"${label}" removido de Assistir Depois` : `"${label}" salvo em Assistir Depois`
      );
    },
    [activeBucket.watchLater, updateActiveBucket, pushToast]
  );

  const toggleWatched = useCallback(
    (item: TMDBMediaItem) => {
      const entry = createSavedEntry(item);
      const label = entry.title || entry.name || 'Conteúdo';
      const exists = activeBucket.watched.some(
        (x) => x.id === entry.id && x.media_type === entry.media_type
      );
      updateActiveBucket((bucket) => ({
        ...bucket,
        watched: exists
          ? bucket.watched.filter((x) => !(x.id === entry.id && x.media_type === entry.media_type))
          : [entry, ...bucket.watched],
        history: bucket.history.map((h) =>
          h.id === entry.id && h.media_type === entry.media_type
            ? { ...h, interactionType: exists ? 'viewed' : 'completed' }
            : h
        ),
      }));
      pushToast(exists ? `"${label}" desmarcado como assistido` : `"${label}" marcado como assistido`);
    },
    [activeBucket.watched, updateActiveBucket, pushToast]
  );

  const recordHistoryVisit = useCallback(
    (
      item: TMDBMediaItem,
      interactionType: 'viewed' | 'continuing' | 'completed' = 'viewed',
      episodeInfo?: { season: number; episode: number; title?: string }
    ) => {
      const saved = createSavedEntry(item);
      const now = new Date().toISOString();

      updateActiveBucket((bucket) => {
        const previous = bucket.history.find(
          (h) => h.id === saved.id && h.media_type === saved.media_type
        );

        const preservedType =
          interactionType === 'viewed' && previous?.interactionType === 'continuing'
            ? 'continuing'
            : interactionType;

        const nextEntry: HistoryEntry = {
          ...saved,
          visitedAt: now,
          interactionType: preservedType,
          trackedSeason: episodeInfo?.season ?? previous?.trackedSeason,
          trackedEpisode: episodeInfo?.episode ?? previous?.trackedEpisode,
          trackedEpisodeTitle: episodeInfo?.title ?? previous?.trackedEpisodeTitle,
          playbackProgress: previous?.playbackProgress ?? null,
        };

        const filtered = bucket.history.filter(
          (h) => !(h.id === saved.id && h.media_type === saved.media_type)
        );

        return {
          ...bucket,
          history: [nextEntry, ...filtered].slice(0, 80),
        };
      });
    },
    [updateActiveBucket]
  );

  const removeFromHistory = useCallback(
    (id: number, mediaType: MediaType) => {
      updateActiveBucket((bucket) => ({
        ...bucket,
        history: bucket.history.filter((h) => !(h.id === id && h.media_type === mediaType)),
      }));
      pushToast('Item removido do histórico');
    },
    [updateActiveBucket, pushToast]
  );

  const removeFromContinueWatching = useCallback(
    (id: number, mediaType: MediaType) => {
      updateActiveBucket((bucket) => ({
        ...bucket,
        history: bucket.history.map((h) =>
          h.id === id && h.media_type === mediaType ? { ...h, interactionType: 'viewed' } : h
        ),
      }));
      pushToast('Removido de Continue Assistindo');
    },
    [updateActiveBucket, pushToast]
  );

  const clearHistory = useCallback(() => {
    updateActiveBucket((bucket) => ({
      ...bucket,
      history: [],
    }));
    pushToast('Histórico de navegação limpo');
  }, [updateActiveBucket, pushToast]);

  const addRecentSearch = useCallback(
    (term: string) => {
      const clean = term.trim();
      if (clean.length < 2) return;
      updateActiveBucket((bucket) => ({
        ...bucket,
        recentSearches: [
          clean,
          ...bucket.recentSearches.filter((t) => t.toLowerCase() !== clean.toLowerCase()),
        ].slice(0, 12),
      }));
    },
    [updateActiveBucket]
  );

  const removeRecentSearch = useCallback(
    (term: string) => {
      updateActiveBucket((bucket) => ({
        ...bucket,
        recentSearches: bucket.recentSearches.filter((t) => t !== term),
      }));
    },
    [updateActiveBucket]
  );

  const clearRecentSearches = useCallback(() => {
    updateActiveBucket((bucket) => ({
      ...bucket,
      recentSearches: [],
    }));
  }, [updateActiveBucket]);

  const exportUserDataJson = useCallback(() => {
    return JSON.stringify(state, null, 2);
  }, [state]);

  const importUserDataJson = useCallback(
    (rawJson: string): boolean => {
      try {
        const parsed = JSON.parse(rawJson) as StoredRootState;
        if (parsed && parsed.profiles && parsed.activeProfileId) {
          setState(parsed);
          pushToast('Backup de dados restaurado com sucesso', 'accent');
          return true;
        }
      } catch {
        // invalid json
      }
      pushToast('Arquivo de backup inválido');
      return false;
    },
    [pushToast]
  );

  const continueWatching = useMemo(
    () => activeBucket.history.filter((h) => h.interactionType === 'continuing'),
    [activeBucket.history]
  );

  const allProfiles = useMemo(
    () => Object.values(state.profiles).map((b) => b.profile),
    [state.profiles]
  );

  const value = useMemo<UserDataContextValue>(
    () => ({
      profile: activeBucket.profile,
      allProfiles,
      isProfileSwitcherOpen,
      setProfileSwitcherOpen,
      switchProfile,
      createNewProfile,
      updateProfile,
      myList: activeBucket.myList,
      favorites: activeBucket.favorites,
      watchLater: activeBucket.watchLater,
      watched: activeBucket.watched,
      history: activeBucket.history,
      continueWatching,
      recentSearches: activeBucket.recentSearches,
      isInMyList,
      isFavorite,
      isInWatchLater,
      isWatched,
      toggleMyList,
      toggleFavorite,
      toggleWatchLater,
      toggleWatched,
      recordHistoryVisit,
      removeFromHistory,
      removeFromContinueWatching,
      clearHistory,
      addRecentSearch,
      removeRecentSearch,
      clearRecentSearches,
      exportUserDataJson,
      importUserDataJson,
      toasts,
      pushToast,
    }),
    [
      activeBucket,
      allProfiles,
      isProfileSwitcherOpen,
      switchProfile,
      createNewProfile,
      updateProfile,
      continueWatching,
      isInMyList,
      isFavorite,
      isInWatchLater,
      isWatched,
      toggleMyList,
      toggleFavorite,
      toggleWatchLater,
      toggleWatched,
      recordHistoryVisit,
      removeFromHistory,
      removeFromContinueWatching,
      clearHistory,
      addRecentSearch,
      removeRecentSearch,
      clearRecentSearches,
      exportUserDataJson,
      importUserDataJson,
      toasts,
      pushToast,
    ]
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
};

export function useUserData(): UserDataContextValue {
  const ctx = useContext(UserDataContext);
  if (!ctx) {
    throw new Error('useUserData must be used inside UserDataProvider');
  }
  return ctx;
}
