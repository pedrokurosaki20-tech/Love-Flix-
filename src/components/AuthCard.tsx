import React, { useEffect, useState } from 'react';
import {
  Mail,
  Lock,
  User,
  Phone,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  KeyRound,
} from 'lucide-react';
import { useUserData } from '../context/UserDataContext';

interface AuthCardProps {
  initialMode?: 'login' | 'register';
  onSuccess?: () => void;
  className?: string;
  isCompactModal?: boolean;
}

type AuthMode = 'login' | 'register' | 'forgot' | 'recovery';

export const AuthCard: React.FC<AuthCardProps> = ({
  initialMode = 'login',
  onSuccess,
  className = '',
}) => {
  const {
    login,
    register,
    resendConfirmationEmail,
    requestPasswordReset,
    completePasswordRecovery,
    isPasswordRecovery,
    authRedirectNotice,
    clearAuthRedirectNotice,
  } = useUserData();

  const [mode, setMode] = useState<AuthMode>(
    isPasswordRecovery ? 'recovery' : initialMode
  );
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Email confirmation resend state
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('');
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Forgot & recovery state
  const [forgotEmail, setForgotEmail] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);

  useEffect(() => {
    if (isPasswordRecovery) {
      setMode('recovery');
      setErrorMsg('');
    }
  }, [isPasswordRecovery]);

  useEffect(() => {
    if (!authRedirectNotice) return;
    if (authRedirectNotice.type === 'error') {
      setErrorMsg(authRedirectNotice.text);
      setSuccessMsg('');
    } else {
      setSuccessMsg(authRedirectNotice.text);
      setErrorMsg('');
    }
  }, [authRedirectNotice]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMsg('');
    setSuccessMsg('');
    setPendingConfirmationEmail('');
    clearAuthRedirectNotice();
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setPendingConfirmationEmail('');
    clearAuthRedirectNotice();
    setIsSubmitting(true);
    try {
      const res = await login(loginIdentifier, loginPassword);
      if (!res.success) {
        setErrorMsg(res.message || 'Erro ao realizar login.');
        if (res.needsEmailConfirmation && res.email) {
          setPendingConfirmationEmail(res.email);
        }
      } else {
        setSuccessMsg(res.message || 'Login realizado com sucesso!');
        if (res.authenticated !== false && onSuccess) onSuccess();
      }
    } catch {
      setErrorMsg('Não foi possível entrar agora. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setPendingConfirmationEmail('');
    clearAuthRedirectNotice();

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('As senhas digitadas não coincidem.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await register({
        name: regName,
        email: regEmail,
        phone: regPhone,
        password: regPassword,
      });
      if (!res.success) {
        setErrorMsg(res.message || 'Erro ao criar conta.');
      } else {
        setSuccessMsg(res.message || 'Conta criada com sucesso!');
        if (res.needsEmailConfirmation && res.email) {
          setPendingConfirmationEmail(res.email);
          setResendCooldown(30);
        }
        if (res.authenticated !== false && onSuccess) onSuccess();
      }
    } catch {
      setErrorMsg('Não foi possível criar a conta agora. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!pendingConfirmationEmail || isResendingEmail || resendCooldown > 0) return;
    setErrorMsg('');
    setIsResendingEmail(true);
    try {
      const res = await resendConfirmationEmail(pendingConfirmationEmail);
      if (!res.success) {
        setErrorMsg(res.message || 'Não foi possível reenviar o e-mail.');
      } else {
        setSuccessMsg(res.message || 'Link de confirmação reenviado!');
        setResendCooldown(60);
      }
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    clearAuthRedirectNotice();
    setIsSubmitting(true);
    try {
      const res = await requestPasswordReset(forgotEmail);
      if (!res.success) {
        setErrorMsg(res.message || 'Não foi possível enviar o link de recuperação.');
      } else {
        setSuccessMsg(res.message || 'Link de recuperação enviado.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    clearAuthRedirectNotice();

    if (recoveryPassword !== recoveryConfirmPassword) {
      setErrorMsg('As senhas digitadas não coincidem.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await completePasswordRecovery(recoveryPassword);
      if (!res.success) {
        setErrorMsg(res.message || 'Não foi possível redefinir sua senha.');
      } else {
        setSuccessMsg(res.message || 'Senha redefinida com sucesso!');
        if (onSuccess) onSuccess();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerTitle =
    mode === 'login'
      ? 'Entrar no Love Flix'
      : mode === 'register'
      ? 'Criar sua conta'
      : mode === 'forgot'
      ? 'Recuperar senha'
      : 'Definir nova senha';

  const headerSubtitle =
    mode === 'login'
      ? 'Acesse seus filmes salvos, perfis, favoritos e histórico em qualquer tela.'
      : mode === 'register'
      ? 'Cadastre-se para sincronizar sua conta, criar perfis e assistir sem limites.'
      : mode === 'forgot'
      ? 'Informe seu e-mail cadastrado para receber um link seguro de redefinição.'
      : 'Crie uma nova senha forte para proteger sua conta Love Flix.';

  return (
    <div className={`w-full max-w-md mx-auto ${className}`}>
      <div className="rounded-2xl bg-[#141414] border border-white/[0.08] shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Cabeçalho */}
        <div className="text-center space-y-2">
          <h2 className="font-display text-2xl font-extrabold text-white tracking-tight">
            {headerTitle}
          </h2>
          <p className="text-xs text-[#A1A1A1] max-w-xs mx-auto">{headerSubtitle}</p>
        </div>

        {/* Alternador de Modo (Tabs) */}
        {(mode === 'login' || mode === 'register') && (
          <div className="grid grid-cols-2 p-1 rounded-xl bg-[#0c0c0c] border border-white/[0.06]">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                mode === 'login'
                  ? 'bg-white text-black shadow-md'
                  : 'text-[#A1A1A1] hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Entrar</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                mode === 'register'
                  ? 'bg-[#E50914] text-white shadow-md'
                  : 'text-[#A1A1A1] hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Criar conta</span>
            </button>
          </div>
        )}

        {/* Mensagem de Erro */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-[#FF4757] text-xs font-medium animate-fade-in text-center leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* Mensagem de Sucesso */}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium animate-fade-in flex items-start justify-center gap-2 text-center leading-relaxed">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Ação de reenvio de e-mail de confirmação */}
        {pendingConfirmationEmail && (
          <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-2.5 text-center animate-fade-in">
            <p className="text-[11px] text-[#B8B8B8]">
              Não recebeu o e-mail para{' '}
              <span className="text-white font-semibold">{pendingConfirmationEmail}</span>?
            </p>
            <button
              type="button"
              disabled={isResendingEmail || resendCooldown > 0}
              onClick={() => void handleResendConfirmation()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/[0.09] hover:bg-white/[0.15] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isResendingEmail ? 'animate-spin' : ''}`}
              />
              <span>
                {isResendingEmail
                  ? 'Reenviando...'
                  : resendCooldown > 0
                  ? `Reenviar em ${resendCooldown}s`
                  : 'Reenviar e-mail de confirmação'}
              </span>
            </button>
          </div>
        )}

        {/* Formulário: ENTRAR */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/90">
                E-mail cadastrado
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-white/90">
                  Senha de acesso
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(loginIdentifier);
                    switchMode('forgot');
                  }}
                  className="text-[11px] font-medium text-[#A1A1A1] hover:text-white transition-colors cursor-pointer"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Sua senha secreta"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 text-[#777777] hover:text-white transition-colors cursor-pointer"
                >
                  {showLoginPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-[#E50914] hover:bg-[#d00812] disabled:opacity-60 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-[#E50914]/20 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{isSubmitting ? 'Entrando...' : 'Entrar na conta'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Formulário: CRIAR CONTA */}
        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/90">Nome completo</label>
              <div className="relative flex items-center">
                <User className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Seu nome ou apelido"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/90">E-mail</label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/90">
                Número de celular
              </label>
              <div className="relative flex items-center">
                <Phone className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="(11) 98765-4321"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-white/90">
                  Senha (mín. 6)
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Mínimo 6 dígitos"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#1c1c1c] border border-white/12 text-xs text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-white/90">
                  Confirmar senha
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#1c1c1c] border border-white/12 text-xs text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-2 text-[#777777] hover:text-white cursor-pointer"
                  >
                    {showRegPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-[#E50914] hover:bg-[#d00812] disabled:opacity-60 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-[#E50914]/20 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{isSubmitting ? 'Criando conta...' : 'Concluir cadastro'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Formulário: ESQUECI MINHA SENHA */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/90">
                E-mail da conta
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-[#E50914] hover:bg-[#d00812] disabled:opacity-60 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-[#E50914]/20 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isSubmitting ? 'Enviando...' : 'Enviar link de recuperação'}</span>
            </button>

            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-white/80 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para entrar</span>
            </button>
          </form>
        )}

        {/* Formulário: REDEFINIR SENHA (LINK DE RECUPERAÇÃO) */}
        {mode === 'recovery' && (
          <form onSubmit={handleRecoverySubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/90">
                Nova senha (mín. 6)
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                <input
                  type={showRecoveryPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={recoveryPassword}
                  onChange={(e) => setRecoveryPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowRecoveryPassword(!showRecoveryPassword)}
                  className="absolute right-3 text-[#777777] hover:text-white transition-colors cursor-pointer"
                >
                  {showRecoveryPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/90">
                Confirmar nova senha
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                <input
                  type={showRecoveryPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={recoveryConfirmPassword}
                  onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-[#E50914] hover:bg-[#d00812] disabled:opacity-60 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-[#E50914]/20 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{isSubmitting ? 'Salvando...' : 'Salvar nova senha'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Rodapé com link de troca + selo discreto de verificação */}
        <div className="space-y-3 pt-1">
          {(mode === 'login' || mode === 'register') && (
            <div className="text-center text-xs text-[#888888]">
              {mode === 'login' ? (
                <p>
                  Não possui uma conta?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className="text-white hover:text-[#FF253A] font-semibold underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Cadastre-se gratuitamente
                  </button>
                </p>
              ) : (
                <p>
                  Já tem cadastro?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="text-white hover:text-[#FF253A] font-semibold underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Faça login aqui
                  </button>
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#6E6E6E]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
            <span>Acesso protegido com confirmação por e-mail</span>
          </div>
        </div>
      </div>
    </div>
  );
};
