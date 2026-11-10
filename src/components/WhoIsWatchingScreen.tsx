import React, { useState, useRef } from 'react';
import {
  Plus,
  Edit3,
  X,
  Trash2,
  Check,
  LogOut,
  Camera,
  AlertTriangle,
  User,
  Users,
} from 'lucide-react';
import { useUserData } from '../context/UserDataContext';
import { useNavigation } from '../context/NavigationContext';
import { LOVEFLIX_PRESET_AVATARS, type AvatarOption } from '../utils/avatars';
import type { UserProfileConfig } from '../context/UserDataContext';

export const WhoIsWatchingScreen: React.FC = () => {
  const {
    accountProfiles,
    selectProfile,
    createAccountProfile,
    updateAccountProfile,
    deleteAccountProfile,
    logout,
    currentAccount,
  } = useUserData();

  const { navigateToPage } = useNavigation();

  const [isManaging, setIsManaging] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingProfile, setEditingProfile] = useState<UserProfileConfig | null>(null);
  const [profileNameInput, setProfileNameInput] = useState<string>('');
  const [selectedAvatarSrc, setSelectedAvatarSrc] = useState<string>(LOVEFLIX_PRESET_AVATARS[0].src);
  const [modalError, setModalError] = useState<string>('');

  // Confirmação de exclusão
  const [profileToDelete, setProfileToDelete] = useState<UserProfileConfig | null>(null);

  // Upload de imagem da galeria
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenCreate = () => {
    if (accountProfiles.length >= 4) return;
    setModalError('');
    setProfileNameInput('');
    // Escolhe avatar padrão sugerido de acordo com a quantidade atual
    const nextAvatar = LOVEFLIX_PRESET_AVATARS[accountProfiles.length % LOVEFLIX_PRESET_AVATARS.length].src;
    setSelectedAvatarSrc(nextAvatar);
    setEditingProfile(null);
    setModalMode('create');
  };

  const handleOpenEdit = (profile: UserProfileConfig) => {
    setModalError('');
    setEditingProfile(profile);
    setProfileNameInput(profile.name);
    setSelectedAvatarSrc(profile.avatarSrc || LOVEFLIX_PRESET_AVATARS[0].src);
    setModalMode('edit');
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    const cleanName = profileNameInput.trim();
    if (!cleanName) {
      setModalError('Digite um nome para o perfil.');
      return;
    }

    if (modalMode === 'create') {
      const res = createAccountProfile(cleanName, selectedAvatarSrc);
      if (!res.success) {
        setModalError(res.message || 'Erro ao criar perfil.');
        return;
      }
      setModalMode(null);
    } else if (modalMode === 'edit' && editingProfile) {
      const res = updateAccountProfile(editingProfile.id, {
        name: cleanName,
        avatarSrc: selectedAvatarSrc,
      });
      if (!res.success) {
        setModalError(res.message || 'Erro ao atualizar perfil.');
        return;
      }
      setModalMode(null);
      setEditingProfile(null);
    }
  };

  const handleConfirmDelete = () => {
    if (!profileToDelete) return;
    const res = deleteAccountProfile(profileToDelete.id);
    if (!res.success) {
      setModalError(res.message || 'Não foi possível excluir o perfil.');
      return;
    }
    setProfileToDelete(null);
    setModalMode(null);
    setEditingProfile(null);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setModalError('Selecione um arquivo de imagem válido.');
      return;
    }

    // Leitura em base64 da foto da galeria
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedAvatarSrc(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleProfileClick = (profile: UserProfileConfig) => {
    if (isManaging) {
      handleOpenEdit(profile);
    } else {
      selectProfile(profile.id);
      navigateToPage('home');
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col justify-between items-center px-4 py-8 relative overflow-hidden select-none">
      {/* Glow de iluminação cinematográfica Love Flix */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[380px] bg-[#E50914]/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Topo: Logo Love Flix */}
      <header className="relative z-10 text-center pt-2 sm:pt-4">
        <div className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          <span className="text-[#E50914]">LOVE</span> FLIX
        </div>
        {currentAccount && (
          <p className="text-[11px] text-[#777777] mt-1 font-medium">
            Conta: <span className="text-white/80">{currentAccount.name}</span> ({currentAccount.email})
          </p>
        )}
      </header>

      {/* Centro: Tela Quem está assistindo? */}
      <main className="relative z-10 w-full max-w-3xl mx-auto my-auto flex flex-col items-center text-center py-6">
        {/* Título e Subtítulo */}
        <div className="mb-8 sm:mb-12 space-y-2">
          <h1 className="font-display text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white animate-fade-in">
            {isManaging ? 'Gerenciar perfis' : 'Quem está assistindo?'}
          </h1>
          <p className="text-xs sm:text-sm text-[#A1A1A1] max-w-md mx-auto">
            {isManaging
              ? 'Selecione um perfil para alterar o nome, o avatar ou excluí-lo.'
              : 'Cada perfil tem suas próprias listas, favoritos, recomendações e histórico.'}
          </p>
        </div>

        {/* Grade de Perfis (2 colunas em mobile, 3 ou 4 em telas maiores) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6 md:gap-8 justify-items-center items-start w-full max-w-2xl px-2">
          {accountProfiles.map((p) => {
            return (
              <div
                key={p.id}
                className="flex flex-col items-center group cursor-pointer w-full max-w-[130px] sm:max-w-[150px]"
              >
                <button
                  type="button"
                  onClick={() => handleProfileClick(p)}
                  className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden bg-[#181818] border-2 border-transparent group-hover:border-white transition-all duration-200 group-hover:scale-105 shadow-2xl focus:outline-none focus:ring-2 focus:ring-[#E50914] cursor-pointer"
                  aria-label={`Selecionar perfil ${p.name}`}
                >
                  <img
                    src={p.avatarSrc && p.avatarSrc.trim() ? p.avatarSrc : LOVEFLIX_PRESET_AVATARS[0].src}
                    alt={p.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback seguro caso imagem falhe
                      e.currentTarget.src = LOVEFLIX_PRESET_AVATARS[0].src;
                    }}
                  />

                  {/* Overlay do Modo Gerenciamento com ícone de lápis */}
                  {isManaging && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center transition-all group-hover:bg-black/45">
                      <div className="w-10 h-10 rounded-full bg-black/80 border border-white/50 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <Edit3 className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  )}
                </button>

                {/* Nome do Perfil */}
                <span className="mt-3 text-xs sm:text-sm font-medium text-white/80 group-hover:text-white transition-colors truncate w-full text-center">
                  {p.name}
                </span>
              </div>
            );
          })}

          {/* Opção de Adicionar Novo Perfil (quando houver menos de 4) */}
          {accountProfiles.length < 4 && (
            <div className="flex flex-col items-center group cursor-pointer w-full max-w-[130px] sm:max-w-[150px]">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl border-2 border-dashed border-white/20 hover:border-white/60 bg-white/[0.03] hover:bg-white/[0.08] transition-all duration-200 group-hover:scale-105 flex flex-col items-center justify-center gap-1 text-[#888888] group-hover:text-white focus:outline-none focus:ring-2 focus:ring-[#E50914] cursor-pointer"
                aria-label="Adicionar novo perfil"
              >
                <div className="w-10 h-10 rounded-full bg-white/[0.06] group-hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                  <Plus className="w-6 h-6 text-white/80 group-hover:text-white" />
                </div>
              </button>
              <span className="mt-3 text-xs sm:text-sm font-medium text-[#888888] group-hover:text-white transition-colors truncate w-full text-center">
                Adicionar perfil
              </span>
            </div>
          )}
        </div>

        {/* Informação sobre limite de perfis */}
        <div className="mt-6 text-[11px] text-[#666666] flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-[#888888]" />
          <span>
            {accountProfiles.length} de 4 perfis utilizados nesta conta
          </span>
        </div>

        {/* Botão de Alternar Modo: Gerenciar Perfis / Concluir */}
        <div className="mt-8 sm:mt-10 flex flex-col items-center gap-4">
          {isManaging ? (
            <button
              type="button"
              onClick={() => setIsManaging(false)}
              className="px-8 py-2.5 rounded-xl bg-white hover:bg-white/90 text-black text-xs sm:text-sm font-bold uppercase tracking-wider transition-all shadow-lg active:scale-95 cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Concluir</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsManaging(true)}
              className="px-6 py-2 rounded-xl border border-white/25 hover:border-white text-white/80 hover:text-white text-xs sm:text-sm font-semibold tracking-wider uppercase transition-all bg-transparent hover:bg-white/[0.04] active:scale-95 cursor-pointer"
            >
              Gerenciar perfis
            </button>
          )}

          {/* Opção discreta de sair da conta principal */}
          <button
            type="button"
            onClick={logout}
            className="text-xs text-[#777777] hover:text-[#FF253A] flex items-center gap-1.5 transition-colors cursor-pointer pt-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair da conta ({currentAccount?.email})</span>
          </button>
        </div>
      </main>

      {/* Rodapé discreto */}
      <footer className="relative z-10 text-center py-2 text-[11px] text-white/30 tracking-wider">
        <span className="text-[#E50914]/50 font-bold">LOVE</span> FLIX • Experiência Multiperfil
      </footer>

      {/* =========================================================================
          MODAL: CRIAR OU EDITAR PERFIL
          ========================================================================= */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-[#141414] border border-white/15 p-6 sm:p-7 shadow-2xl space-y-6 animate-scale-up max-h-[90vh] overflow-y-auto no-scrollbar">
            {/* Fechar modal */}
            <button
              type="button"
              onClick={() => {
                setModalMode(null);
                setEditingProfile(null);
              }}
              className="absolute right-4 top-4 text-[#777777] hover:text-white transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Cabeçalho */}
            <div className="text-center space-y-1">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
                {modalMode === 'create' ? 'Adicionar Perfil' : 'Editar Perfil'}
              </h2>
              <p className="text-xs text-[#A1A1A1]">
                {modalMode === 'create'
                  ? 'Crie um perfil para outra pessoa da sua casa com histórico e listas próprias.'
                  : 'Atualize o nome e o avatar exclusivo deste perfil.'}
              </p>
            </div>

            {/* Mensagem de Erro */}
            {modalError && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-[#FF4757] text-xs font-medium text-center animate-fade-in">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveModal} className="space-y-6">
              {/* Preview e Seleção de Avatar */}
              <div className="flex flex-col items-center space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageFileChange}
                />

                <div className="relative group">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-[#222222] border-2 border-[#E50914] shadow-xl flex items-center justify-center">
                    <img
                      src={selectedAvatarSrc && selectedAvatarSrc.trim() ? selectedAvatarSrc : LOVEFLIX_PRESET_AVATARS[0].src}
                      alt="Avatar selecionado"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white text-black hover:bg-white/90 shadow-lg flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
                    title="Escolher foto da galeria do aparelho"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[11px] text-[#888888]">
                  Escolha um avatar temático abaixo ou toque na câmera para enviar da galeria:
                </p>

                {/* Grid de opções de avatares temáticos */}
                <div className="grid grid-cols-4 gap-2.5 pt-1 w-full max-w-xs">
                  {LOVEFLIX_PRESET_AVATARS.map((av) => {
                    const isSelected = selectedAvatarSrc === av.src;
                    return (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => setSelectedAvatarSrc(av.src)}
                        className={`relative w-14 h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#E50914] scale-105 ring-2 ring-[#E50914]/40 shadow-lg'
                            : 'border-white/10 hover:border-white/40 opacity-70 hover:opacity-100'
                        }`}
                        title={av.name}
                      >
                        <img
                          src={av.src && av.src.trim() ? av.src : LOVEFLIX_PRESET_AVATARS[0].src}
                          alt={av.name}
                          className="w-full h-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-[#E50914]/20 flex items-center justify-center">
                            <Check className="w-4 h-4 text-white drop-shadow" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Campo: Nome do Perfil */}
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-medium text-white/90">
                  Nome do perfil
                </label>
                <div className="relative flex items-center">
                  <User className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                  <input
                    type="text"
                    required
                    maxLength={25}
                    value={profileNameInput}
                    onChange={(e) => setProfileNameInput(e.target.value)}
                    placeholder="Ex: Mateus, Família, Cinema..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] transition-all"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[#666666] px-1">
                  <span>Limite de 4 perfis por conta</span>
                  <span>{profileNameInput.length}/25</span>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="pt-2 flex flex-col gap-2.5">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-[#E50914] hover:bg-[#d00812] text-white text-xs sm:text-sm font-bold transition-all shadow-lg shadow-[#E50914]/25 cursor-pointer active:scale-[0.98]"
                >
                  {modalMode === 'create' ? 'Salvar Perfil' : 'Salvar Alterações'}
                </button>

                {/* Opção de Excluir Perfil (Apenas no modo de edição) */}
                {modalMode === 'edit' && editingProfile && (
                  <button
                    type="button"
                    onClick={() => setProfileToDelete(editingProfile)}
                    disabled={accountProfiles.length <= 1}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                      accountProfiles.length <= 1
                        ? 'opacity-40 cursor-not-allowed bg-white/[0.04] text-[#777777]'
                        : 'border border-red-500/40 text-red-400 hover:bg-red-500/10'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {accountProfiles.length <= 1
                        ? 'Não é possível excluir o único perfil'
                        : 'Excluir este perfil'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setModalMode(null);
                    setEditingProfile(null);
                  }}
                  className="w-full py-2 px-3 text-xs text-[#888888] hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONFIRMAÇÃO DE EXCLUSÃO DE PERFIL
          ========================================================================= */}
      {profileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-4 text-center animate-scale-up">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-[#FF253A] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-display text-base font-bold text-white">
                Excluir perfil "{profileToDelete.name}"?
              </h3>
              <p className="text-xs text-[#A1A1A1] mt-1.5 leading-relaxed">
                Todo o histórico de filmes assistidos, favoritos e itens de "Minha Lista" deste perfil serão apagados permanentemente. Esta ação não pode ser desfeita.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setProfileToDelete(null)}
                className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl bg-[#E50914] hover:bg-[#d00812] text-white text-xs font-bold cursor-pointer transition-all shadow-lg shadow-[#E50914]/25"
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
