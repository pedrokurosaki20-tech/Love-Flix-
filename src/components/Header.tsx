import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { useNavigation } from '../context/NavigationContext';
import type { PageRouteId } from '../types/tmdb';

export const Header: React.FC = () => {
  const { route, navigateToPage } = useNavigation();

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
    ],
    []
  );

  return (
    <header className="relative z-30 bg-[#080808]/95 backdrop-blur-md border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-3.5 pb-2.5">
        {/* Brand Title / Logo */}
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
