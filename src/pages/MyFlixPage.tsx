import React from 'react';
import { ChevronRight, User } from 'lucide-react';
import { MediaCarousel } from '../components/MediaCarousel';
import { useUserData } from '../context/UserDataContext';
import { useNavigation } from '../context/NavigationContext';

export const MyFlixPage: React.FC = () => {
  const { myList, favorites, toggleMyList, toggleFavorite } = useUserData();
  const { navigateToPage } = useNavigation();

  return (
    <div className="py-7 sm:py-9 space-y-6 min-h-[78vh]">
      <div className="px-4 sm:px-6 lg:px-10">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Minha Flix
        </h1>
      </div>

      {/* Primeira Seção: Minha Lista (Independente) */}
      <MediaCarousel
        title="Minha Lista"
        items={myList}
        onRemoveItem={(item) => toggleMyList(item)}
        removeTooltip="Remover da Minha Lista"
        emptyStateText="Você ainda não salvou conteúdos na Minha Lista. Toque no botão + nos cards ou nas páginas de detalhes para guardar filmes, séries, animes, doramas e documentários."
      />

      {/* Segunda Seção: Favoritos (Independente, logo abaixo de Minha Lista) */}
      <MediaCarousel
        title="Favoritos"
        items={favorites}
        onRemoveItem={(item) => toggleFavorite(item)}
        removeTooltip="Remover dos Favoritos"
        emptyStateText="Você ainda não marcou conteúdos como favoritos. Toque no ícone de coração nos cards ou detalhes para reunir seus preferidos aqui."
      />

      {/* Terceira Seção: Minha Conta (Logo abaixo de Favoritos) */}
      <section className="px-4 sm:px-6 lg:px-10 pt-2">
        <button
          type="button"
          onClick={() => navigateToPage('my-account')}
          className="w-full flex items-center justify-between gap-4 p-5 rounded-2xl bg-[#121212] hover:bg-[#181818] border border-white/[0.08] hover:border-[#E50914]/50 transition-all duration-150 text-left cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914]"
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#E50914]/15 border border-[#E50914]/30 flex items-center justify-center text-[#FF253A] shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold text-white group-hover:text-[#FF253A] transition-colors truncate">
                Minha Conta
              </h2>
              <p className="text-xs sm:text-sm text-[#A1A1A1] truncate mt-0.5">
                Informações pessoais da conta
              </p>
            </div>
          </div>

          <ChevronRight className="w-5 h-5 text-[#A1A1A1] group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>
      </section>
    </div>
  );
};
