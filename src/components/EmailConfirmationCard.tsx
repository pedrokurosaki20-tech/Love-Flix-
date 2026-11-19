import React, { useEffect, useState } from 'react';
import { CheckCircle2, MailCheck, RefreshCw, X } from 'lucide-react';
import { useUserData } from '../context/UserDataContext';

const CARD_EMAIL_ART = '/assets/dns/card_email.jpg';

interface EmailConfirmationCardProps {
  onSuccess?: () => void;
}

export const EmailConfirmationCard: React.FC<EmailConfirmationCardProps> = ({
  onSuccess,
}) => {
  const {
    pendingEmailConfirmation,
    clearPendingEmailConfirmation,
    checkPendingEmailConfirmation,
    resendConfirmationEmail,
  } = useUserData();

  const [isChecking, setIsChecking] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(30);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'info' | 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (!pendingEmailConfirmation) return null;

  const { email } = pendingEmailConfirmation;

  const handleCheckNow = async () => {
    if (isChecking) return;
    setStatusMessage(null);
    setIsChecking(true);
    try {
      const res = await checkPendingEmailConfirmation(true);
      if (res.confirmed) {
        if (onSuccess) onSuccess();
      } else if (res.message) {
        setStatusMessage({ type: 'info', text: res.message });
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleResend = async () => {
    if (isResending || cooldown > 0) return;
    setStatusMessage(null);
    setIsResending(true);
    try {
      const res = await resendConfirmationEmail(email);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: res.message || 'Novo link de confirmação enviado!',
        });
        setCooldown(60);
      } else {
        setStatusMessage({
          type: 'error',
          text: res.message || 'Não foi possível reenviar o e-mail agora.',
        });
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="w-full max-w-[460px] mx-auto px-1">
      <div className="relative w-full overflow-hidden rounded-[22px] bg-[#050406] border border-[#E50914]/50 shadow-[0_24px_75px_rgba(0,0,0,0.96),0_0_48px_rgba(229,9,20,0.24)] ring-1 ring-inset ring-[#E50914]/20 animate-scale-up">
        {/* Artwork de e-mail personalizada à esquerda */}
        <img
          src={CARD_EMAIL_ART}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover object-left"
        />

        {/* Sobreposição obsidian diagonal + brilho vermelho sutil */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(102deg, rgba(5,4,6,0.06) 0%, rgba(5,4,6,0.42) 28%, rgba(5,4,6,0.93) 44%, #050406 60%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 24% 100%, rgba(229,9,20,0.34), transparent 55%), radial-gradient(ellipse at 86% 100%, rgba(229,9,20,0.20), transparent 50%)',
          }}
        />

        {/* Botão Fechar (X) para retornar ao login/cadastro se desejar */}
        <button
          type="button"
          onClick={clearPendingEmailConfirmation}
          className="absolute right-3.5 top-3.5 z-20 p-1 text-white/80 hover:text-white transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" strokeWidth={2.2} />
        </button>

        {/* Conteúdo alinhado à área centro-direita (igual aos 3 cards do DNS) */}
        <div className="relative z-10 pl-[32%] sm:pl-[34%] pr-4 sm:pr-7 py-6 sm:py-7 flex flex-col items-center text-center">
          {/* Ícone circular vermelho brilhante de e-mail */}
          <div className="w-12 h-12 rounded-full bg-[#E50914]/15 border border-[#E50914]/35 shadow-[0_0_24px_rgba(229,9,20,0.5)] flex items-center justify-center mb-3.5">
            <MailCheck className="w-6 h-6 text-[#FF1F33]" strokeWidth={2.2} />
          </div>

          <h3 className="font-display text-[17px] sm:text-[21px] font-bold tracking-tight leading-snug mb-2">
            <span className="text-white">E-mail de </span>
            <span className="text-[#FF1F33]">confirmação enviado!</span>
          </h3>

          <p className="text-[11.5px] sm:text-[13px] text-white/85 leading-[1.48] max-w-[265px] mb-4">
            Enviamos um link para{' '}
            <span className="text-white font-semibold break-all">{email}</span>. Confirme
            no seu e-mail e volte aqui para entrar automaticamente.
          </p>

          {statusMessage && (
            <div
              className={`w-full max-w-[250px] mb-3 px-3 py-2 rounded-xl text-[11px] font-medium leading-snug border flex items-center justify-center gap-1.5 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : statusMessage.type === 'error'
                  ? 'bg-red-500/15 border-red-500/30 text-[#FF4757]'
                  : 'bg-white/[0.06] border-white/15 text-white/85'
              }`}
            >
              {statusMessage.type === 'success' && (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <div className="w-full max-w-[235px] flex flex-col items-center gap-3">
            <button
              type="button"
              disabled={isChecking}
              onClick={() => void handleCheckNow()}
              className="w-full h-10 sm:h-11 rounded-full bg-gradient-to-b from-[#EC1122] to-[#B00610] hover:from-[#FF253A] hover:to-[#C80814] disabled:opacity-60 border border-white/15 text-white text-xs sm:text-[13px] font-bold transition-all shadow-[0_6px_22px_rgba(229,9,20,0.5)] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              {isChecking && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isChecking ? 'Verificando...' : 'Já confirmei meu e-mail'}</span>
            </button>

            <p className="text-[11px] text-white/65 leading-relaxed">
              Não recebeu o e-mail? Confira o Spam ou{' '}
              <button
                type="button"
                disabled={isResending || cooldown > 0}
                onClick={() => void handleResend()}
                className="font-semibold text-[#FF4757] hover:text-white underline underline-offset-2 disabled:opacity-50 disabled:no-underline transition-colors cursor-pointer"
              >
                {isResending
                  ? 'enviando...'
                  : cooldown > 0
                  ? `enviar novamente (${cooldown}s)`
                  : 'enviar novamente'}
              </button>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
