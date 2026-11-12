import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { LogIn, User } from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';
import { useUserData } from '../context/UserDataContext';
import type { PageRouteId } from '../types/tmdb';

export const Header: React.FC = () => {
  const { route, navigateToPage } = useNavigation();
  const { isLoggedIn, profile, openAuthModal } = useUserData();

  const categories: Array<{
    id: PageRouteId;
    label: string;
  }> = useMemo(
    () => [
      { id: 'movies', label: 'Filmes' },
      { id: 'series', label: 'Séries' },
      { id: 'animes', label: 'Animes' },
      { id: 'doramas', label: 'Doramas' },
      { id: 'documentaries', label: 'Documentários' },
      { id: 'sessao-flix', label: 'Sessão Flix' },
    ],
    []
  );

  return (
    <header className="relative z-30 bg-[#080808]/95 backdrop-blur-md border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-3.5 pb-2.5">
        {/* Brand Title / Logo & Account Status */}
        <div className="flex items-center justify-between mb-2.5">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigateToPage('home');
            }}
            className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] rounded"
          >
            <span className="text-[#E50914]">LOVE</span> FLIX
          </a>

          {isLoggedIn ? (
            <button
              type="button"
              onClick={() => navigateToPage('my-flix')}
              className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-colors cursor-pointer group"
            >
              {profile.avatarSrc && profile.avatarSrc.trim() ? (
                <img
                  src={profile.avatarSrc}
                  alt={profile.name}
                  className="w-5 h-5 rounded-full object-cover border border-white/20"
                />
              ) : (
                <User className="w-3.5 h-3.5 text-white/80" />
              )}
              <span className="text-xs font-semibold text-white/90 group-hover:text-white max-w-[90px] truncate">
                {profile.name || 'Minha Flix'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E50914] hover:bg-[#d00812] text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Entrar</span>
            </button>
          )}
        </div>

        {/* Horizontal Scrollable Category Carousel — Balanced Spacing */}
        <nav
          aria-label="Categorias de conteúdo"
          className="flex items-center gap-2 sm:gap-3 md:gap-4 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x py-0.5"
        >
          {categories.map((cat) => {
            const isActive = route.page === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => navigateToPage(cat.id)}
                className={`relative inline-flex items-center justify-center px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] ${
                  isActive
                    ? 'text-white bg-white/[0.07]'
                    : 'text-[#A1A1A1] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span className="whitespace-nowrap">{cat.label}</span>

                {isActive && (
                  <motion.span
                    layoutId="top-category-active-bar"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    aria-hidden="true"
                    className="absolute bottom-0.5 left-4 right-4 h-[2px] rounded-full bg-[#E50914]"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
