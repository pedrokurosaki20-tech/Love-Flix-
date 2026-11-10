import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Bookmark,
  Camera,
  Check,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  Heart,
  HelpCircle,
  History,
  Info,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Phone,
  Play,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Tv,
  Upload,
  User,
  UserCheck,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { useUserData } from '../context/UserDataContext';
import { useNavigation } from '../context/NavigationContext';
import { MediaCarousel } from '../components/MediaCarousel';
import { AuthCard } from '../components/AuthCard';
import {
  MOVIE_GENRES,
  STUDIO_AVATARS,
  type TMDBMediaItem,
} from '../types/tmdb';

type FullScreenTab =
  | 'my-list'
  | 'history'
  | 'favorites'
  | 'ratings'
  | 'preferences'
  | 'notifications'
  | 'dns'
  | 'help'
  | 'edit-profile'
  | 'account';

interface SelectSheetOption {
  value: string;
  label: string;
  description?: string;
}

interface SelectSheetConfig {
  title: string;
  subtitle?: string;
  options: SelectSheetOption[];
  currentValue: string;
  onSelect: (value: string) => void;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export const MyFlixPage: React.FC = () => {
  const {
    profile,
    updateProfile,
    myList,
    favorites,
    history,
    watched,
    toggleMyList,
    toggleFavorite,
    clearHistory,
    removeFromHistory,
    isLoggedIn,
    currentAccount,
    accountProfiles,
    unselectProfile,
    logout,
    changePassword,
    updateAccountDetails,
    pushToast,
    isDnsFlowPendingReturn,
    setIsDnsFlowPendingReturn,
    setShowDnsThankYouPrompt,
  } = useUserData();

  const { navigateToPage, openMediaDetail } = useNavigation();

  // Active full-screen tab
  const [activeTab, setActiveTab] = useState<FullScreenTab | null>(null);

  // Auto-open DNS tab when navigating from post-registration prompt
  useEffect(() => {
    if (isDnsFlowPendingReturn) {
      setActiveTab('dns');
    }
  }, [isDnsFlowPendingReturn]);

  // Search query within current full-screen tab (Minha lista, Favoritos, Histórico, etc.)
  const [tabSearchQuery, setTabSearchQuery] = useState('');

  // Profile edit form state (apenas foto da galeria e nome de exibição)
  const [editName, setEditName] = useState(profile.name || 'Pedro');
  const [avatarPreview, setAvatarPreview] = useState<string>(profile.avatarSrc || '');
  const [imageError, setImageError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Account form state (opção própria para e-mail, senha, celular e pagamento)
  const [accountEmail, setAccountEmail] = useState(profile.email || 'contato@loveflix.app');
  const [accountPhone, setAccountPhone] = useState(profile.phone || '+55 (11) 98765-4321');
  const [accountPassword, setAccountPassword] = useState(profile.maskedPassword || '••••••••••••');
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [accountSavedToast, setAccountSavedToast] = useState(false);

  // Sync state with current profile/account
  useEffect(() => {
    if (profile.email) setAccountEmail(profile.email);
    if (profile.phone) setAccountPhone(profile.phone);
    if (profile.name) setEditName(profile.name);
    if (profile.avatarSrc) setAvatarPreview(profile.avatarSrc);
    if (profile.maskedPassword) setAccountPassword(profile.maskedPassword);
  }, [profile.email, profile.phone, profile.name, profile.avatarSrc, profile.maskedPassword]);

  // Custom modal/sheet state for platform-styled select options
  const [activeSelectConfig, setActiveSelectConfig] = useState<SelectSheetConfig | null>(null);

  // DNS Protection state
  const DNS_HOSTNAME = 'dns.adguard-dns.com';
  const [dnsCopied, setDnsCopied] = useState(false);
  const [dnsTab, setDnsTab] = useState<'android' | 'ios' | 'browser'>('android');

  // Confirmation dialog for logging out
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Helpers for displaying active preference values cleanly
  const getLanguageLabel = (val?: string) => {
    switch (val) {
      case 'en-US':
        return 'English (US)';
      case 'es-ES':
        return 'Español';
      default:
        return 'Português (Brasil)';
    }
  };

  const getAudioLabel = (val?: string) => {
    return val === 'original' ? 'Áudio Original' : 'Dublado em Português';
  };

  const getSubtitleLabel = (val?: string) => {
    switch (val) {
      case 'always':
        return 'Sempre ativadas';
      case 'off':
        return 'Desativadas por padrão';
      default:
        return 'Automático (estrangeiras)';
    }
  };

  const getQualityLabel = (val?: string) => {
    switch (val) {
      case '1080p':
        return '1080p Full HD';
      case '720p':
        return '720p HD';
      case 'saver':
        return 'Economia de dados';
      default:
        return 'Automática (Recomendada)';
    }
  };

  const handleCopyAndRedirectDns = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(DNS_HOSTNAME);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = DNS_HOSTNAME;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setDnsCopied(true);
      setTimeout(() => setDnsCopied(false), 5000);

      // Attempt to trigger Android system DNS settings if on Android
      const ua = navigator.userAgent.toLowerCase();
      if (/android/i.test(ua)) {
        try {
          window.location.href =
            'intent:#Intent;action=android.settings.NETWORK_OPERATOR_SETTINGS;end';
        } catch {
          // Fallback to step-by-step instructions
        }
      }
    } catch {
      setDnsCopied(true);
      setTimeout(() => setDnsCopied(false), 5000);
    }
  };

  const handleCopyDns = handleCopyAndRedirectDns;

  // Foto de perfil da galeria
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAvatarPreview(result);
      setImageError(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setAvatarPreview('');
    setImageError(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (editName.trim()) {
      updateProfile({
        name: editName.trim(),
        avatarSrc: avatarPreview,
      });
      setActiveTab(null);
    }
  };

  const handleSaveAccount = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    updateAccountDetails({
      email: accountEmail.trim(),
      phone: accountPhone.trim(),
    });
    setAccountSavedToast(true);
    setTimeout(() => setAccountSavedToast(false), 4000);
  };

  const handleSavePassword = () => {
    setPasswordChangeError('');
    if (!currentPasswordInput) {
      setPasswordChangeError('Informe a sua senha atual de acesso.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordChangeError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordChangeError('As novas senhas digitadas não coincidem.');
      return;
    }
    const res = changePassword(currentPasswordInput, newPassword);
    if (!res.success) {
      setPasswordChangeError(res.message || 'Senha atual incorreta.');
    } else {
      setPasswordChangeError('');
      setIsEditingPassword(false);
      setCurrentPasswordInput('');
      setNewPassword('');
      setConfirmPassword('');
      setAccountPassword('••••••••••••');
      setAccountSavedToast(true);
      setTimeout(() => setAccountSavedToast(false), 4000);
    }
  };

  const openTab = (tab: FullScreenTab) => {
    setTabSearchQuery('');
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeTab = () => {
    if (activeTab === 'dns' && isDnsFlowPendingReturn) {
      setIsDnsFlowPendingReturn(false);
      setShowDnsThankYouPrompt(true);
    }
    setActiveTab(null);
    setTabSearchQuery('');
  };

  // Filtered and chunked data for Minha Lista
  const filteredMyList = useMemo(() => {
    const q = tabSearchQuery.trim().toLowerCase();
    if (!q) return myList;
    return myList.filter((item) => {
      const title = (item.title || item.name || '').toLowerCase();
      return title.includes(q);
    });
  }, [myList, tabSearchQuery]);

  const myListChunks = useMemo(() => {
    return chunkArray(filteredMyList, 10);
  }, [filteredMyList]);

  // Filtered and chunked data for Favoritos
  const filteredFavorites = useMemo(() => {
    const q = tabSearchQuery.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter((item) => {
      const title = (item.title || item.name || '').toLowerCase();
      return title.includes(q);
    });
  }, [favorites, tabSearchQuery]);

  const favoritesChunks = useMemo(() => {
    return chunkArray(filteredFavorites, 10);
  }, [filteredFavorites]);

  // Filtered and chunked data for Histórico
  const filteredHistory = useMemo(() => {
    const q = tabSearchQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => {
      const title = (item.title || item.name || '').toLowerCase();
      return title.includes(q);
    });
  }, [history, tabSearchQuery]);

  const historyChunks = useMemo(() => {
    return chunkArray(filteredHistory, 10);
  }, [filteredHistory]);

  // Filtered and chunked data for Minhas Avaliações
  const filteredWatched = useMemo(() => {
    const q = tabSearchQuery.trim().toLowerCase();
    if (!q) return watched;
    return watched.filter((item) => {
      const title = (item.title || item.name || '').toLowerCase();
      return title.includes(q);
    });
  }, [watched, tabSearchQuery]);

  const watchedChunks = useMemo(() => {
    return chunkArray(filteredWatched, 10);
  }, [filteredWatched]);

  // =========================================================================
  // SE O USUÁRIO NÃO ESTIVER LOGADO: TELA DE LOGIN / CADASTRO DA PLATAFORMA
  // =========================================================================
  if (!isLoggedIn) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 animate-fade-in">
        <AuthCard />
      </div>
    );
  }

  // =========================================================================
  // SE NENHUMA ABA ESTIVER ABERTA: RENDERIZA O MENU PRINCIPAL (DO PRINT)
  // =========================================================================
  if (activeTab === null) {
    return (
      <div className="max-w-xl mx-auto px-5 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Cabeçalho do Perfil */}
        <div className="flex items-center gap-4 pt-1 pb-2">
          {/* Avatar Circular com fallback seguro */}
          <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full overflow-hidden bg-[#242424] border border-white/15 flex items-center justify-center shrink-0">
            {profile.avatarSrc && profile.avatarSrc.trim() && !imageError ? (
              <img
                src={profile.avatarSrc}
                alt={profile.name}
                onError={() => setImageError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-8 h-8 text-white/70" />
            )}
          </div>

          {/* Informações do Usuário */}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight truncate leading-tight">
              {profile.name || 'Pedro'}
            </h1>
            <p className="text-xs sm:text-sm text-[#888888] mt-0.5">
              Minha conta Love Flix
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-1.5">
              <button
                type="button"
                onClick={() => {
                  setEditName(profile.name || 'Pedro');
                  setAvatarPreview(profile.avatarSrc || '');
                  setImageError(false);
                  openTab('edit-profile');
                }}
                className="text-xs sm:text-sm font-semibold text-[#FF253A] hover:text-[#ff4d5e] transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Editar perfil</span>
                <span>→</span>
              </button>
              <span className="text-white/20 text-xs">•</span>
              <button
                type="button"
                onClick={unselectProfile}
                className="text-xs sm:text-sm font-semibold text-[#A1A1A1] hover:text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-[#E50914]" />
                <span>Trocar de perfil</span>
              </button>
            </div>
          </div>
        </div>

        <hr className="border-t border-white/[0.08]" />

        {/* 1. Minha Biblioteca */}
        <section className="space-y-1">
          <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight mb-3">
            Minha biblioteca
          </h2>

          {/* Minha lista */}
          <button
            type="button"
            onClick={() => openTab('my-list')}
            className="w-full flex items-center justify-between py-3.5 px-1 hover:px-2 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Bookmark className="w-5 h-5 text-white/90 shrink-0" />
              <span className="text-base sm:text-lg font-medium text-white truncate">
                Minha lista
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {myList.length > 0 && (
                <span className="text-xs font-semibold text-[#888888] tabular-nums">
                  {myList.length}
                </span>
              )}
              <ChevronRight className="w-5 h-5 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>

          {/* Histórico */}
          <button
            type="button"
            onClick={() => openTab('history')}
            className="w-full flex items-center justify-between py-3.5 px-1 hover:px-2 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Clock className="w-5 h-5 text-white/90 shrink-0" />
              <span className="text-base sm:text-lg font-medium text-white truncate">
                Histórico
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {history.length > 0 && (
                <span className="text-xs font-semibold text-[#888888] tabular-nums">
                  {history.length}
                </span>
              )}
              <ChevronRight className="w-5 h-5 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>

          {/* Favoritos */}
          <button
            type="button"
            onClick={() => openTab('favorites')}
            className="w-full flex items-center justify-between py-3.5 px-1 hover:px-2 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Heart className="w-5 h-5 text-white/90 shrink-0" />
              <span className="text-base sm:text-lg font-medium text-white truncate">
                Favoritos
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {favorites.length > 0 && (
                <span className="text-xs font-semibold text-[#888888] tabular-nums">
                  {favorites.length}
                </span>
              )}
              <ChevronRight className="w-5 h-5 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>

          {/* Minhas avaliações */}
          <button
            type="button"
            onClick={() => openTab('ratings')}
            className="w-full flex items-center justify-between py-3.5 px-1 hover:px-2 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Star className="w-5 h-5 text-white/90 shrink-0" />
              <span className="text-base sm:text-lg font-medium text-white truncate">
                Minhas avaliações
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {watched.length > 0 && (
                <span className="text-xs font-semibold text-[#888888] tabular-nums">
                  {watched.length}
                </span>
              )}
              <ChevronRight className="w-5 h-5 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>
        </section>

        <hr className="border-t border-white/[0.08]" />

        {/* 2. Configurações */}
        <section className="space-y-1">
          <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight mb-3">
            Configurações
          </h2>

          {/* Conta e Acesso (E-mail, senha, celular, forma de pagamento) */}
          <button
            type="button"
            onClick={() => {
              setAccountEmail(profile.email || 'contato@loveflix.app');
              setAccountPhone(profile.phone || '+55 (11) 98765-4321');
              openTab('account');
            }}
            className="w-full flex items-center justify-between py-3.5 px-1 hover:px-2 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <KeyRound className="w-5 h-5 text-white/90 shrink-0" />
              <span className="text-base sm:text-lg font-medium text-white truncate">
                Conta e Acesso
              </span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
          </button>

          {/* Preferências */}
          <button
            type="button"
            onClick={() => openTab('preferences')}
            className="w-full flex items-center justify-between py-3.5 px-1 hover:px-2 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <SlidersHorizontal className="w-5 h-5 text-white/90 shrink-0" />
              <span className="text-base sm:text-lg font-medium text-white truncate">
                Preferências
              </span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
          </button>

          {/* Notificações */}
          <button
            type="button"
            onClick={() => openTab('notifications')}
            className="w-full flex items-center justify-between py-3.5 px-1 hover:px-2 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Bell className="w-5 h-5 text-white/90 shrink-0" />
              <span className="text-base sm:text-lg font-medium text-white truncate">
                Notificações
              </span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
          </button>

          {/* Proteção de Navegação (DNS) / Privacidade e segurança */}
          <button
            type="button"
            onClick={() => openTab('dns')}
            className="w-full flex items-center justify-between py-3.5 px-1 hover:px-2 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-base sm:text-lg font-medium text-white truncate block">
                  Privacidade e segurança
                </span>
                <span className="text-[11px] text-emerald-400/90 font-medium">
                  Proteção DNS contra anúncios e rastreadores
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                DNS DoT
              </span>
              <ChevronRight className="w-5 h-5 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>
        </section>

        <hr className="border-t border-white/[0.08]" />

        {/* 3. Rodapé da Conta */}
        <section className="space-y-1 pt-1">
          {/* Trocar e gerenciar perfis */}
          <button
            type="button"
            onClick={unselectProfile}
            className="w-full flex items-center justify-between py-3.5 px-1 hover:px-2 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <Users className="w-5 h-5 text-white/90 shrink-0" />
              <span className="text-base sm:text-lg font-medium text-white truncate">
                Quem está assistindo?
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#888888] font-medium">
                {accountProfiles.length}/4 perfis
              </span>
              <ChevronRight className="w-5 h-5 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>

          {/* Ajuda e suporte */}
          <button
            type="button"
            onClick={() => openTab('help')}
            className="w-full flex items-center justify-between py-3.5 px-1 hover:px-2 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer group text-left"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <HelpCircle className="w-5 h-5 text-white/90 shrink-0" />
              <span className="text-base sm:text-lg font-medium text-white truncate">
                Ajuda e suporte
              </span>
            </div>
            <ChevronRight className="w-5 h-5 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
          </button>

          {/* Sair da conta */}
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center gap-3.5 py-3.5 px-1 hover:px-2 rounded-xl hover:bg-red-500/[0.05] transition-all cursor-pointer text-left text-[#FF253A] hover:text-[#ff4d5e]"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className="text-base sm:text-lg font-medium">Sair da conta</span>
          </button>
        </section>

        {/* Confirmação de Sair da Conta */}
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
            <div className="relative w-full max-w-sm rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-[#FF253A] flex items-center justify-center mx-auto">
                <LogOut className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-white">Deseja sair da conta?</h3>
                <p className="text-xs text-[#A1A1A1] mt-1">
                  Seus filmes salvos e preferências permanecerão armazenados com segurança no seu navegador.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    setActiveTab(null);
                    logout();
                  }}
                  className="px-5 py-2 rounded-xl bg-[#FF253A] hover:bg-[#e01e32] text-white text-xs font-bold cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // RENDERIZAÇÃO EM ABA TELA CHEIA (FULL-SCREEN VIEW) PARA CADA FUNÇÃO
  // =========================================================================
  return (
    <div className="py-6 sm:py-8 animate-fade-in">
      {/* Top Bar com botão de voltar para o menu principal de Minha Flix */}
      <div className="px-4 sm:px-6 lg:px-10 mb-6 flex flex-col gap-4">
        <button
          type="button"
          onClick={closeTab}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#A1A1A1] hover:text-white transition-colors cursor-pointer self-start group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Voltar para Minha Flix</span>
        </button>

        {/* Título da Aba */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              {activeTab === 'my-list' && (
                <>
                  <Bookmark className="w-6 h-6 text-white" />
                  <span>Minha Lista</span>
                </>
              )}
              {activeTab === 'favorites' && (
                <>
                  <Heart className="w-6 h-6 text-white" />
                  <span>Favoritos</span>
                </>
              )}
              {activeTab === 'history' && (
                <>
                  <Clock className="w-6 h-6 text-white" />
                  <span>Histórico de Reprodução</span>
                </>
              )}
              {activeTab === 'ratings' && (
                <>
                  <Star className="w-6 h-6 text-white" />
                  <span>Minhas Avaliações</span>
                </>
              )}
              {activeTab === 'preferences' && (
                <>
                  <SlidersHorizontal className="w-6 h-6 text-white" />
                  <span>Preferências</span>
                </>
              )}
              {activeTab === 'notifications' && (
                <>
                  <Bell className="w-6 h-6 text-white" />
                  <span>Notificações</span>
                </>
              )}
              {activeTab === 'dns' && (
                <>
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>Privacidade e Segurança</span>
                </>
              )}
              {activeTab === 'help' && (
                <>
                  <HelpCircle className="w-6 h-6 text-white" />
                  <span>Ajuda e Suporte</span>
                </>
              )}
              {activeTab === 'account' && (
                <>
                  <KeyRound className="w-6 h-6 text-white" />
                  <span>Conta e Acesso</span>
                </>
              )}
              {activeTab === 'edit-profile' && (
                <>
                  <User className="w-6 h-6 text-white" />
                  <span>Editar Perfil</span>
                </>
              )}
            </h1>

            <p className="text-xs sm:text-sm text-[#A1A1A1] mt-1">
              {activeTab === 'my-list' && `${myList.length} títulos salvos na sua biblioteca`}
              {activeTab === 'favorites' && `${favorites.length} títulos marcados como favoritos`}
              {activeTab === 'history' && `${history.length} títulos visualizados recentemente`}
              {activeTab === 'ratings' && `${watched.length} títulos assistidos e concluídos`}
              {activeTab === 'preferences' && 'Configurações de áudio, legendas, streaming e tela'}
              {activeTab === 'notifications' && 'Controle de avisos e novidades da plataforma'}
              {activeTab === 'dns' && 'Configuração de DNS privada para bloquear anúncios e rastreadores'}
              {activeTab === 'help' && 'Tire dúvidas sobre canais de reprodução, legendas e salas'}
              {activeTab === 'edit-profile' && 'Atualize sua foto de perfil da galeria e seu nome de exibição'}
            </p>
          </div>

          {/* Botão limpar histórico se estiver na aba de histórico */}
          {activeTab === 'history' && history.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white transition-colors cursor-pointer self-start sm:self-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar histórico</span>
            </button>
          )}
        </div>

        {/* Barra de pesquisa para Minha Lista, Favoritos, Histórico e Avaliações */}
        {(activeTab === 'my-list' ||
          activeTab === 'favorites' ||
          activeTab === 'history' ||
          activeTab === 'ratings') && (
          <div className="relative mt-2 max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1A1]" />
            <input
              type="text"
              value={tabSearchQuery}
              onChange={(e) => setTabSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'my-list'
                  ? 'Pesquisar em Minha Lista...'
                  : activeTab === 'favorites'
                  ? 'Pesquisar em Favoritos...'
                  : activeTab === 'history'
                  ? 'Pesquisar no Histórico...'
                  : 'Pesquisar em Minhas Avaliações...'
              }
              className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#141414] border border-white/10 text-xs sm:text-sm text-white placeholder:text-[#A1A1A1] focus:outline-none focus:border-white/30 transition-colors"
            />
            {tabSearchQuery && (
              <button
                type="button"
                onClick={() => setTabSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* =========================================================================
          CONTEÚDO DA ABA: MINHA LISTA (Carrosséis de no máximo 10 filmes)
          ========================================================================= */}
      {activeTab === 'my-list' && (
        <div className="space-y-6">
          {filteredMyList.length === 0 ? (
            <div className="mx-4 sm:px-6 lg:px-10 p-10 rounded-2xl bg-[#121212] border border-white/[0.08] text-center max-w-xl mx-auto space-y-3">
              <p className="text-base font-bold text-white">
                {tabSearchQuery ? 'Nenhum resultado para esta busca' : 'Sua lista está vazia'}
              </p>
              <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
                {tabSearchQuery
                  ? 'Tente buscar com outro termo ou limpe a pesquisa acima.'
                  : 'Adicione filmes e séries tocando no botão "+ Minha lista" nos cards ou detalhes.'}
              </p>
              {!tabSearchQuery && (
                <button
                  type="button"
                  onClick={() => navigateToPage('home')}
                  className="px-5 py-2.5 rounded-xl bg-white text-black font-bold text-xs hover:bg-white/90 cursor-pointer"
                >
                  Explorar catálogo
                </button>
              )}
            </div>
          ) : (
            myListChunks.map((chunk, idx) => {
              const startNum = idx * 10 + 1;
              const endNum = Math.min((idx + 1) * 10, filteredMyList.length);
              const title =
                myListChunks.length > 1
                  ? `Minha Lista • Fileira ${idx + 1} (${startNum} a ${endNum})`
                  : 'Filmes e Séries salvos';

              return (
                <MediaCarousel
                  key={`my-list-chunk-${idx}`}
                  title={title}
                  items={chunk}
                  onRemoveItem={(item) => toggleMyList(item)}
                  removeTooltip="Remover da Minha Lista"
                />
              );
            })
          )}
        </div>
      )}

      {/* =========================================================================
          CONTEÚDO DA ABA: FAVORITOS (Carrosséis de no máximo 10 filmes)
          ========================================================================= */}
      {activeTab === 'favorites' && (
        <div className="space-y-6">
          {filteredFavorites.length === 0 ? (
            <div className="mx-4 sm:px-6 lg:px-10 p-10 rounded-2xl bg-[#121212] border border-white/[0.08] text-center max-w-xl mx-auto space-y-3">
              <p className="text-base font-bold text-white">
                {tabSearchQuery ? 'Nenhum favorito encontrado' : 'Nenhum favorito marcado ainda'}
              </p>
              <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
                {tabSearchQuery
                  ? 'Nenhum título favorito coincide com sua pesquisa.'
                  : 'Marque com o coração as produções que você mais ama para reuni-las aqui.'}
              </p>
              {!tabSearchQuery && (
                <button
                  type="button"
                  onClick={() => navigateToPage('movies')}
                  className="px-5 py-2.5 rounded-xl bg-white text-black font-bold text-xs hover:bg-white/90 cursor-pointer"
                >
                  Ver filmes e séries
                </button>
              )}
            </div>
          ) : (
            favoritesChunks.map((chunk, idx) => {
              const startNum = idx * 10 + 1;
              const endNum = Math.min((idx + 1) * 10, filteredFavorites.length);
              const title =
                favoritesChunks.length > 1
                  ? `Meus Favoritos • Fileira ${idx + 1} (${startNum} a ${endNum})`
                  : 'Títulos favoritos';

              return (
                <MediaCarousel
                  key={`favorites-chunk-${idx}`}
                  title={title}
                  items={chunk}
                  onRemoveItem={(item) => toggleFavorite(item)}
                  removeTooltip="Remover dos Favoritos"
                />
              );
            })
          )}
        </div>
      )}

      {/* =========================================================================
          CONTEÚDO DA ABA: HISTÓRICO (Carrosséis de no máximo 10 filmes)
          ========================================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {filteredHistory.length === 0 ? (
            <div className="mx-4 sm:px-6 lg:px-10 p-10 rounded-2xl bg-[#121212] border border-white/[0.08] text-center max-w-xl mx-auto space-y-3">
              <p className="text-base font-bold text-white">
                {tabSearchQuery ? 'Nenhum título encontrado' : 'Seu histórico está limpo'}
              </p>
              <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
                {tabSearchQuery
                  ? 'Nenhum item do histórico corresponde à pesquisa.'
                  : 'Os filmes e séries que você assistir aparecerão organizados aqui.'}
              </p>
              {!tabSearchQuery && (
                <button
                  type="button"
                  onClick={() => navigateToPage('home')}
                  className="px-5 py-2.5 rounded-xl bg-white text-black font-bold text-xs hover:bg-white/90 cursor-pointer"
                >
                  Começar a assistir
                </button>
              )}
            </div>
          ) : (
            historyChunks.map((chunk, idx) => {
              const startNum = idx * 10 + 1;
              const endNum = Math.min((idx + 1) * 10, filteredHistory.length);
              const title =
                historyChunks.length > 1
                  ? `Histórico Recente • Fileira ${idx + 1} (${startNum} a ${endNum})`
                  : 'Últimos assistidos';

              return (
                <MediaCarousel
                  key={`history-chunk-${idx}`}
                  title={title}
                  items={chunk}
                  onRemoveItem={(item) =>
                    removeFromHistory(item.id, (item.media_type as 'movie' | 'tv') || 'movie')
                  }
                  removeTooltip="Remover do Histórico"
                />
              );
            })
          )}
        </div>
      )}

      {/* =========================================================================
          CONTEÚDO DA ABA: MINHAS AVALIAÇÕES (Carrosséis de no máximo 10 filmes)
          ========================================================================= */}
      {activeTab === 'ratings' && (
        <div className="space-y-6">
          {filteredWatched.length === 0 ? (
            <div className="mx-4 sm:px-6 lg:px-10 p-10 rounded-2xl bg-[#121212] border border-white/[0.08] text-center max-w-xl mx-auto space-y-3">
              <p className="text-base font-bold text-white">
                {tabSearchQuery ? 'Nenhum título encontrado' : 'Nenhuma avaliação realizada ainda'}
              </p>
              <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
                {tabSearchQuery
                  ? 'Nenhum item avaliado coincide com a pesquisa.'
                  : 'Títulos concluídos ou avaliados aparecerão aqui organizados.'}
              </p>
            </div>
          ) : (
            watchedChunks.map((chunk, idx) => {
              const startNum = idx * 10 + 1;
              const endNum = Math.min((idx + 1) * 10, filteredWatched.length);
              const title =
                watchedChunks.length > 1
                  ? `Avaliados e Concluídos • Fileira ${idx + 1} (${startNum} a ${endNum})`
                  : 'Títulos avaliados';

              return (
                <MediaCarousel
                  key={`watched-chunk-${idx}`}
                  title={title}
                  items={chunk}
                />
              );
            })
          )}
        </div>
      )}

      {/* =========================================================================
          CONTEÚDO DA ABA: PREFERÊNCIAS (Tela Cheia - Layout Formal e Integrado)
          ========================================================================= */}
      {activeTab === 'preferences' && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 space-y-7">
          {/* Seção 1: Áudio e Legendas */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8E8E93] px-1">
              Áudio e Legendas
            </h3>
            <div className="rounded-2xl bg-[#141414] border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden shadow-lg">
              {/* Áudio padrão preferido */}
              <button
                type="button"
                onClick={() =>
                  setActiveSelectConfig({
                    title: 'Áudio padrão preferido',
                    subtitle: 'Prioridade de faixa de áudio ao abrir produções',
                    currentValue: profile.audioLanguage || 'pt',
                    options: [
                      {
                        value: 'pt',
                        label: 'Dublado em Português',
                        description: 'Prioriza canais e faixas dubladas em português',
                      },
                      {
                        value: 'original',
                        label: 'Áudio Original',
                        description: 'Prioriza o idioma original com ou sem legendas',
                      },
                    ],
                    onSelect: (val) =>
                      updateProfile({ audioLanguage: val as 'pt' | 'original' }),
                  })
                }
                className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-white/[0.03] transition-colors cursor-pointer text-left group"
              >
                <div className="min-w-0 pr-4">
                  <p className="text-sm font-semibold text-white group-hover:text-white transition-colors">
                    Áudio padrão preferido
                  </p>
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    Prioridade para canais dublados ou áudio original
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-medium text-white/90 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10">
                    {getAudioLabel(profile.audioLanguage)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>

              {/* Preferência de legendas */}
              <button
                type="button"
                onClick={() =>
                  setActiveSelectConfig({
                    title: 'Preferência de legendas',
                    subtitle: 'Comportamento inicial de legendas no player',
                    currentValue: profile.subtitlePreference || 'auto',
                    options: [
                      {
                        value: 'auto',
                        label: 'Automático (em produções estrangeiras)',
                        description: 'Ativa legendas automaticamente em conteúdos de idioma estrangeiro',
                      },
                      {
                        value: 'always',
                        label: 'Sempre ativadas',
                        description: 'Exibe legendas em todas as produções por padrão',
                      },
                      {
                        value: 'off',
                        label: 'Desativadas por padrão',
                        description: 'Inicia com legendas desligadas (podendo ativar no player)',
                      },
                    ],
                    onSelect: (val) =>
                      updateProfile({
                        subtitlePreference: val as 'auto' | 'always' | 'off',
                      }),
                  })
                }
                className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-white/[0.03] transition-colors cursor-pointer text-left group"
              >
                <div className="min-w-0 pr-4">
                  <p className="text-sm font-semibold text-white group-hover:text-white transition-colors">
                    Preferência de legendas
                  </p>
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    Comportamento inicial de legendas no player
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-medium text-white/90 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10">
                    {getSubtitleLabel(profile.subtitlePreference)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>
            </div>
          </div>

          {/* Seção 2: Reprodução e Vídeo */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8E8E93] px-1">
              Reprodução e Vídeo
            </h3>
            <div className="rounded-2xl bg-[#141414] border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden shadow-lg">
              {/* Qualidade de reprodução */}
              <button
                type="button"
                onClick={() =>
                  setActiveSelectConfig({
                    title: 'Qualidade de reprodução',
                    subtitle: 'Resolução padrão preferida de streaming',
                    currentValue: profile.playbackQuality || 'auto',
                    options: [
                      {
                        value: 'auto',
                        label: 'Automática (qualidade recomendada)',
                        description: 'Ajuste dinâmico inteligente conforme a velocidade da conexão',
                      },
                      {
                        value: '1080p',
                        label: 'Alta Definição (1080p FHD)',
                        description: 'Máxima resolução e nitidez visual',
                      },
                      {
                        value: '720p',
                        label: 'Padrão (720p HD)',
                        description: 'Boa qualidade com carregamento acelerado',
                      },
                      {
                        value: 'saver',
                        label: 'Economia de dados móveis',
                        description: 'Menor consumo de franquia em conexões limitadas',
                      },
                    ],
                    onSelect: (val) =>
                      updateProfile({
                        playbackQuality: val as 'auto' | '1080p' | '720p' | 'saver',
                      }),
                  })
                }
                className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-white/[0.03] transition-colors cursor-pointer text-left group"
              >
                <div className="min-w-0 pr-4">
                  <p className="text-sm font-semibold text-white group-hover:text-white transition-colors">
                    Qualidade de reprodução
                  </p>
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    Resolução de streaming e estabilidade
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-medium text-white/90 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10">
                    {getQualityLabel(profile.playbackQuality)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>

              {/* Rotação automática no telão */}
              <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="min-w-0 pr-4">
                  <p className="text-sm font-semibold text-white">Rotação automática no telão</p>
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    Girar banners de destaque suavemente na tela inicial
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateProfile({ autoplayHero: !profile.autoplayHero })}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    profile.autoplayHero ? 'bg-white' : 'bg-[#252525]'
                  }`}
                  aria-label="Alternar rotação automática do telão"
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-black transition-transform absolute top-0.5 ${
                      profile.autoplayHero ? 'left-6.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Seção 3: Interface e Sistema */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8E8E93] px-1">
              Interface e Sistema
            </h3>
            <div className="rounded-2xl bg-[#141414] border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden shadow-lg">
              {/* Idioma do aplicativo */}
              <button
                type="button"
                onClick={() =>
                  setActiveSelectConfig({
                    title: 'Idioma do aplicativo',
                    subtitle: 'Selecione o idioma dos menus e textos da interface',
                    currentValue: profile.preferredLanguage || 'pt-BR',
                    options: [
                      {
                        value: 'pt-BR',
                        label: 'Português (Brasil)',
                        description: 'Interface em português brasileiro',
                      },
                      {
                        value: 'en-US',
                        label: 'English (US)',
                        description: 'English language interface',
                      },
                      {
                        value: 'es-ES',
                        label: 'Español',
                        description: 'Interfaz en español',
                      },
                    ],
                    onSelect: (val) => updateProfile({ preferredLanguage: val }),
                  })
                }
                className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-white/[0.03] transition-colors cursor-pointer text-left group"
              >
                <div className="min-w-0 pr-4">
                  <p className="text-sm font-semibold text-white group-hover:text-white transition-colors">
                    Idioma do aplicativo
                  </p>
                  <p className="text-xs text-[#8E8E93] mt-0.5">Interface e menus principais</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-medium text-white/90 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10">
                    {getLanguageLabel(profile.preferredLanguage)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#666666] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONTEÚDO DA ABA: NOTIFICAÇÕES (Tela Cheia)
          ========================================================================= */}
      {activeTab === 'notifications' && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl bg-[#121212] border border-white/[0.08] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-white">Lançamentos semanais e novos episódios</p>
                <p className="text-xs text-[#A1A1A1] mt-0.5">
                  Receber alertas sobre novas temporadas e conteúdos da sua lista
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateProfile({
                    notificationsEnabled: !(profile.notificationsEnabled ?? true),
                  })
                }
                className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                  (profile.notificationsEnabled ?? true) ? 'bg-white' : 'bg-[#252525]'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-black transition-transform absolute top-0.5 ${
                    (profile.notificationsEnabled ?? true) ? 'left-6.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONTEÚDO DA ABA: PROTEÇÃO DE NAVEGAÇÃO DNS (Compacto e Organizado)
          ========================================================================= */}
      {activeTab === 'dns' && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-5">
          {/* Explicação concisa e formal */}
          <p className="text-xs sm:text-sm text-[#CCCCCC] leading-relaxed">
            A DNS privada ajuda a bloquear anúncios indesejados, pop-ups e rastreadores durante a reprodução. Ao tocar no botão abaixo, o endereço seguro é copiado automaticamente para você salvar nas configurações de rede do seu aparelho.
          </p>

          {/* Botão de Redirecionar e Copiar Diretamente */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleCopyAndRedirectDns}
              className="w-full inline-flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-xl bg-white hover:bg-white/90 text-black text-sm font-extrabold shadow-md transition-all active:scale-[0.98] cursor-pointer"
            >
              <Shield className="w-4 h-4 fill-black text-black" />
              <span>Configurar proteção</span>
            </button>

            {dnsCopied && (
              <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center justify-center gap-2 animate-fade-in text-center">
                <Check className="w-4 h-4 shrink-0 stroke-[3]" />
                <span>
                  Endereço <strong className="font-mono text-white">{DNS_HOSTNAME}</strong> copiado! Agora cole nas configurações.
                </span>
              </div>
            )}
          </div>

          {/* Guias por Sistema Operacional */}
          <div className="space-y-3 pt-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[#8E8E93]">
              Passo a passo no seu aparelho
            </p>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#181818] border border-white/10">
              <button
                type="button"
                onClick={() => setDnsTab('android')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  dnsTab === 'android' ? 'bg-white text-black shadow' : 'text-[#A1A1A1] hover:text-white'
                }`}
              >
                Android
              </button>
              <button
                type="button"
                onClick={() => setDnsTab('ios')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  dnsTab === 'ios' ? 'bg-white text-black shadow' : 'text-[#A1A1A1] hover:text-white'
                }`}
              >
                iOS (iPhone/iPad)
              </button>
              <button
                type="button"
                onClick={() => setDnsTab('browser')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  dnsTab === 'browser' ? 'bg-white text-black shadow' : 'text-[#A1A1A1] hover:text-white'
                }`}
              >
                Navegador Web
              </button>
            </div>

            {dnsTab === 'android' && (
              <ol className="space-y-2 text-xs sm:text-sm text-[#C0C0C0] leading-relaxed list-decimal list-inside bg-[#141414] p-4 rounded-xl border border-white/[0.08]">
                <li>Abra as <strong className="text-white">Configurações</strong> do aparelho.</li>
                <li>Toque em <strong className="text-white">Rede e Internet</strong> (ou <strong className="text-white">Conexões</strong>).</li>
                <li>Role até encontrar a opção <strong className="text-white">DNS Privado</strong>.</li>
                <li>Selecione <strong className="text-white">Nome do host do provedor de DNS privado</strong>.</li>
                <li>
                  Cole o endereço copiado: <code className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded text-xs">{DNS_HOSTNAME}</code> e toque em <strong className="text-white">Salvar</strong>.
                </li>
              </ol>
            )}

            {dnsTab === 'ios' && (
              <ol className="space-y-2 text-xs sm:text-sm text-[#C0C0C0] leading-relaxed list-decimal list-inside bg-[#141414] p-4 rounded-xl border border-white/[0.08]">
                <li>Acesse <strong className="text-white">Ajustes</strong> &gt; <strong className="text-white">Wi-Fi</strong>.</li>
                <li>Toque no ícone azul <strong className="text-white">(i)</strong> ao lado da sua rede conectada.</li>
                <li>Role até <strong className="text-white">Configurar DNS</strong> e selecione <strong className="text-white">Manual</strong>.</li>
                <li>Adicione o provedor de DNS seguro DoT compatível com sua conexão.</li>
              </ol>
            )}

            {dnsTab === 'browser' && (
              <ol className="space-y-2 text-xs sm:text-sm text-[#C0C0C0] leading-relaxed list-decimal list-inside bg-[#141414] p-4 rounded-xl border border-white/[0.08]">
                <li>Abra as <strong className="text-white">Configurações</strong> do navegador (Chrome, Brave, Edge).</li>
                <li>Acesse <strong className="text-white">Privacidade e Segurança</strong> &gt; <strong className="text-white">Segurança</strong>.</li>
                <li>Ative <strong className="text-white">Usar DNS seguro</strong>.</li>
                <li>Escolha <strong className="text-white">Personalizado</strong> e digite: <code className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded text-xs">https://dns.adguard-dns.com/dns-query</code>.</li>
              </ol>
            )}
          </div>

          {/* Informações técnicas enxutas */}
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-[#8E8E93] leading-relaxed space-y-1">
            <p className="font-semibold text-white/80">Informações técnicas:</p>
            <p>• A DNS privada opera via protocolo DoT (DNS-over-TLS). Trata-se de um hostname de segurança para filtrar requisições indesejadas.</p>
            <p>• O bloqueio de elementos depende da configuração correta diretamente no sistema do seu dispositivo. A Love Flix não bloqueia conteúdos internamente por código.</p>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONTEÚDO DA ABA: AJUDA E SUPORTE (Tela Cheia)
          ========================================================================= */}
      {activeTab === 'help' && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-4">
          <div className="rounded-2xl bg-[#121212] border border-white/[0.08] p-5 sm:p-6 space-y-4 text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
            <div className="space-y-1 pb-3 border-b border-white/[0.06]">
              <h3 className="font-bold text-white text-sm">Como funcionam os Canais 1, 2 e 3?</h3>
              <p>
                Cada canal utiliza um provedor de streaming alternativo. Caso um filme apresente lentidão ou não carregue no Canal 1, basta alternar para o Canal 2 ou Canal 3 no topo do player.
              </p>
            </div>

            <div className="space-y-1 pb-3 border-b border-white/[0.06]">
              <h3 className="font-bold text-white text-sm">Legendas e Áudio</h3>
              <p>
                No player, você pode selecionar faixas de áudio e ativar ou desativar legendas no ícone de engrenagem e nos seletores de canal.
              </p>
            </div>

            <div className="space-y-1 pb-3 border-b border-white/[0.06]">
              <h3 className="font-bold text-white text-sm">Proteção contra Anúncios</h3>
              <p>
                Acesse a aba <strong>Privacidade e segurança</strong> em Minha Flix e ative a DNS privada para navegar sem pop-ups e redirecionamentos.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-white text-sm">Sincronização em Sala</h3>
              <p>
                A Love Flix conta com protocolo de sincronização em tempo real (WebRTC) para você assistir simultaneamente com seus amigos.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONTEÚDO DA ABA: CONTA E ACESSO (E-mail, Senha, Celular e Forma de Pagamento)
          ========================================================================= */}
      {activeTab === 'account' && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-7">
          {accountSavedToast && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center justify-center gap-2 animate-fade-in text-center">
              <Check className="w-4 h-4 shrink-0 stroke-[3]" />
              <span>Dados da conta atualizados com sucesso!</span>
            </div>
          )}

          {/* Seção 1: Dados de Acesso e Contato */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8E8E93] px-1">
              Dados de Acesso e Contato
            </h3>
            <div className="rounded-2xl bg-[#141414] border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden shadow-lg">
              {/* E-mail cadastrado */}
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-white/70 shrink-0" />
                  <p className="text-sm font-semibold text-white">E-mail cadastrado</p>
                </div>
                <div className="sm:max-w-xs w-full sm:w-auto">
                  <input
                    type="email"
                    value={accountEmail}
                    onChange={(e) => setAccountEmail(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#1c1c1c] border border-white/12 text-xs sm:text-sm text-white focus:outline-none focus:border-white/40"
                    placeholder="seu.email@exemplo.com"
                  />
                </div>
              </div>

              {/* Senha de Acesso */}
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-white/70 shrink-0" />
                  <p className="text-sm font-semibold text-white">Senha de acesso</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-sm tracking-widest text-[#A1A1A1] px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10">
                    {accountPassword}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingPassword(!isEditingPassword)}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white transition-colors cursor-pointer"
                  >
                    {isEditingPassword ? 'Fechar' : 'Alterar'}
                  </button>
                </div>
              </div>

              {/* Formulário expansível de alterar senha */}
              {isEditingPassword && (
                <div className="p-4 sm:p-5 bg-black/40 space-y-3.5 animate-fade-in border-t border-white/[0.06]">
                  <p className="text-xs font-semibold text-white">Alterar senha da conta</p>

                  {passwordChangeError && (
                    <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-[#FF4757] text-xs font-medium animate-fade-in text-center">
                      {passwordChangeError}
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] text-[#A1A1A1] mb-1">Senha atual (padrão: 123456)</label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={currentPasswordInput}
                        onChange={(e) => setCurrentPasswordInput(e.target.value)}
                        placeholder="Digite sua senha atual"
                        className="w-full px-3 py-2 rounded-xl bg-[#1c1c1c] border border-white/12 text-xs text-white focus:outline-none focus:border-white/40"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#A1A1A1] mb-1">Nova senha</label>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          className="w-full px-3 py-2 rounded-xl bg-[#1c1c1c] border border-white/12 text-xs text-white focus:outline-none focus:border-white/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#A1A1A1] mb-1">Confirmar nova senha</label>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repita a nova senha"
                          className="w-full px-3 py-2 rounded-xl bg-[#1c1c1c] border border-white/12 text-xs text-white focus:outline-none focus:border-white/40"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[11px] text-[#A1A1A1] hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showPassword ? 'Ocultar' : 'Mostrar'} senha</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePassword}
                      disabled={!currentPasswordInput || !newPassword || !confirmPassword}
                      className="px-4 py-1.5 rounded-lg bg-white text-black font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Salvar senha
                    </button>
                  </div>
                </div>
              )}

              {/* Número de Celular */}
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-white/70 shrink-0" />
                  <p className="text-sm font-semibold text-white">Número de celular</p>
                </div>
                <div className="sm:max-w-xs w-full sm:w-auto">
                  <input
                    type="tel"
                    value={accountPhone}
                    onChange={(e) => setAccountPhone(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#1c1c1c] border border-white/12 text-xs sm:text-sm text-white focus:outline-none focus:border-white/40 font-mono"
                    placeholder="+55 (11) 98765-4321"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Seção 2: Forma de Pagamento e Assinatura */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8E8E93] px-1">
              Plano e Forma de Pagamento
            </h3>
            <div className="rounded-2xl bg-[#141414] border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden shadow-lg">
              {/* Assinatura Love Flix */}
              <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-white/70 shrink-0" />
                  <p className="text-sm font-semibold text-white">Assinatura Love Flix</p>
                </div>
                <p className="text-sm font-semibold text-white">R$ 0,00 / mês</p>
              </div>

              {/* Forma de Pagamento Cadastrada */}
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Forma de pagamento</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-xs text-white/90 font-mono">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Mastercard final •••• 4242</span>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    pushToast('As opções de faturamento e novas formas de pagamento serão habilitadas na próxima etapa.');
                  }}
                  className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white border border-white/10 transition-colors cursor-pointer self-start sm:self-auto shrink-0"
                >
                  Gerenciar pagamento
                </button>
              </div>
            </div>
          </div>

          {/* Botão de Salvar Alterações da Conta */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeTab}
              className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white cursor-pointer transition-colors"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleSaveAccount}
              className="px-6 py-2.5 rounded-xl bg-white hover:bg-white/90 text-black text-xs font-bold shadow-md cursor-pointer transition-all active:scale-[0.98]"
            >
              Salvar dados da conta
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONTEÚDO DA ABA: EDITAR PERFIL (Apenas Foto da Galeria e Nome de Usuário)
          ========================================================================= */}
      {activeTab === 'edit-profile' && (
        <div className="max-w-xl mx-auto px-4 sm:px-6 space-y-6">
          <div className="rounded-2xl bg-[#141414] border border-white/[0.08] p-6 sm:p-8 space-y-8 shadow-xl">
            {/* 1. Foto de perfil da galeria */}
            <div className="flex flex-col items-center text-center space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageFileChange}
              />

              {/* Avatar circular preview */}
              <div className="relative group">
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-[#222222] border-2 border-white/20 shadow-2xl flex items-center justify-center">
                  {avatarPreview && avatarPreview.trim() && !imageError ? (
                    <img
                      src={avatarPreview}
                      alt="Foto de perfil"
                      onError={() => setImageError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-12 h-12 text-white/60" />
                  )}
                </div>

                {/* Botão flutuante rápido para abrir galeria */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-white text-black hover:bg-white/90 shadow-lg flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
                  title="Escolher foto da galeria"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>

              {/* Controles da foto */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white border border-white/10 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Escolher foto da galeria</span>
                </button>

                {avatarPreview && (
                  <div>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="text-[11px] text-[#A1A1A1] hover:text-red-400 transition-colors cursor-pointer"
                    >
                      Remover foto
                    </button>
                  </div>
                )}
              </div>
            </div>

            <hr className="border-t border-white/[0.06]" />

            {/* 2. Opção de alterar o nome */}
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#8E8E93]">
                  Nome de usuário
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Seu nome ou apelido"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-[#1c1c1c] border border-white/15 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-white/40 transition-colors"
                />
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeTab}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-white hover:bg-white/90 text-black text-xs font-bold shadow-md cursor-pointer transition-all active:scale-[0.98]"
                >
                  Salvar perfil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Card Estilizado da Plataforma para Seleção de Preferências */}
      {activeSelectConfig && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setActiveSelectConfig(null)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-[#141414] border border-white/15 p-5 sm:p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do Card */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="font-display text-base sm:text-lg font-bold text-white tracking-tight">
                  {activeSelectConfig.title}
                </h3>
                {activeSelectConfig.subtitle && (
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    {activeSelectConfig.subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveSelectConfig(null)}
                className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista de Opções Estilizadas */}
            <div className="space-y-2 py-1 max-h-[60vh] overflow-y-auto">
              {activeSelectConfig.options.map((opt) => {
                const isSelected = activeSelectConfig.currentValue === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      activeSelectConfig.onSelect(opt.value);
                      setActiveSelectConfig(null);
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'bg-white/[0.08] border-white/40 text-white shadow-sm'
                        : 'bg-white/[0.02] border-white/[0.06] text-[#A1A1A1] hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <div className="min-w-0 pr-3">
                      <p className={`text-sm ${isSelected ? 'font-bold text-white' : 'font-medium'}`}>
                        {opt.label}
                      </p>
                      {opt.description && (
                        <p className="text-xs text-[#777777] mt-0.5 line-clamp-2">
                          {opt.description}
                        </p>
                      )}
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-white text-black'
                          : 'border border-white/20'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Rodapé */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveSelectConfig(null)}
                className="px-5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white cursor-pointer transition-colors"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
