import React, { useState } from 'react';
import { Heart, Settings, ShieldCheck, X } from 'lucide-react';
import { useUserData } from '../context/UserDataContext';

const CARD1_ART = '/assets/dns/card1_venom.jpg';
const CARD2_ART = '/assets/dns/card2_couple.jpg';
const CARD3_ART = '/assets/dns/card3_popcorn.jpg';

export const DnsPromptModals: React.FC = () => {
  const {
    showDnsWelcomePrompt,
    setShowDnsWelcomePrompt,
    showDnsThankYouPrompt,
    setShowDnsThankYouPrompt,
    pushToast,
  } = useUserData();

  // Estado para o card explicativo caso a pessoa escolha "Agora não"
  const [showLaterInfoPrompt, setShowLaterInfoPrompt] = useState<boolean>(false);

  const handleConfigureDns = async () => {
    const DNS_HOSTNAME = 'dns.adguard-dns.com';
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
      pushToast('DNS copiada automaticamente! Cole nas configurações do aparelho.', 'accent');
    } catch {
      // fallback
    }

    // Prepara os ouvintes para quando a pessoa retornar das configurações do celular
    const handleReturnFromSettings = () => {
      setShowDnsThankYouPrompt(true);
      window.removeEventListener('focus', handleReturnFromSettings);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleReturnFromSettings();
      }
    };

    window.addEventListener('focus', handleReturnFromSettings, { once: true });
    document.addEventListener('visibilitychange', handleVisibilityChange, { once: true });

    // Fecha o card inicial de boas-vindas
    setShowDnsWelcomePrompt(false);

    // Redireciona diretamente para a configuração de rede/DNS no próprio celular (Android Intent)
    const ua = navigator.userAgent.toLowerCase();
    if (/android/i.test(ua)) {
      try {
        window.location.href =
          'intent:#Intent;action=android.settings.NETWORK_OPERATOR_SETTINGS;end';
      } catch {
        try {
          window.location.href =
            'intent:#Intent;action=android.settings.WIRELESS_SETTINGS;end';
        } catch {
          // fallback
        }
      }
    } else {
      // Em navegadores de computador ou iOS sem intent de sistema
      setTimeout(() => {
        setShowDnsThankYouPrompt(true);
      }, 1200);
    }
  };

  const handleConfigureLater = () => {
    setShowDnsWelcomePrompt(false);
    setShowLaterInfoPrompt(true);
  };

  return (
    <>
      {/* =========================================================================
          CARD 1: Dica de Desempenho (Esquerda no modelo)
          ========================================================================= */}
      {showDnsWelcomePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-[450px] overflow-hidden rounded-[22px] bg-[#080709] border border-white/20 shadow-[0_24px_70px_rgba(0,0,0,0.9),0_0_40px_rgba(229,9,20,0.18)] animate-scale-up">
            {/* Artwork lateral esquerda */}
            <img
              src={CARD1_ART}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              className="pointer-events-none select-none absolute inset-y-0 left-0 w-[40%] h-full object-cover object-left"
              style={{
                maskImage: 'linear-gradient(to right, black 62%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to right, black 62%, transparent 100%)',
              }}
            />

            {/* Sobreposição escura diagonal e brilho vermelho inferior */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(102deg, rgba(8,7,10,0.08) 0%, rgba(8,7,10,0.45) 28%, rgba(8,7,10,0.92) 40%, #09080a 56%)',
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse at 22% 100%, rgba(229,9,20,0.34), transparent 55%), radial-gradient(ellipse at 82% 100%, rgba(229,9,20,0.16), transparent 50%)',
              }}
            />

            {/* Botão Fechar (X) */}
            <button
              type="button"
              onClick={handleConfigureLater}
              className="absolute right-3.5 top-3.5 z-20 p-1 text-white/85 hover:text-white transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" strokeWidth={2.2} />
            </button>

            {/* Conteúdo alinhado à área centro-direita do card */}
            <div className="relative z-10 pl-[32%] sm:pl-[34%] pr-4 sm:pr-7 py-6 sm:py-7 flex flex-col items-center text-center">
              {/* Ícone Escudo Vermelho Brilhante */}
              <div className="w-12 h-12 rounded-full bg-[#E50914]/15 border border-[#E50914]/25 shadow-[0_0_24px_rgba(229,9,20,0.45)] flex items-center justify-center mb-3.5">
                <ShieldCheck className="w-6 h-6 text-[#FF1F33]" strokeWidth={2.2} />
              </div>

              <h3 className="font-display text-[17px] sm:text-[21px] font-bold tracking-tight leading-snug mb-2">
                <span className="text-white">Dica de </span>
                <span className="text-[#FF1F33]">Desempenho</span>
              </h3>

              <p className="text-[11.5px] sm:text-[13px] text-white/85 leading-[1.45] max-w-[260px] mb-5">
                Ative a proteção DNS e tenha uma experiência ainda melhor no Love Flix.
              </p>

              <div className="w-full max-w-[235px] flex flex-col items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleConfigureDns}
                  className="w-full h-10 sm:h-11 rounded-full bg-gradient-to-b from-[#EC1122] to-[#B00610] hover:from-[#FF253A] hover:to-[#C80814] border border-white/15 text-white text-xs sm:text-[13px] font-bold transition-all shadow-[0_6px_22px_rgba(229,9,20,0.5)] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  <Settings className="w-4 h-4 text-white" strokeWidth={2.2} />
                  <span>Configurar DNS</span>
                </button>

                <button
                  type="button"
                  onClick={handleConfigureLater}
                  className="py-1 px-3 text-xs sm:text-[13px] font-medium text-white/90 hover:text-white transition-colors cursor-pointer"
                >
                  Agora não
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CARD 2: Agradecemos sua compreensão! (Centro no modelo)
          ========================================================================= */}
      {showDnsThankYouPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-[450px] overflow-hidden rounded-[22px] bg-[#080709] border border-white/20 shadow-[0_24px_70px_rgba(0,0,0,0.9),0_0_40px_rgba(229,9,20,0.18)] animate-scale-up">
            {/* Artwork casal + lua vermelha */}
            <img
              src={CARD2_ART}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover object-left"
            />

            {/* Sobreposição escura diagonal e brilho vermelho inferior */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(102deg, rgba(8,7,10,0.06) 0%, rgba(8,7,10,0.4) 30%, rgba(8,7,10,0.92) 45%, #09080a 60%)',
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse at 25% 100%, rgba(229,9,20,0.32), transparent 55%), radial-gradient(ellipse at 85% 100%, rgba(229,9,20,0.18), transparent 50%)',
              }}
            />

            {/* Botão Fechar (X) */}
            <button
              type="button"
              onClick={() => setShowDnsThankYouPrompt(false)}
              className="absolute right-3.5 top-3.5 z-20 p-1 text-white/85 hover:text-white transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" strokeWidth={2.2} />
            </button>

            {/* Conteúdo alinhado à área centro-direita do card */}
            <div className="relative z-10 pl-[33%] sm:pl-[35%] pr-4 sm:pr-7 py-6 sm:py-7 flex flex-col items-center text-center">
              {/* Ícone Coração Vermelho Outline Brilhante */}
              <div className="w-12 h-12 rounded-full bg-[#E50914]/15 border border-[#E50914]/25 shadow-[0_0_24px_rgba(229,9,20,0.45)] flex items-center justify-center mb-3.5">
                <Heart className="w-6 h-6 text-[#FF1F33]" strokeWidth={2.2} />
              </div>

              <h3 className="font-display text-[17px] sm:text-[21px] font-bold text-white tracking-tight leading-snug mb-2">
                Agradecemos sua compreensão! <span className="text-[#FF1F33]">❤️</span>
              </h3>

              <p className="text-[11.5px] sm:text-[13px] text-white/85 leading-[1.45] max-w-[250px] mb-5">
                Seguimos juntos nessa jornada pelo mundo do entretenimento!
              </p>

              <div className="w-full max-w-[235px]">
                <button
                  type="button"
                  onClick={() => setShowDnsThankYouPrompt(false)}
                  className="w-full h-10 sm:h-11 rounded-full bg-gradient-to-b from-[#EC1122] to-[#B00610] hover:from-[#FF253A] hover:to-[#C80814] border border-white/15 text-white text-xs sm:text-[13px] font-bold transition-all shadow-[0_6px_22px_rgba(229,9,20,0.5)] flex items-center justify-center cursor-pointer active:scale-[0.98]"
                >
                  Continuar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CARD 3: Você pode ativar quando quiser! (Direita no modelo)
          ========================================================================= */}
      {showLaterInfoPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-[450px] overflow-hidden rounded-[22px] bg-[#080709] border border-white/20 shadow-[0_24px_70px_rgba(0,0,0,0.9),0_0_40px_rgba(229,9,20,0.16)] animate-scale-up">
            {/* Artwork balde de pipoca + claquete */}
            <img
              src={CARD3_ART}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover object-left"
            />

            {/* Sobreposição escura diagonal e brilho vermelho sutil no canto inferior direito */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(102deg, rgba(8,7,10,0.06) 0%, rgba(8,7,10,0.4) 30%, rgba(8,7,10,0.92) 45%, #09080a 60%)',
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse at 90% 100%, rgba(229,9,20,0.28), transparent 55%)',
              }}
            />

            {/* Botão Fechar (X) */}
            <button
              type="button"
              onClick={() => setShowLaterInfoPrompt(false)}
              className="absolute right-3.5 top-3.5 z-20 p-1 text-white/85 hover:text-white transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" strokeWidth={2.2} />
            </button>

            {/* Conteúdo alinhado à área centro-direita do card */}
            <div className="relative z-10 pl-[33%] sm:pl-[35%] pr-4 sm:pr-7 py-6 sm:py-7 flex flex-col items-center text-center">
              {/* Ícone Escudo Azul Brilhante 3D com Check Branco */}
              <div className="w-12 h-12 rounded-full bg-sky-400/15 border border-sky-300/25 shadow-[0_0_26px_rgba(56,189,248,0.5)] flex items-center justify-center mb-3.5">
                <svg
                  viewBox="0 0 24 24"
                  className="w-7 h-7 drop-shadow-[0_2px_8px_rgba(56,189,248,0.65)]"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="blueShieldGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7DD3FC" />
                      <stop offset="55%" stopColor="#0EA5E9" />
                      <stop offset="100%" stopColor="#0369A1" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M12 2.2L4 5.8v5.5c0 5.1 3.4 9.8 8 11 4.6-1.2 8-5.9 8-11V5.8L12 2.2z"
                    fill="url(#blueShieldGrad)"
                    stroke="#BAE6FD"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M9.2 12.3l2 2 4-4.2"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <h3 className="font-display text-[17px] sm:text-[21px] font-bold text-white tracking-tight leading-snug mb-2">
                Você pode ativar quando quiser!
              </h3>

              <p className="text-[11.5px] sm:text-[13px] text-white/85 leading-[1.45] max-w-[250px] mb-5">
                A proteção anti-anúncios pode ser ativada depois, nas configurações.
              </p>

              <div className="w-full max-w-[235px]">
                <button
                  type="button"
                  onClick={() => setShowLaterInfoPrompt(false)}
                  className="w-full h-10 sm:h-11 rounded-full bg-black/55 hover:bg-[#E50914]/15 border border-[#B91C1C] hover:border-[#FF253A] text-white text-xs sm:text-[13px] font-bold transition-all shadow-[0_0_18px_rgba(229,9,20,0.22)] flex items-center justify-center cursor-pointer active:scale-[0.98]"
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
