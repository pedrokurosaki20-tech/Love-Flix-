import React from 'react';
import { ArrowLeft, User } from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';

export const MyAccountPage: React.FC = () => {
  const { navigateToPage } = useNavigation();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-6 min-h-[75vh]">
      <button
        type="button"
        onClick={() => navigateToPage('my-flix')}
        className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#A1A1A1] hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Voltar para Minha Flix</span>
      </button>

      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Minha Conta
        </h1>
      </div>

      {/* Estrutura visual reservada sem formulários ou configurações internas */}
      <section className="rounded-2xl bg-[#121212] border border-white/[0.08] p-8 sm:p-12 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#E50914]/15 border border-[#E50914]/30 flex items-center justify-center text-[#FF253A] mb-4">
          <User className="w-6 h-6" />
        </div>
        <h2 className="font-display text-lg sm:text-xl font-bold text-white mb-1.5">
          Área Pessoal Reservada
        </h2>
        <p className="text-xs sm:text-sm text-[#A1A1A1] max-w-md leading-relaxed">
          Espaço estruturado para reunir os dados e informações pessoais da sua conta na Love Flix.
        </p>
      </section>
    </div>
  );
};
