import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STUDIO_AVATARS, type MediaType, type TMDBMediaItem } from '../types/tmdb';
import { resolveMediaType } from '../services/tmdb';
import { LOVEFLIX_PRESET_AVATARS } from '../utils/avatars';

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
  id: string; // ID único do perfil (ex: prof_user_pedro_1)
  accountId: string; // ID da conta à qual pertence
  name: string;
  avatarSrc: string;
  isPrimary?: boolean;
  createdAt?: string;

  // Preferências individuais do perfil
  favoriteGenreIds: number[];
  preferredLanguage: string;
  autoplayHero: boolean;
  compactCards: boolean;
  accentPreset: 'classic' | 'vivid' | 'ruby';
  audioLanguage?: 'pt' | 'original';
  subtitlePreference?: 'auto' | 'always' | 'off';
  playbackQuality?: 'auto' | '1080p' | '720p' | 'saver';
  notificationsEnabled?: boolean;
  themeAppearance?: 'dark' | 'contrast';
  recommendationStyle?: 'history' | 'trending' | 'new';
  contentRatingFilter?: 'all' | '16' | 'family';

  // Detalhes da conta herdados ou específicos
  phone?: string;
  email?: string;
  maskedPassword?: string;
  paymentMethod?: string;
  subscriptionPlan?: string;
}

export interface ProfileDataBucket {
  profile: UserProfileConfig;
  myList: SavedMediaEntry[];
  favorites: SavedMediaEntry[];
  watchLater: SavedMediaEntry[];
  watched: SavedMediaEntry[];
  history: HistoryEntry[];
  recentSearches: string[];
}

interface StoredRootState {
  activeProfileId: string | null;
  isProfileLocked: boolean;
  profiles: Record<string, ProfileDataBucket>;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  avatarSrc: string;
  createdAt: string;
  subscriptionPlan: string;
  paymentMethod: string;
}

export function normalizePhone(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

export interface ToastMessage {
  id: string;
  text: string;
  variant?: 'default' | 'accent';
}

interface UserDataContextValue {
  profile: UserProfileConfig;
  allProfiles: UserProfileConfig[];
  accountProfiles: UserProfileConfig[];
  activeProfileId: string | null;
  isProfileSelected: boolean;
  isProfileSwitcherOpen: boolean;
  setProfileSwitcherOpen: (open: boolean) => void;

  selectProfile: (profileId: string) => void;
  unselectProfile: () => void;
  switchProfile: (profileId: string) => void;
  createNewProfile: (name: string, avatarSrc: string) => void;
  createAccountProfile: (name: string, avatarSrc: string) => { success: boolean; message?: string };
  updateAccountProfile: (profileId: string, updates: { name?: string; avatarSrc?: string }) => { success: boolean; message?: string };
  deleteAccountProfile: (profileId: string) => { success: boolean; message?: string };
  updateProfile: (updates: Partial<UserProfileConfig>) => void;

  // Autenticação & Sincronização de Conta
  isLoggedIn: boolean;
  currentAccount: UserAccount | null;
  registeredAccounts: UserAccount[];
  login: (emailOrPhone: string, pass: string) => { success: boolean; message?: string };
  register: (data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    avatarSrc?: string;
  }) => { success: boolean; message?: string };
  logout: () => void;
  changePassword: (oldPass: string, newPass: string) => { success: boolean; message?: string };
  updateAccountDetails: (data: { email?: string; phone?: string; name?: string }) => { success: boolean; message?: string };
  isAuthModalOpen: boolean;
  authModalInitialMode: 'login' | 'register';
  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;

  // Avisos de DNS pós-cadastro
  showDnsWelcomePrompt: boolean;
  setShowDnsWelcomePrompt: (show: boolean) => void;
  showDnsThankYouPrompt: boolean;
  setShowDnsThankYouPrompt: (show: boolean) => void;
  isDnsFlowPendingReturn: boolean;
  setIsDnsFlowPendingReturn: (pending: boolean) => void;

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
const ACCOUNTS_STORAGE_KEY = 'loveflix_registered_accounts_v1';
const AUTH_SESSION_KEY = 'loveflix_auth_session_v1';

const DEFAULT_ACCOUNTS: UserAccount[] = [
  {
    id: 'user_pedro',
    name: 'Pedro',
    email: 'contato@loveflix.app',
    password: '123456',
    phone: '+55 (11) 98765-4321',
    avatarSrc: LOVEFLIX_PRESET_AVATARS[0].src,
    createdAt: '2026-01-01T00:00:00.000Z',
    subscriptionPlan: 'Love Flix Premium • 4K Ultra HD',
    paymentMethod: 'Cartão de Crédito final •••• 4242',
  },
];

const DEFAULT_PROFILES: Record<string, ProfileDataBucket> = {
  prof_pedro_principal: {
    profile: {
      id: 'prof_pedro_principal',
      accountId: 'user_pedro',
      name: 'Pedro',
      avatarSrc: LOVEFLIX_PRESET_AVATARS[0].src,
      isPrimary: true,
      favoriteGenreIds: [28, 878, 53, 18],
      preferredLanguage: 'pt-BR',
      autoplayHero: true,
      compactCards: false,
      accentPreset: 'classic',
      phone: '+55 (11) 98765-4321',
      maskedPassword: '••••••••••••',
      paymentMethod: 'Cartão de Crédito final •••• 4242',
      subscriptionPlan: 'Love Flix Premium • 4K Ultra HD',
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
      if (parsed && parsed.profiles && typeof parsed.profiles === 'object') {
        const migratedProfiles: Record<string, ProfileDataBucket> = {};
        for (const [key, bucket] of Object.entries(parsed.profiles)) {
          if (bucket && bucket.profile) {
            const accId =
              bucket.profile.accountId ||
              (key.startsWith('user_') ? key : 'user_pedro');
            migratedProfiles[key] = {
              ...bucket,
              profile: {
                ...bucket.profile,
                id: bucket.profile.id || key,
                accountId: accId,
                avatarSrc: bucket.profile.avatarSrc || LOVEFLIX_PRESET_AVATARS[0].src,
              },
            };
          }
        }
        return {
          activeProfileId: parsed.activeProfileId || null,
          isProfileLocked: false,
          profiles: Object.keys(migratedProfiles).length > 0 ? migratedProfiles : DEFAULT_PROFILES,
        };
      }
    }
  } catch {
    // fallback
  }
  return {
    activeProfileId: null,
    isProfileLocked: false,
    profiles: DEFAULT_PROFILES,
  };
}

function loadRegisteredAccounts(): UserAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fallback
  }
  return DEFAULT_ACCOUNTS;
}

interface AuthSessionState {
  isLoggedIn: boolean;
  activeAccountId: string;
  activeProfileId: string | null;
}

function loadInitialAuthSession(accs: UserAccount[]): AuthSessionState {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.isLoggedIn === 'boolean') {
        const found = accs.find((a) => a.id === parsed.activeAccountId);
        return {
          isLoggedIn: parsed.isLoggedIn,
          activeAccountId: found ? found.id : accs[0]?.id || 'user_pedro',
          activeProfileId: parsed.activeProfileId || null,
        };
      }
    }
  } catch {
    // fallback
  }
  return {
    isLoggedIn: false,
    activeAccountId: accs[0]?.id || 'user_pedro',
    activeProfileId: null,
  };
}

const UserDataContext = createContext<UserDataContextValue | null>(null);

export const UserDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<StoredRootState>(loadInitialState);
  const [isProfileSwitcherOpen, setProfileSwitcherOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Estado de Contas Registradas e Sessão
  const [accounts, setAccounts] = useState<UserAccount[]>(loadRegisteredAccounts);
  const [authSession, setAuthSession] = useState<AuthSessionState>(() => loadInitialAuthSession(accounts));
  const [isAuthModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalInitialMode, setAuthModalInitialMode] = useState<'login' | 'register'>('login');

  // Estado para os alertas orientativos e de agradecimento da DNS
  const [showDnsWelcomePrompt, setShowDnsWelcomePrompt] = useState<boolean>(false);
  const [showDnsThankYouPrompt, setShowDnsThankYouPrompt] = useState<boolean>(false);
  const [isDnsFlowPendingReturn, setIsDnsFlowPendingReturn] = useState<boolean>(false);

  const currentAccount = useMemo(() => {
    return accounts.find((a) => a.id === authSession.activeAccountId) || accounts[0] || null;
  }, [accounts, authSession.activeAccountId]);

  // Lista dos perfis pertencentes à conta principal ativa (máximo de 4)
  const accountProfiles = useMemo(() => {
    if (!currentAccount) return [];
    return Object.values(state.profiles)
      .filter((b) => b.profile.accountId === currentAccount.id)
      .map((b) => b.profile);
  }, [state.profiles, currentAccount]);

  // Garante que toda conta possui pelo menos um perfil principal
  useEffect(() => {
    if (!currentAccount) return;
    const existing = Object.values(state.profiles).filter(
      (b) => b.profile.accountId === currentAccount.id
    );
    if (existing.length === 0) {
      const defaultProfId = `prof_${currentAccount.id}_primary`;
      const initialBucket: ProfileDataBucket = {
        profile: {
          id: defaultProfId,
          accountId: currentAccount.id,
          name: currentAccount.name,
          avatarSrc: currentAccount.avatarSrc || LOVEFLIX_PRESET_AVATARS[0].src,
          isPrimary: true,
          favoriteGenreIds: [28, 878, 53, 18],
          preferredLanguage: 'pt-BR',
          autoplayHero: true,
          compactCards: false,
          accentPreset: 'classic',
          phone: currentAccount.phone,
          maskedPassword: '••••••••••••',
          paymentMethod: currentAccount.paymentMethod,
          subscriptionPlan: currentAccount.subscriptionPlan,
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
        profiles: {
          ...prev.profiles,
          [defaultProfId]: initialBucket,
        },
      }));
    }
  }, [currentAccount, state.profiles]);

  // Persistência do estado principal
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // quota
    }
  }, [state]);

  // Determina se o perfil está ativo e selecionado nesta sessão
  const isProfileSelected = useMemo(() => {
    if (!authSession.isLoggedIn || !authSession.activeProfileId || !currentAccount) {
      return false;
    }
    const bucket = state.profiles[authSession.activeProfileId];
    return Boolean(bucket && bucket.profile.accountId === currentAccount.id);
  }, [authSession.isLoggedIn, authSession.activeProfileId, currentAccount, state.profiles]);

  // Bucket ativo exclusivo do perfil selecionado
  const activeBucket = useMemo<ProfileDataBucket>(() => {
    if (authSession.activeProfileId && state.profiles[authSession.activeProfileId]) {
      const b = state.profiles[authSession.activeProfileId];
      if (currentAccount && b.profile.accountId === currentAccount.id) {
        return b;
      }
    }
    // Fallback seguro caso perfil ainda não tenha sido escolhido
    if (currentAccount) {
      const accProfileBucket = Object.values(state.profiles).find(
        (b) => b.profile.accountId === currentAccount.id
      );
      if (accProfileBucket) return accProfileBucket;
    }
    const firstBucket = Object.values(state.profiles)[0];
    if (firstBucket) return firstBucket;
    return DEFAULT_PROFILES.prof_pedro_principal;
  }, [authSession.activeProfileId, state.profiles, currentAccount]);

  // Sincroniza cores de destaque do perfil ativo
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

  const openAuthModal = useCallback((mode: 'login' | 'register' = 'login') => {
    setAuthModalInitialMode(mode);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  // Atualizador imutável de dados do perfil selecionado
  const updateActiveBucket = useCallback(
    (updater: (bucket: ProfileDataBucket) => ProfileDataBucket) => {
      setState((prev) => {
        const targetId = authSession.activeProfileId || prev.activeProfileId || Object.keys(prev.profiles)[0];
        if (!targetId || !prev.profiles[targetId]) return prev;
        const current = prev.profiles[targetId];
        return {
          ...prev,
          profiles: {
            ...prev.profiles,
            [targetId]: updater(current),
          },
        };
      });
    },
    [authSession.activeProfileId]
  );

  // =========================================================================
  // GESTÃO DE PERFIS (QUEM ESTÁ ASSISTINDO?)
  // =========================================================================

  const selectProfile = useCallback(
    (profileId: string) => {
      if (!currentAccount) return;
      const targetBucket = state.profiles[profileId];
      if (!targetBucket || targetBucket.profile.accountId !== currentAccount.id) {
        pushToast('Perfil não encontrado nesta conta.', 'default');
        return;
      }
      const newSession: AuthSessionState = {
        isLoggedIn: true,
        activeAccountId: currentAccount.id,
        activeProfileId: profileId,
      };
      setAuthSession(newSession);
      try {
        localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(newSession));
      } catch {
        // quota
      }
      setState((prev) => ({
        ...prev,
        activeProfileId: profileId,
        isProfileLocked: false,
      }));
      setProfileSwitcherOpen(false);
      pushToast(`Entrando como ${targetBucket.profile.name}`, 'accent');
    },
    [currentAccount, state.profiles, pushToast]
  );

  const unselectProfile = useCallback(() => {
    if (!currentAccount) return;
    const newSession: AuthSessionState = {
      isLoggedIn: true,
      activeAccountId: currentAccount.id,
      activeProfileId: null,
    };
    setAuthSession(newSession);
    try {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(newSession));
    } catch {
      // quota
    }
    setState((prev) => ({
      ...prev,
      activeProfileId: null,
    }));
  }, [currentAccount]);

  const switchProfile = selectProfile;

  const createAccountProfile = useCallback(
    (name: string, avatarSrc: string): { success: boolean; message?: string } => {
      if (!currentAccount) {
        return { success: false, message: 'Nenhuma conta ativa encontrada.' };
      }
      const cleanName = name.trim();
      if (!cleanName) {
        return { success: false, message: 'Digite um nome para o perfil.' };
      }
      const currentList = Object.values(state.profiles).filter(
        (b) => b.profile.accountId === currentAccount.id
      );
      if (currentList.length >= 4) {
        return {
          success: false,
          message: 'Limite máximo atingido. Cada conta pode ter no máximo 4 perfis.',
        };
      }

      const newProfileId = `prof_${currentAccount.id}_${Date.now()}`;
      const newBucket: ProfileDataBucket = {
        profile: {
          id: newProfileId,
          accountId: currentAccount.id,
          name: cleanName,
          avatarSrc: avatarSrc || LOVEFLIX_PRESET_AVATARS[currentList.length % LOVEFLIX_PRESET_AVATARS.length].src,
          isPrimary: currentList.length === 0,
          favoriteGenreIds: [28, 878, 53, 18],
          preferredLanguage: 'pt-BR',
          autoplayHero: true,
          compactCards: false,
          accentPreset: 'classic',
          createdAt: new Date().toISOString(),
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
        profiles: {
          ...prev.profiles,
          [newProfileId]: newBucket,
        },
      }));

      pushToast(`Perfil "${cleanName}" criado com sucesso!`, 'accent');
      return { success: true };
    },
    [currentAccount, state.profiles, pushToast]
  );

  const createNewProfile = useCallback(
    (name: string, avatarSrc: string) => {
      createAccountProfile(name, avatarSrc);
    },
    [createAccountProfile]
  );

  const updateAccountProfile = useCallback(
    (profileId: string, updates: { name?: string; avatarSrc?: string }): { success: boolean; message?: string } => {
      if (!currentAccount) return { success: false, message: 'Sem conta ativa.' };
      const bucket = state.profiles[profileId];
      if (!bucket || bucket.profile.accountId !== currentAccount.id) {
        return { success: false, message: 'Perfil não encontrado nesta conta.' };
      }
      const cleanName = updates.name !== undefined ? updates.name.trim() : bucket.profile.name;
      if (!cleanName) {
        return { success: false, message: 'O nome do perfil não pode ficar vazio.' };
      }

      setState((prev) => {
        const target = prev.profiles[profileId];
        if (!target) return prev;
        return {
          ...prev,
          profiles: {
            ...prev.profiles,
            [profileId]: {
              ...target,
              profile: {
                ...target.profile,
                name: cleanName,
                avatarSrc: updates.avatarSrc || target.profile.avatarSrc,
              },
            },
          },
        };
      });

      pushToast('Perfil atualizado com sucesso!');
      return { success: true };
    },
    [currentAccount, state.profiles, pushToast]
  );

  const deleteAccountProfile = useCallback(
    (profileId: string): { success: boolean; message?: string } => {
      if (!currentAccount) return { success: false, message: 'Sem conta ativa.' };
      const currentList = Object.values(state.profiles).filter(
        (b) => b.profile.accountId === currentAccount.id
      );
      if (currentList.length <= 1) {
        return {
          success: false,
          message: 'Você não pode excluir o único perfil da conta. Toda conta precisa ter pelo menos um perfil.',
        };
      }
      const bucket = state.profiles[profileId];
      if (!bucket || bucket.profile.accountId !== currentAccount.id) {
        return { success: false, message: 'Perfil não encontrado nesta conta.' };
      }

      const deletedName = bucket.profile.name;

      setState((prev) => {
        const nextProfiles = { ...prev.profiles };
        delete nextProfiles[profileId];
        return {
          ...prev,
          activeProfileId: prev.activeProfileId === profileId ? null : prev.activeProfileId,
          profiles: nextProfiles,
        };
      });

      if (authSession.activeProfileId === profileId) {
        const newSession = { ...authSession, activeProfileId: null };
        setAuthSession(newSession);
        try {
          localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(newSession));
        } catch {
          // quota
        }
      }

      pushToast(`Perfil "${deletedName}" foi excluído.`);
      return { success: true };
    },
    [currentAccount, state.profiles, authSession, pushToast]
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

  // =========================================================================
  // AUTENTICAÇÃO DA CONTA PRINCIPAL (LOGIN / CADASTRO)
  // =========================================================================

  const login = useCallback(
    (identifier: string, pass: string) => {
      const cleanId = identifier.trim().toLowerCase();
      const cleanPass = pass.trim();

      if (!cleanId || !cleanPass) {
        return { success: false, message: 'Preencha o e-mail ou celular e a senha de acesso.' };
      }

      const normalizedInput = normalizePhone(cleanId);

      const account = accounts.find((a) => {
        const emailMatch = a.email.toLowerCase() === cleanId;
        const phoneMatch = normalizedInput.length >= 8 && normalizePhone(a.phone) === normalizedInput;
        return (emailMatch || phoneMatch) && a.password === cleanPass;
      });

      if (!account) {
        return { success: false, message: 'E-mail, celular ou senha incorretos. Verifique suas credenciais.' };
      }

      // Ao realizar login com sucesso: direciona para a tela "Quem está assistindo?" (activeProfileId: null)
      const newSession: AuthSessionState = {
        isLoggedIn: true,
        activeAccountId: account.id,
        activeProfileId: null,
      };
      setAuthSession(newSession);
      try {
        localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(newSession));
      } catch {
        // quota
      }

      setState((prev) => ({
        ...prev,
        activeProfileId: null,
      }));

      setAuthModalOpen(false);
      pushToast(`Bem-vindo de volta! Selecione quem está assistindo.`, 'accent');
      return { success: true };
    },
    [accounts, pushToast]
  );

  const register = useCallback(
    (data: {
      name: string;
      email: string;
      password: string;
      phone: string;
      avatarSrc?: string;
    }) => {
      const cleanName = data.name.trim();
      const cleanEmail = data.email.trim().toLowerCase();
      const cleanPass = data.password.trim();
      const cleanPhone = (data.phone || '').trim();
      const normalizedPhone = normalizePhone(cleanPhone);

      if (!cleanName || cleanName.length < 2) {
        return { success: false, message: 'Digite seu nome completo (mínimo 2 letras).' };
      }
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return { success: false, message: 'Informe um endereço de e-mail válido.' };
      }
      if (!cleanPhone || normalizedPhone.length < 10) {
        return { success: false, message: 'Informe um número de celular válido com DDD (mínimo 10 dígitos).' };
      }
      if (!cleanPass || cleanPass.length < 6) {
        return { success: false, message: 'A senha de acesso deve ter no mínimo 6 caracteres.' };
      }

      const emailExists = accounts.some((a) => a.email.toLowerCase() === cleanEmail);
      if (emailExists) {
        return { success: false, message: 'Este endereço de e-mail já está cadastrado em outra conta.' };
      }

      const phoneExists = accounts.some((a) => normalizePhone(a.phone) === normalizedPhone);
      if (phoneExists) {
        return { success: false, message: 'Este número de celular já está cadastrado em outra conta.' };
      }

      const newAccountId = `user_${Date.now()}`;
      const defaultAvatar = data.avatarSrc || LOVEFLIX_PRESET_AVATARS[0].src;
      const newAccount: UserAccount = {
        id: newAccountId,
        name: cleanName,
        email: cleanEmail,
        password: cleanPass,
        phone: cleanPhone,
        avatarSrc: defaultAvatar,
        createdAt: new Date().toISOString(),
        subscriptionPlan: 'Love Flix Premium • 4K Ultra HD',
        paymentMethod: 'Cartão de Crédito final •••• 4242',
      };

      const updatedAccounts = [newAccount, ...accounts];
      setAccounts(updatedAccounts);
      try {
        localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updatedAccounts));
      } catch {
        // quota
      }

      // Cria automaticamente o 1º perfil principal vinculado à nova conta
      const initialProfileId = `prof_${newAccountId}_primary`;
      const initialBucket: ProfileDataBucket = {
        profile: {
          id: initialProfileId,
          accountId: newAccountId,
          name: cleanName,
          avatarSrc: defaultAvatar,
          isPrimary: true,
          favoriteGenreIds: [28, 878, 53, 18],
          preferredLanguage: 'pt-BR',
          autoplayHero: true,
          compactCards: false,
          accentPreset: 'classic',
          phone: cleanPhone,
          email: cleanEmail,
          paymentMethod: newAccount.paymentMethod,
          subscriptionPlan: newAccount.subscriptionPlan,
        },
        myList: [],
        favorites: [],
        watchLater: [],
        watched: [],
        history: [],
        recentSearches: [],
      };

      // Sessão iniciada direcionando para a tela de seleção de perfil
      const newSession: AuthSessionState = {
        isLoggedIn: true,
        activeAccountId: newAccountId,
        activeProfileId: null,
      };
      setAuthSession(newSession);
      try {
        localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(newSession));
      } catch {
        // quota
      }

      setState((prev) => ({
        ...prev,
        activeProfileId: null,
        profiles: {
          ...prev.profiles,
          [initialProfileId]: initialBucket,
        },
      }));

      setAuthModalOpen(false);
      pushToast(`Conta criada com sucesso! Bem-vindo(a), ${cleanName}!`, 'accent');

      // Dispara o aviso orientativo de DNS após o cadastro
      setShowDnsWelcomePrompt(true);

      return { success: true };
    },
    [accounts, pushToast]
  );

  const logout = useCallback(() => {
    const newSession: AuthSessionState = {
      isLoggedIn: false,
      activeAccountId: '',
      activeProfileId: null,
    };
    setAuthSession(newSession);
    try {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(newSession));
    } catch {
      // quota
    }
    setState((prev) => ({
      ...prev,
      activeProfileId: null,
    }));
    pushToast('Você saiu da sua conta');
  }, [pushToast]);

  const changePassword = useCallback(
    (oldPass: string, newPass: string) => {
      const cur = accounts.find((a) => a.id === authSession.activeAccountId) || accounts[0];
      if (!cur) {
        return { success: false, message: 'Nenhuma conta ativa encontrada.' };
      }
      if (cur.password !== oldPass.trim()) {
        return { success: false, message: 'A senha atual informada está incorreta.' };
      }
      if (newPass.trim().length < 6) {
        return { success: false, message: 'A nova senha deve ter no mínimo 6 caracteres.' };
      }

      const updatedAccounts = accounts.map((a) =>
        a.id === cur.id ? { ...a, password: newPass.trim() } : a
      );
      setAccounts(updatedAccounts);
      try {
        localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updatedAccounts));
      } catch {
        // quota
      }

      pushToast('Senha alterada com sucesso!', 'accent');
      return { success: true, message: 'Senha alterada com sucesso!' };
    },
    [accounts, authSession.activeAccountId, pushToast]
  );

  const updateAccountDetails = useCallback(
    (data: { email?: string; phone?: string; name?: string }) => {
      const cur = accounts.find((a) => a.id === authSession.activeAccountId) || accounts[0];
      if (!cur) {
        return { success: false, message: 'Nenhuma conta ativa encontrada.' };
      }

      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
        return { success: false, message: 'E-mail inválido.' };
      }

      const updatedAccount: UserAccount = {
        ...cur,
        name: data.name !== undefined ? data.name.trim() : cur.name,
        email: data.email !== undefined ? data.email.trim().toLowerCase() : cur.email,
        phone: data.phone !== undefined ? data.phone.trim() : cur.phone,
      };

      const updatedAccounts = accounts.map((a) => (a.id === cur.id ? updatedAccount : a));
      setAccounts(updatedAccounts);
      try {
        localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updatedAccounts));
      } catch {
        // quota
      }

      pushToast('Dados da conta atualizados');
      return { success: true };
    },
    [accounts, authSession.activeAccountId, pushToast]
  );

  // =========================================================================
  // GESTÃO DE DADOS DO PERFIL ATIVO (BIBLIOTECA, FAVORITOS, HISTÓRICO)
  // =========================================================================

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
      const exists = activeBucket.myList.some(
        (x) => x.id === entry.id && x.media_type === entry.media_type
      );
      updateActiveBucket((bucket) => ({
        ...bucket,
        myList: exists
          ? bucket.myList.filter((x) => !(x.id === entry.id && x.media_type === entry.media_type))
          : [entry, ...bucket.myList],
      }));
    },
    [activeBucket.myList, updateActiveBucket]
  );

  const toggleFavorite = useCallback(
    (item: TMDBMediaItem) => {
      const entry = createSavedEntry(item);
      const exists = activeBucket.favorites.some(
        (x) => x.id === entry.id && x.media_type === entry.media_type
      );
      updateActiveBucket((bucket) => ({
        ...bucket,
        favorites: exists
          ? bucket.favorites.filter((x) => !(x.id === entry.id && x.media_type === entry.media_type))
          : [entry, ...bucket.favorites],
      }));
    },
    [activeBucket.favorites, updateActiveBucket]
  );

  const toggleWatchLater = useCallback(
    (item: TMDBMediaItem) => {
      const entry = createSavedEntry(item);
      const exists = activeBucket.watchLater.some(
        (x) => x.id === entry.id && x.media_type === entry.media_type
      );
      updateActiveBucket((bucket) => ({
        ...bucket,
        watchLater: exists
          ? bucket.watchLater.filter((x) => !(x.id === entry.id && x.media_type === entry.media_type))
          : [entry, ...bucket.watchLater],
      }));
    },
    [activeBucket.watchLater, updateActiveBucket]
  );

  const toggleWatched = useCallback(
    (item: TMDBMediaItem) => {
      const entry = createSavedEntry(item);
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
    },
    [activeBucket.watched, updateActiveBucket]
  );

  const recordHistoryVisit = useCallback(
    (
      item: TMDBMediaItem,
      interactionType: 'viewed' | 'continuing' | 'completed' = 'viewed',
      episodeInfo?: { season: number; episode: number; title?: string }
    ) => {
      const base = createSavedEntry(item);
      const entry: HistoryEntry = {
        ...base,
        visitedAt: new Date().toISOString(),
        interactionType,
        trackedSeason: episodeInfo?.season,
        trackedEpisode: episodeInfo?.episode,
        trackedEpisodeTitle: episodeInfo?.title,
      };

      updateActiveBucket((bucket) => {
        const filtered = bucket.history.filter(
          (h) => !(h.id === entry.id && h.media_type === entry.media_type)
        );
        return {
          ...bucket,
          history: [entry, ...filtered].slice(0, 50),
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
    },
    [updateActiveBucket]
  );

  const removeFromContinueWatching = useCallback(
    (id: number, mediaType: MediaType) => {
      updateActiveBucket((bucket) => ({
        ...bucket,
        history: bucket.history.filter((h) => !(h.id === id && h.media_type === mediaType)),
      }));
    },
    [updateActiveBucket]
  );

  const clearHistory = useCallback(() => {
    updateActiveBucket((bucket) => ({
      ...bucket,
      history: [],
    }));
    pushToast('Histórico do perfil limpo com sucesso');
  }, [updateActiveBucket, pushToast]);

  const addRecentSearch = useCallback(
    (term: string) => {
      const clean = term.trim();
      if (!clean) return;
      updateActiveBucket((bucket) => {
        const filtered = bucket.recentSearches.filter((s) => s.toLowerCase() !== clean.toLowerCase());
        return {
          ...bucket,
          recentSearches: [clean, ...filtered].slice(0, 10),
        };
      });
    },
    [updateActiveBucket]
  );

  const removeRecentSearch = useCallback(
    (term: string) => {
      updateActiveBucket((bucket) => ({
        ...bucket,
        recentSearches: bucket.recentSearches.filter((s) => s !== term),
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

  const continueWatching = useMemo(
    () => activeBucket.history.filter((h) => h.interactionType !== 'completed').slice(0, 20),
    [activeBucket.history]
  );

  const exportUserDataJson = useCallback(() => {
    return JSON.stringify(state, null, 2);
  }, [state]);

  const importUserDataJson = useCallback(
    (rawJson: string): boolean => {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && parsed.profiles) {
          setState(parsed);
          pushToast('Dados importados com sucesso!', 'accent');
          return true;
        }
      } catch {
        // syntax error
      }
      pushToast('Arquivo de backup inválido.');
      return false;
    },
    [pushToast]
  );

  const allProfiles = useMemo(
    () => Object.values(state.profiles).map((b) => b.profile),
    [state.profiles]
  );

  const value: UserDataContextValue = useMemo(
    () => ({
      profile: activeBucket.profile,
      allProfiles,
      accountProfiles,
      activeProfileId: authSession.activeProfileId,
      isProfileSelected,
      isProfileSwitcherOpen,
      setProfileSwitcherOpen,

      selectProfile,
      unselectProfile,
      switchProfile,
      createNewProfile,
      createAccountProfile,
      updateAccountProfile,
      deleteAccountProfile,
      updateProfile,

      isLoggedIn: authSession.isLoggedIn,
      currentAccount,
      registeredAccounts: accounts,
      login,
      register,
      logout,
      changePassword,
      updateAccountDetails,
      isAuthModalOpen,
      authModalInitialMode,
      openAuthModal,
      closeAuthModal,

      // Avisos de DNS pós-cadastro
      showDnsWelcomePrompt,
      setShowDnsWelcomePrompt,
      showDnsThankYouPrompt,
      setShowDnsThankYouPrompt,
      isDnsFlowPendingReturn,
      setIsDnsFlowPendingReturn,

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
      accountProfiles,
      authSession.activeProfileId,
      isProfileSelected,
      isProfileSwitcherOpen,
      selectProfile,
      unselectProfile,
      switchProfile,
      createNewProfile,
      createAccountProfile,
      updateAccountProfile,
      deleteAccountProfile,
      updateProfile,
      authSession.isLoggedIn,
      currentAccount,
      accounts,
      login,
      register,
      logout,
      changePassword,
      updateAccountDetails,
      isAuthModalOpen,
      authModalInitialMode,
      openAuthModal,
      closeAuthModal,
      showDnsWelcomePrompt,
      showDnsThankYouPrompt,
      isDnsFlowPendingReturn,
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
