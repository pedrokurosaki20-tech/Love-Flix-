import React from 'react';
import { useUserData } from '../context/UserDataContext';

export const OverlayWidgets: React.FC = () => {
  const { toasts } = useUserData();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-24 right-4 sm:right-6 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2.5 rounded-xl shadow-xl border text-xs sm:text-sm font-semibold backdrop-blur-md transition-all ${
            t.variant === 'accent'
              ? 'bg-[#161616]/95 border-[#E50914]/50 text-white'
              : 'bg-[#161616]/95 border-white/15 text-white'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
};
