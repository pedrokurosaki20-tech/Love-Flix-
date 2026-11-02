import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-14 border-t border-white/[0.07] bg-[#080808] px-4 sm:px-6 lg:px-10 pt-8 pb-28">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <span className="font-display text-base font-extrabold tracking-tight text-white">
          <span className="text-[#E50914]">LOVE</span> FLIX
        </span>
        <p className="text-xs text-[#A1A1A1] leading-relaxed">
          Catálogo integrado em tempo real. Este produto utiliza a API da TMDB, mas não é endossado nem certificado pela TMDB.
        </p>
      </div>
    </footer>
  );
};
