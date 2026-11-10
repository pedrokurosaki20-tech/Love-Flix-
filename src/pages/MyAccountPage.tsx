import React, { useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  Film,
  Heart,
  History,
  Info,
  Laptop,
  Layers,
  Lock,
  Play,
  PlayCircle,
  RotateCcw,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  Tv,
  User,
  Volume2,
  X,
} from 'lucide-react';
import { useUserData } from '../context/UserDataContext';
import { useNavigation } from '../context/NavigationContext';
import {
  MOVIE_GENRES,
  POPULAR_COLLECTION_IDS,
  STUDIO_AVATARS,
  type TMDBMediaItem,
} from '../types/tmdb';

export const MyAccountPage: React.FC = () => {
  const {
    profile,
    updateProfile,
    myList,
    favorites,
    continueWatching,
    history,
    watched,
    clearHistory,
    removeFromHistory,
    removeFromContinueWatching,
  } = useUserData();
  const { navigateToPage, openMediaDetail, openCollectionDetail, playTrailerForItem } =
    useNavigation();

  // Active sub-modals
  const [activeModal, setActiveModal] = useState<
    | null
    | 'edit-profile'
    | 'change-password'
    | 'devices'
    | 'avatars'
    | 'genres'
    | 'continue-watching'
    | 'history'
    | 'collections'
    | 'dns-protection'
  >(null);

  // Profile form state for edit modal
  const [editName, setEditName] = useState(profile.name);
  const [editEmail, setEditEmail] = useState(profile.email);

  // DNS Protection state
  const DNS_HOSTNAME = 'dns.adguard-dns.com';
  const [dnsCopied, setDnsCopied] = useState(false);
  const [selectedDnsTab, setSelectedDnsTab] = useState<'android' | 'ios' | 'browser'>('android');

  const handleCopyDns = async () => {
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
      setTimeout(() => setDnsCopied(false), 3500);

      // Attempt to open Android Private DNS settings if running in supported Android environment
      const userAgent = navigator.userAgent.toLowerCase();
      if (/android/i.test(userAgent)) {
        try {
          window.location.href = 'intent:#Intent;action=android.settings.NETWORK_OPERATOR_SETTINGS;end';
        } catch {
          // Graceful fallback to step-by-step instructions
        }
      }
    } catch {
      setDnsCopied(true);
      setTimeout(() => setDnsCopied(false), 3500);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (editName.trim()) {
      updateProfile({
        name: editName.trim(),
        email: (editEmail || '').trim() || profile.email,
      });
      setActiveModal(null);
    }
  };

  const toggleGenre = (genreId: number) => {
    const current = profile.favoriteGenreIds || [];
    const exists = current.includes(genreId);
    const next = exists ? current.filter((id) => id !== genreId) : [...current, genreId];
    updateProfile({ favoriteGenreIds: next });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-8">
      {/* Top Navigation & Title */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigateToPage('my-flix')}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#A1A1A1] hover:text-white transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Voltar para Minha Flix</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Minha Conta
            </h1>
            <p className="text-xs sm:text-sm text-[#A1A1A1] mt-1">
              Central de dados pessoais, preferências de exibição e proteção
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-xs font-semibold text-white/90 self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Perfil ativo</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          DESTAQUE: PROTEÇÃO DE NAVEGAÇÃO (Item 4 do pedido)
          ========================================================================= */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#181818] via-[#141414] to-[#111111] border border-white/[0.12] p-6 sm:p-7 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-white/[0.07] border border-white/15 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">
                  Proteção de Navegação
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                  Privacidade & DNS
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed max-w-2xl">
                Melhore sua experiência de navegação utilizando uma DNS privada que ajuda a bloquear anúncios, rastreadores e conteúdos indesejados. Navegue com mais tranquilidade e menos interrupções.
              </p>

              {/* Hostname Preview Pill */}
              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/60 border border-white/10 text-xs font-mono text-white/90">
                  <span className="text-[#A1A1A1] text-[11px]">Hostname DoT:</span>
                  <span className="font-bold text-white">{DNS_HOSTNAME}</span>
                </div>
                {dnsCopied && (
                  <span className="text-xs font-semibold text-emerald-400 inline-flex items-center gap-1 animate-fade-in">
                    <Check className="w-3.5 h-3.5" /> Endereço copiado!
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                handleCopyDns();
                setActiveModal('dns-protection');
              }}
              className="inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-white hover:bg-white/90 text-black text-xs sm:text-sm font-extrabold shadow-lg transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap"
            >
              <Shield className="w-4 h-4 fill-black text-black" />
              <span>Configurar proteção</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('dns-protection')}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs sm:text-sm font-semibold border border-white/10 transition-all cursor-pointer whitespace-nowrap"
            >
              <Info className="w-4 h-4 text-[#A1A1A1]" />
              <span>Instruções</span>
            </button>
          </div>
        </div>
      </section>

      {/* =========================================================================
          CATEGORIA A: INFORMAÇÕES DA CONTA
          ========================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <User className="w-4 h-4 text-[#A1A1A1]" />
            <span>Informações da conta</span>
          </h2>
          <span className="text-xs text-[#A1A1A1]">Perfil pessoal</span>
        </div>

        <div className="rounded-2xl bg-[#121212] border border-white/[0.08] p-5 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-5 border-b border-white/[0.07]">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-[#202020] border-2 border-white/15 shrink-0 flex items-center justify-center">
                  {profile.avatarSrc && profile.avatarSrc.trim() ? (
                    <img
                      src={profile.avatarSrc}
                      alt={profile.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-8 h-8 text-white/60" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal('avatars')}
                  title="Alterar avatar"
                  className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-lg bg-black/80 hover:bg-white/20 text-white border border-white/20 flex items-center justify-center cursor-pointer transition-colors shadow-md"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <h3 className="font-display text-base sm:text-lg font-bold text-white">
                  {profile.name}
                </h3>
                <p className="text-xs sm:text-sm text-[#A1A1A1] mt-0.5">
                  {profile.email}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[10px] font-semibold text-white/90">
                    Conta Pessoal
                  </span>
                  <span className="text-[10px] text-[#A1A1A1]">•</span>
                  <span className="text-[10px] text-white/80">Dispositivo autorizado</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditName(profile.name);
                  setEditEmail(profile.email);
                  setActiveModal('edit-profile');
                }}
                className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
              >
                Editar perfil
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('change-password')}
                className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
              >
                Alterar senha
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('devices')}
                className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
              >
                Gerenciar dispositivos
              </button>
            </div>
          </div>

          <p className="text-xs text-[#A1A1A1] leading-relaxed">
            As informações da sua conta ficam preservadas localmente no seu dispositivo. Estrutura pronta e compatível para sincronização futura de credenciais.
          </p>
        </div>
      </section>

      {/* =========================================================================
          CATEGORIA B: MINHA EXPERIÊNCIA
          ========================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Film className="w-4 h-4 text-[#A1A1A1]" />
            <span>Minha experiência</span>
          </h2>
          <span className="text-xs text-[#A1A1A1]">Atividades e biblioteca</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {/* 1. Minha lista */}
          <button
            type="button"
            onClick={() => navigateToPage('my-flix')}
            className="p-4 sm:p-5 rounded-2xl bg-[#121212] hover:bg-[#181818] border border-white/[0.08] hover:border-white/20 transition-all text-left flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white shrink-0">
                <Bookmark className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-white truncate">
                  Minha lista
                </h3>
                <p className="text-xs text-[#A1A1A1] truncate mt-0.5 tabular-nums">
                  {myList.length} títulos salvos
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#A1A1A1] group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>

          {/* 2. Continue assistindo */}
          <button
            type="button"
            onClick={() => setActiveModal('continue-watching')}
            className="p-4 sm:p-5 rounded-2xl bg-[#121212] hover:bg-[#181818] border border-white/[0.08] hover:border-white/20 transition-all text-left flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white shrink-0">
                <PlayCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-white truncate">
                  Continue assistindo
                </h3>
                <p className="text-xs text-[#A1A1A1] truncate mt-0.5 tabular-nums">
                  {continueWatching.length} em andamento
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#A1A1A1] group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>

          {/* 3. Histórico de reprodução */}
          <button
            type="button"
            onClick={() => setActiveModal('history')}
            className="p-4 sm:p-5 rounded-2xl bg-[#121212] hover:bg-[#181818] border border-white/[0.08] hover:border-white/20 transition-all text-left flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white shrink-0">
                <History className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-white truncate">
                  Histórico de reprodução
                </h3>
                <p className="text-xs text-[#A1A1A1] truncate mt-0.5 tabular-nums">
                  {history.length} títulos assistidos
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#A1A1A1] group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>

          {/* 4. Meus favoritos */}
          <button
            type="button"
            onClick={() => navigateToPage('my-flix')}
            className="p-4 sm:p-5 rounded-2xl bg-[#121212] hover:bg-[#181818] border border-white/[0.08] hover:border-white/20 transition-all text-left flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white shrink-0">
                <Heart className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-white truncate">
                  Meus favoritos
                </h3>
                <p className="text-xs text-[#A1A1A1] truncate mt-0.5 tabular-nums">
                  {favorites.length} marcados
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#A1A1A1] group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>

          {/* 5. Minhas avaliações */}
          <button
            type="button"
            onClick={() => setActiveModal('history')}
            className="p-4 sm:p-5 rounded-2xl bg-[#121212] hover:bg-[#181818] border border-white/[0.08] hover:border-white/20 transition-all text-left flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white shrink-0">
                <Star className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-white truncate">
                  Minhas avaliações
                </h3>
                <p className="text-xs text-[#A1A1A1] truncate mt-0.5 tabular-nums">
                  {watched.length} avaliados e concluídos
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#A1A1A1] group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>

          {/* 6. Minhas coleções */}
          <button
            type="button"
            onClick={() => setActiveModal('collections')}
            className="p-4 sm:p-5 rounded-2xl bg-[#121212] hover:bg-[#181818] border border-white/[0.08] hover:border-white/20 transition-all text-left flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-white truncate">
                  Minhas coleções
                </h3>
                <p className="text-xs text-[#A1A1A1] truncate mt-0.5">
                  Franquias e sagas do cinema
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#A1A1A1] group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        </div>
      </section>

      {/* =========================================================================
          CATEGORIA C: PREFERÊNCIAS
          ========================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#A1A1A1]" />
            <span>Preferências</span>
          </h2>
          <span className="text-xs text-[#A1A1A1]">Configurações da plataforma</span>
        </div>

        <div className="rounded-2xl bg-[#121212] border border-white/[0.08] divide-y divide-white/[0.06]">
          {/* Idioma do aplicativo */}
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white">Idioma do aplicativo</p>
              <p className="text-xs text-[#A1A1A1] mt-0.5">
                Altera o idioma principal dos menus e navegação
              </p>
            </div>
            <select
              value={profile.preferredLanguage || 'pt-BR'}
              onChange={(e) => updateProfile({ preferredLanguage: e.target.value })}
              className="px-3.5 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-white/30 cursor-pointer"
            >
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en-US">English (US)</option>
              <option value="es-ES">Español</option>
            </select>
          </div>

          {/* Idioma preferencial de áudio */}
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white">Idioma preferencial de áudio</p>
              <p className="text-xs text-[#A1A1A1] mt-0.5">
                Prioriza canais dublados em português ou áudio original
              </p>
            </div>
            <select
              value={profile.audioLanguage || 'pt'}
              onChange={(e) =>
                updateProfile({ audioLanguage: e.target.value as 'pt' | 'original' })
              }
              className="px-3.5 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-white/30 cursor-pointer"
            >
              <option value="pt">Dublado em Português</option>
              <option value="original">Áudio Original</option>
            </select>
          </div>

          {/* Preferência de legendas */}
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white">Preferência de legendas</p>
              <p className="text-xs text-[#A1A1A1] mt-0.5">
                Comportamento inicial de legendas no player
              </p>
            </div>
            <select
              value={profile.subtitlePreference || 'auto'}
              onChange={(e) =>
                updateProfile({
                  subtitlePreference: e.target.value as 'auto' | 'always' | 'off',
                })
              }
              className="px-3.5 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-white/30 cursor-pointer"
            >
              <option value="auto">Automático (em produções estrangeiras)</option>
              <option value="always">Sempre ativadas</option>
              <option value="off">Desativadas por padrão</option>
            </select>
          </div>

          {/* Reprodução automática */}
          <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-white">Reprodução automática</p>
              <p className="text-xs text-[#A1A1A1] mt-0.5">
                Girar destaques e iniciar automaticamente o próximo episódio
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile.autoplayHero}
              onClick={() => updateProfile({ autoplayHero: !profile.autoplayHero })}
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                profile.autoplayHero ? 'bg-white' : 'bg-[#252525]'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-black transition-transform absolute top-0.5 ${
                  profile.autoplayHero ? 'left-6.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Qualidade de reprodução */}
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white">Qualidade de reprodução</p>
              <p className="text-xs text-[#A1A1A1] mt-0.5">
                Ajuste da taxa de bits e resolução de streaming
              </p>
            </div>
            <select
              value={profile.playbackQuality || 'auto'}
              onChange={(e) =>
                updateProfile({
                  playbackQuality: e.target.value as 'auto' | '1080p' | '720p' | 'saver',
                })
              }
              className="px-3.5 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-white/30 cursor-pointer"
            >
              <option value="auto">Automática (Qualidade recomendada)</option>
              <option value="1080p">Alta Definição (1080p FHD)</option>
              <option value="720p">Padrão (720p HD)</option>
              <option value="saver">Economia de dados móveis</option>
            </select>
          </div>

          {/* Notificações */}
          <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-white">Notificações</p>
              <p className="text-xs text-[#A1A1A1] mt-0.5">
                Avisos sobre novos lançamentos, temporadas e títulos da sua lista
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile.notificationsEnabled ?? true}
              onClick={() =>
                updateProfile({
                  notificationsEnabled: !(profile.notificationsEnabled ?? true),
                })
              }
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
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

          {/* Aparência do aplicativo */}
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white">Aparência do aplicativo</p>
              <p className="text-xs text-[#A1A1A1] mt-0.5">
                Esquema de contraste e estilo visual do player e catálogo
              </p>
            </div>
            <select
              value={profile.themeAppearance || 'dark'}
              onChange={(e) =>
                updateProfile({
                  themeAppearance: e.target.value as 'dark' | 'contrast',
                })
              }
              className="px-3.5 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-white/30 cursor-pointer"
            >
              <option value="dark">Escuro Cinema (Padrão Love Flix)</option>
              <option value="contrast">Alto Contraste Oled</option>
            </select>
          </div>
        </div>
      </section>

      {/* =========================================================================
          CATEGORIA D: PERSONALIZAÇÃO
          ========================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#A1A1A1]" />
            <span>Personalização</span>
          </h2>
          <span className="text-xs text-[#A1A1A1]">Preferências do usuário</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
          {/* Alterar avatar */}
          <button
            type="button"
            onClick={() => setActiveModal('avatars')}
            className="p-5 rounded-2xl bg-[#121212] hover:bg-[#181818] border border-white/[0.08] hover:border-white/20 transition-all text-left flex items-start gap-4 group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#202020] border border-white/10 shrink-0 flex items-center justify-center">
              {profile.avatarSrc && profile.avatarSrc.trim() ? (
                <img
                  src={profile.avatarSrc}
                  alt={profile.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <User className="w-6 h-6 text-white/60" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-sm font-bold text-white">Alterar avatar</h3>
              <p className="text-xs text-[#A1A1A1] mt-0.5 line-clamp-2">
                Escolha entre avatares temáticos de estúdio para personalizar seu perfil.
              </p>
              <span className="inline-block mt-2 text-[11px] font-semibold text-white/90 group-hover:underline">
                Trocar imagem →
              </span>
            </div>
          </button>

          {/* Escolher gêneros favoritos */}
          <button
            type="button"
            onClick={() => setActiveModal('genres')}
            className="p-5 rounded-2xl bg-[#121212] hover:bg-[#181818] border border-white/[0.08] hover:border-white/20 transition-all text-left flex items-start gap-4 group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white shrink-0">
              <Film className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-sm font-bold text-white">Gêneros favoritos</h3>
              <p className="text-xs text-[#A1A1A1] mt-0.5 line-clamp-2">
                Selecione seus estilos favoritos para refinar o catálogo e recomendações.
              </p>
              <span className="inline-block mt-2 text-[11px] font-semibold text-white/90 group-hover:underline">
                {(profile.favoriteGenreIds || []).length} selecionados →
              </span>
            </div>
          </button>

          {/* Personalizar recomendações */}
          <div className="p-5 rounded-2xl bg-[#121212] border border-white/[0.08] space-y-3">
            <h3 className="font-display text-sm font-bold text-white">
              Personalizar recomendações
            </h3>
            <p className="text-xs text-[#A1A1A1] leading-relaxed">
              Defina o critério principal para ordenar os carrosséis da tela inicial:
            </p>
            <select
              value={profile.recommendationStyle || 'history'}
              onChange={(e) =>
                updateProfile({
                  recommendationStyle: e.target.value as 'history' | 'trending' | 'new',
                })
              }
              className="w-full px-3 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-white/30 cursor-pointer"
            >
              <option value="history">Baseado no que você assistiu e favoritou</option>
              <option value="trending">Títulos mais populares e comentados da semana</option>
              <option value="new">Últimos lançamentos de cinema e streaming</option>
            </select>
          </div>

          {/* Configurar preferências de conteúdo */}
          <div className="p-5 rounded-2xl bg-[#121212] border border-white/[0.08] space-y-3">
            <h3 className="font-display text-sm font-bold text-white">
              Preferências de conteúdo
            </h3>
            <p className="text-xs text-[#A1A1A1] leading-relaxed">
              Filtro de classificação indicativa para exibição no catálogo:
            </p>
            <select
              value={profile.contentRatingFilter || 'all'}
              onChange={(e) =>
                updateProfile({
                  contentRatingFilter: e.target.value as 'all' | '16' | 'family',
                })
              }
              className="w-full px-3 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-white/30 cursor-pointer"
            >
              <option value="all">Todas as classificações (Livre a 18+)</option>
              <option value="16">Até 16 anos (Ocultar conteúdo exclusivamente adulto)</option>
              <option value="family">Família (Apenas Livre, 10 e 12 anos)</option>
            </select>
          </div>
        </div>
      </section>

      {/* =========================================================================
          MODAIS E PAINÉIS DE APOIO (Organizados e leves)
          ========================================================================= */}

      {/* 1. Modal Proteção de Navegação (DoT setup) */}
      {activeModal === 'dns-protection' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#141414] border border-white/15 p-6 sm:p-7 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-display text-lg font-bold text-white">
                  Proteção de Navegação
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
                Melhore sua experiência de navegação utilizando uma DNS privada que ajuda a bloquear anúncios, rastreadores e conteúdos indesejados. Navegue com mais tranquilidade e menos interrupções.
              </p>

              {/* Hostname Copier Card */}
              <div className="p-4 rounded-xl bg-black/60 border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs text-[#A1A1A1]">
                  <span>Endereço de DNS Privado (DoT):</span>
                  {dnsCopied && (
                    <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Copiado!
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm sm:text-base font-bold text-white select-all">
                    {DNS_HOSTNAME}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyDns}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar</span>
                  </button>
                </div>
              </div>

              {/* OS Tabs */}
              <div className="pt-2">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#1b1b1b] border border-white/10 mb-4">
                  <button
                    type="button"
                    onClick={() => setSelectedDnsTab('android')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      selectedDnsTab === 'android'
                        ? 'bg-white text-black shadow'
                        : 'text-[#A1A1A1] hover:text-white'
                    }`}
                  >
                    Android
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDnsTab('ios')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      selectedDnsTab === 'ios'
                        ? 'bg-white text-black shadow'
                        : 'text-[#A1A1A1] hover:text-white'
                    }`}
                  >
                    iOS (iPhone/iPad)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDnsTab('browser')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      selectedDnsTab === 'browser'
                        ? 'bg-white text-black shadow'
                        : 'text-[#A1A1A1] hover:text-white'
                    }`}
                  >
                    Navegador Web
                  </button>
                </div>

                {selectedDnsTab === 'android' && (
                  <ol className="space-y-2 text-xs sm:text-sm text-[#A1A1A1] leading-relaxed list-decimal list-inside bg-[#101010] p-4 rounded-xl border border-white/[0.06]">
                    <li>
                      Abra as <strong className="text-white">Configurações</strong> do seu celular Android.
                    </li>
                    <li>
                      Toque em <strong className="text-white">Rede e Internet</strong> (ou <strong className="text-white">Conexões</strong>).
                    </li>
                    <li>
                      Role até encontrar a opção <strong className="text-white">DNS Privado</strong>.
                    </li>
                    <li>
                      Selecione <strong className="text-white">Nome do host do provedor de DNS privado</strong>.
                    </li>
                    <li>
                      Cole o endereço copiado: <code className="text-white font-mono bg-white/10 px-1 py-0.5 rounded">{DNS_HOSTNAME}</code> e toque em <strong className="text-white">Salvar</strong>.
                    </li>
                  </ol>
                )}

                {selectedDnsTab === 'ios' && (
                  <ol className="space-y-2 text-xs sm:text-sm text-[#A1A1A1] leading-relaxed list-decimal list-inside bg-[#101010] p-4 rounded-xl border border-white/[0.06]">
                    <li>
                      Acesse <strong className="text-white">Ajustes</strong> no seu iPhone ou iPad e toque em <strong className="text-white">Wi-Fi</strong>.
                    </li>
                    <li>
                      Toque no ícone azul <strong className="text-white">(i)</strong> ao lado da sua rede conectada.
                    </li>
                    <li>
                      Role para baixo e selecione <strong className="text-white">Configurar DNS</strong> &gt; <strong className="text-white">Manual</strong>.
                    </li>
                    <li>
                      Em aparelhos com iOS 14 ou superior, você também pode instalar perfis DoT oficiais ou configurar um perfil de DNS seguro nas configurações de gerenciamento de VPN e Rede.
                    </li>
                  </ol>
                )}

                {selectedDnsTab === 'browser' && (
                  <ol className="space-y-2 text-xs sm:text-sm text-[#A1A1A1] leading-relaxed list-decimal list-inside bg-[#101010] p-4 rounded-xl border border-white/[0.06]">
                    <li>
                      Abra as <strong className="text-white">Configurações</strong> do navegador (Chrome, Brave, Edge).
                    </li>
                    <li>
                      Acesse a aba <strong className="text-white">Privacidade e Segurança</strong> &gt; <strong className="text-white">Segurança</strong>.
                    </li>
                    <li>
                      Ative a opção <strong className="text-white">Usar DNS seguro</strong>.
                    </li>
                    <li>
                      Escolha <strong className="text-white">Personalizado</strong> e insira o endereço HTTPS seguro: <code className="text-white font-mono bg-white/10 px-1 py-0.5 rounded">https://dns.adguard-dns.com/dns-query</code>.
                    </li>
                  </ol>
                )}
              </div>

              {/* Informações Técnicas e Transparência */}
              <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-[11px] text-[#A1A1A1] leading-relaxed space-y-1">
                <p className="font-semibold text-white/90">Aviso sobre o funcionamento da proteção:</p>
                <p>
                  • A DNS privada opera via protocolo DoT (DNS-over-TLS). Este endereço é um hostname de servidor seguro, e não um endereço IP tradicional.
                </p>
                <p>
                  • O bloqueio de elementos depende da configuração correta diretamente no sistema do seu dispositivo. A Love Flix não bloqueia conteúdos internamente por código, mas fornece a ferramenta recomendada para sua segurança de rede.
                </p>
                <p>
                  • O uso de DNS privada reduz expressivamente rastreadores e redirecionamentos, mas pode não filtrar 100% de todos os anúncios existentes na web.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-white/90 text-black text-xs font-bold cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal Editar Perfil */}
      {activeModal === 'edit-profile' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-display text-base font-bold text-white">Editar Perfil</h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#A1A1A1] mb-1.5">
                  Nome de usuário
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white focus:outline-none focus:border-white/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#A1A1A1] mb-1.5">
                  E-mail cadastrado
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white focus:outline-none focus:border-white/40"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-white hover:bg-white/90 text-black text-xs font-bold cursor-pointer"
                >
                  Salvar alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal Alterar Senha */}
      {activeModal === 'change-password' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-4 text-center sm:text-left">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-white" />
                <h3 className="font-display text-base font-bold text-white">Alterar Senha</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[#A1A1A1] leading-relaxed">
              O módulo de gerenciamento de credenciais na nuvem e autenticação centralizada de usuários será integrado com o banco de dados oficial nas próximas etapas da Love Flix.
            </p>
            <p className="text-xs text-white/80">
              Sua sessão atual permanece salva com total segurança no ambiente local.
            </p>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-5 py-2 rounded-xl bg-white hover:bg-white/90 text-black text-xs font-bold cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal Gerenciar Dispositivos */}
      {activeModal === 'devices' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Laptop className="w-4 h-4 text-white" />
                <h3 className="font-display text-base font-bold text-white">
                  Dispositivos Conectados
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-black/60 border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center text-white">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Este dispositivo</p>
                    <p className="text-[11px] text-[#A1A1A1]">Navegador Web • Ativo agora</p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                  Atual
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-5 py-2 rounded-xl bg-white hover:bg-white/90 text-black text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal Selecionar Avatar */}
      {activeModal === 'avatars' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-display text-base font-bold text-white">
                Escolha seu Avatar
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {STUDIO_AVATARS.map((av) => {
                const isSelected = profile.avatarSrc === av.src;
                return (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => {
                      updateProfile({ avatarSrc: av.src });
                      setActiveModal(null);
                    }}
                    className={`group relative rounded-2xl overflow-hidden border-2 p-1 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-white bg-white/10 shadow-lg scale-102'
                        : 'border-white/10 hover:border-white/30 bg-black/40'
                    }`}
                  >
                    <div className="aspect-square rounded-xl overflow-hidden bg-[#202020]">
                      <img
                        src={av.src}
                        alt={av.label}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <p className="text-[11px] font-semibold text-white text-center mt-2 truncate">
                      {av.label}
                    </p>
                    {isSelected && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white text-black flex items-center justify-center text-xs">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal Escolher Gêneros */}
      {activeModal === 'genres' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="font-display text-base font-bold text-white">
                  Gêneros Favoritos
                </h3>
                <p className="text-xs text-[#A1A1A1] mt-0.5">
                  Toque para adicionar ou remover estilos
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto pr-1">
              {MOVIE_GENRES.map((g) => {
                const active = (profile.favoriteGenreIds || []).includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGenre(g.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-white text-black font-bold shadow'
                        : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/80 border border-white/10'
                    }`}
                  >
                    {active ? `✓ ${g.name}` : g.name}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-5 py-2 rounded-xl bg-white hover:bg-white/90 text-black text-xs font-bold cursor-pointer"
              >
                Salvar preferências
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal Continue Assistindo */}
      {activeModal === 'continue-watching' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-white" />
                <h3 className="font-display text-base font-bold text-white">
                  Continue Assistindo ({continueWatching.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {continueWatching.length === 0 ? (
              <p className="text-xs sm:text-sm text-[#A1A1A1] py-8 text-center">
                Nenhum título em andamento no momento.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {continueWatching.map((item) => (
                  <div
                    key={`${item.media_type}-${item.id}`}
                    className="p-3 rounded-xl bg-black/50 border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                      onClick={() => {
                        setActiveModal(null);
                        openMediaDetail(item);
                      }}
                    >
                      <div className="w-12 h-16 rounded-lg overflow-hidden bg-[#202020] shrink-0">
                        {item.poster_path && (
                          <img
                            src={`https://image.tmdb.org/t/p/w185${item.poster_path}`}
                            alt={item.title || item.name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {item.title || item.name}
                        </p>
                        <p className="text-xs text-[#A1A1A1]">
                          {item.media_type === 'tv' ? 'Série' : 'Filme'}
                          {item.trackedSeason && ` • T${item.trackedSeason}:E${item.trackedEpisode}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModal(null);
                          playTrailerForItem(item);
                        }}
                        className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center cursor-pointer hover:bg-white/90"
                        title="Assistir agora"
                      >
                        <Play className="w-3.5 h-3.5 fill-black" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromContinueWatching(item.id, item.media_type)}
                        className="w-8 h-8 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-[#A1A1A1] hover:text-white flex items-center justify-center cursor-pointer"
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 8. Modal Histórico */}
      {activeModal === 'history' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-white" />
                <h3 className="font-display text-base font-bold text-white">
                  Histórico de Reprodução ({history.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="text-xs text-[#A1A1A1] hover:text-white cursor-pointer px-2 py-1 rounded hover:bg-white/10"
                  >
                    Limpar histórico
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {history.length === 0 ? (
              <p className="text-xs sm:text-sm text-[#A1A1A1] py-8 text-center">
                Seu histórico de reprodução está limpo.
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {history.map((item) => (
                  <div
                    key={`${item.media_type}-${item.id}-${item.visitedAt}`}
                    className="p-3 rounded-xl bg-black/50 border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                      onClick={() => {
                        setActiveModal(null);
                        openMediaDetail(item);
                      }}
                    >
                      <div className="w-10 h-14 rounded-lg overflow-hidden bg-[#202020] shrink-0">
                        {item.poster_path && (
                          <img
                            src={`https://image.tmdb.org/t/p/w185${item.poster_path}`}
                            alt={item.title || item.name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {item.title || item.name}
                        </p>
                        <p className="text-[11px] text-[#A1A1A1]">
                          Visitado em {new Date(item.visitedAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFromHistory(item.id, item.media_type)}
                      className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[#A1A1A1] hover:text-white flex items-center justify-center cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. Modal Coleções Populares */}
      {activeModal === 'collections' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-white" />
                <h3 className="font-display text-base font-bold text-white">
                  Franquias e Coleções
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              {POPULAR_COLLECTION_IDS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    openCollectionDetail(c.id);
                  }}
                  className="p-3.5 rounded-xl bg-black/60 hover:bg-white/10 border border-white/10 text-left transition-colors cursor-pointer group flex items-center justify-between"
                >
                  <span className="text-xs font-bold text-white group-hover:underline">
                    {c.fallbackName}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#A1A1A1] group-hover:text-white" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
