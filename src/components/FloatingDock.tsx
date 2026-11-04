import React from 'react';
import { motion } from 'motion/react';
import { Home, Search } from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';
import type { PageRouteId } from '../types/tmdb';

// Custom minimal emblem icon exclusively designed for Minha Flix
const MinhaFlixIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="3.5" y="4" width="17" height="16" rx="4.5" />
    <path d="M9.75 9.25L15.25 12L9.75 14.75V9.25Z" />
  </svg>
);

export const FloatingDock: React.FC = () => {
  const { route, navigateToPage } = useNavigation();

  const dockItems: Array<{
    id: PageRouteId;
    label: string;
    isActive: boolean;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'home',
      label: 'Início',
      isActive: route.page === 'home',
      icon: Home,
    },
    {
      id: 'search',
      label: 'Pesquisa',
      isActive: route.page === 'search',
      icon: Search,
    },
    {
      id: 'my-flix',
      label: 'Minha Flix',
      isActive: route.page === 'my-flix' || route.page === 'my-account',
      icon: MinhaFlixIcon,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none flex justify-center px-3 sm:px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
      <nav
        aria-label="Navegação principal"
        className="pointer-events-auto inline-flex items-center gap-1 sm:gap-1.5 p-1.5 rounded-full bg-[#111111]/92 backdrop-blur-xl border border-white/[0.11] shadow-[0_14px_38px_rgba(0,0,0,0.85)]"
      >
        {dockItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateToPage(item.id)}
              className={`relative flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 min-w-[74px] sm:min-w-[108px] h-12 sm:h-11 px-3 sm:px-4 rounded-full transition-colors duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] ${
                item.isActive ? 'text-white' : 'text-[#A1A1A1] hover:text-white'
              }`}
            >
              {item.isActive && (
                <motion.span
                  layoutId="floating-dock-active-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-[#E50914]/18 border border-[#E50914]/45"
                />
              )}

              <Icon
                className={`relative z-10 w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  item.isActive ? 'text-[#FF253A]' : 'text-current'
                }`}
              />
              <span className="relative z-10 text-[11px] font-bold tracking-tight whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
