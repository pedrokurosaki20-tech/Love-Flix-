import React, { useState } from 'react';
import { ShieldCheck, Copy, ArrowRight, Heart, X, Compass, ExternalLink } from 'lucide-react';
import { useUserData } from '../context/UserDataContext';

export const DnsPromptModals: React.FC = () => {
  const {
    showDnsWelcomePrompt,
    setShowDnsWelcomePrompt,
    showDnsThankYouPrompt,
    setShowDnsThankYouPrompt,
    pushToast,
  } = useUserData();

  // Estado para o card explicativo caso a pessoa escolha "Configurar depois"
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
          CARD 1: AVISO ORIENTATIVO DE DNS APÓS O CADASTRO (Leva direto ao celular)
          ========================================================================= */}
      {showDnsWelcomePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-4 text-center animate-scale-up">
            <button
              type="button"
              onClick={handleConfigureLater}
              className="absolute right-3.5 top-3.5 text-[#777777] hover:text-white transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-[#FF253A] flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-display text-lg font-bold text-white tracking-tight">
                Dica de Desempenho 🛡️
              </h3>
              <p className="text-xs text-[#A1A1A1] leading-relaxed">
                Para que sua experiência no Love Flix seja mais rápida, sem travamentos e livre de anúncios indesejados, recomendamos ativar a proteção DNS no seu aparelho.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConfigureDns}
                className="w-full py-2.5 px-4 rounded-xl bg-[#E50914] hover:bg-[#d00812] text-white text-xs font-bold transition-all shadow-lg shadow-[#E50914]/25 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Configurar DNS no aparelho</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleConfigureLater}
                className="w-full py-2 px-3 text-xs text-[#888888] hover:text-white transition-colors cursor-pointer"
              >
                Configurar depois
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CARD 2: AGRADECIMENTO AO VOLTAR DA DNS DO CELULAR
          ========================================================================= */}
      {showDnsThankYouPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-4 text-center animate-scale-up">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-[#FF253A] flex items-center justify-center mx-auto">
              <Heart className="w-6 h-6 fill-current text-[#FF253A]" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-display text-lg font-bold text-white tracking-tight">
                Agradecemos sua compreensão! ❤️
              </h3>
              <p className="text-xs text-[#A1A1A1] leading-relaxed">
                A equipe Love Flix agradece seu carinho e colaboração. Já estamos trabalhando em novas atualizações para aprimorar o aplicativo e torná-lo 100% automático, para que em breve você nem precise dessa etapa manual.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowDnsThankYouPrompt(false)}
                className="w-full py-2.5 px-4 rounded-xl bg-white text-black hover:bg-white/90 text-xs font-bold transition-all shadow-md cursor-pointer active:scale-[0.98]"
              >
                Continuar no Love Flix
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CARD 3: ONDE ENCONTRAR A OPÇÃO NOVAMENTE (QUANDO ESCOLHE "CONFIGURAR DEPOIS")
          ========================================================================= */}
      {showLaterInfoPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm rounded-2xl bg-[#141414] border border-white/15 p-6 shadow-2xl space-y-4 text-center animate-scale-up">
            <button
              type="button"
              onClick={() => setShowLaterInfoPrompt(false)}
              className="absolute right-3.5 top-3.5 text-[#777777] hover:text-white transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-[#38BDF8] flex items-center justify-center mx-auto">
              <Compass className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 className="font-display text-lg font-bold text-white tracking-tight">
                Você pode ativar quando quiser! 🛡️
              </h3>
              <p className="text-xs text-[#A1A1A1] leading-relaxed">
                Sem problemas! Quando desejar ativar a proteção anti-anúncios para navegar com mais velocidade, você pode encontrá-la a qualquer momento em:
              </p>

              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 text-left space-y-1.5 mt-2">
                <div className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                  <span className="text-[#FF253A]">Minha Flix</span>
                  <span className="text-white/40">›</span>
                  <span className="text-emerald-400">Privacidade e segurança</span>
                </div>
                <p className="text-[11px] text-[#888888]">
                  Toque nessa aba para copiar o código da DNS e conferir as orientações a qualquer hora.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowLaterInfoPrompt(false)}
                className="w-full py-2.5 px-4 rounded-xl bg-white text-black hover:bg-white/90 text-xs font-bold transition-all shadow-md cursor-pointer active:scale-[0.98]"
              >
                Entendido, continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
