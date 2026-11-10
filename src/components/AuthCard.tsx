import React, { useState } from 'react';
import { Mail, Lock, User, Phone, Eye, EyeOff, LogIn, UserPlus, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { useUserData } from '../context/UserDataContext';

interface AuthCardProps {
  initialMode?: 'login' | 'register';
  onSuccess?: () => void;
  className?: string;
  isCompactModal?: boolean;
}

export const AuthCard: React.FC<AuthCardProps> = ({
  initialMode = 'login',
  onSuccess,
  className = '',
}) => {
  const { login, register } = useUserData();

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

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

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const res = login(loginIdentifier, loginPassword);
    if (!res.success) {
      setErrorMsg(res.message || 'Erro ao realizar login.');
    } else {
      setSuccessMsg('Login realizado com sucesso!');
      if (onSuccess) onSuccess();
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('As senhas digitadas não coincidem.');
      return;
    }

    const res = register({
      name: regName,
      email: regEmail,
      phone: regPhone,
      password: regPassword,
    });

    if (!res.success) {
      setErrorMsg(res.message || 'Erro ao criar conta.');
    } else {
      setSuccessMsg('Conta criada com sucesso!');
      if (onSuccess) onSuccess();
    }
  };

  return (
    <div className={`w-full max-w-md mx-auto ${className}`}>
      <div className="rounded-2xl bg-[#141414] border border-white/[0.08] shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Cabeçalho */}
        <div className="text-center space-y-2">
          <h2 className="font-display text-2xl font-extrabold text-white tracking-tight">
            {mode === 'login' ? 'Entrar no Love Flix' : 'Criar sua conta'}
          </h2>
          <p className="text-xs text-[#A1A1A1] max-w-xs mx-auto">
            {mode === 'login'
              ? 'Acesse seus filmes salvos, perfis, favoritos e histórico em qualquer tela.'
              : 'Cadastre-se para sincronizar sua conta, criar perfis e assistir sem limites.'}
          </p>
        </div>

        {/* Alternador de Modo (Tabs) */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-[#0c0c0c] border border-white/[0.06]">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg('');
              setSuccessMsg('');
            }}
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
            onClick={() => {
              setMode('register');
              setErrorMsg('');
              setSuccessMsg('');
            }}
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

        {/* Mensagem de Erro */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-[#FF4757] text-xs font-medium animate-fade-in text-center">
            {errorMsg}
          </div>
        )}

        {/* Mensagem de Sucesso */}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium animate-fade-in flex items-center justify-center gap-2 text-center">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Formulário: ENTRAR */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/90">E-mail ou Celular</label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                <input
                  type="text"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="seu.email@exemplo.com ou (11) 98765-4321"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-white/90">Senha de acesso</label>
              </div>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
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
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#E50914] hover:bg-[#d00812] text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-[#E50914]/20 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Entrar na conta</span>
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
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-white/90">Número de celular</label>
              <div className="relative flex items-center">
                <Phone className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                <input
                  type="tel"
                  required
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="(11) 98765-4321"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1c1c1c] border border-white/12 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-white/90">Senha (mín. 6)</label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Mínimo 6 dígitos"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#1c1c1c] border border-white/12 text-xs text-white placeholder:text-[#666666] focus:outline-none focus:border-[#E50914] transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-white/90">Confirmar senha</label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3.5 w-4 h-4 text-[#777777] pointer-events-none" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
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
                    {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>



            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#E50914] hover:bg-[#d00812] text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-[#E50914]/20 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Concluir cadastro</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Rodapé com link de troca */}
        <div className="text-center text-xs text-[#888888] pt-1">
          {mode === 'login' ? (
            <p>
              Não possui uma conta?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
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
                onClick={() => {
                  setMode('login');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className="text-white hover:text-[#FF253A] font-semibold underline underline-offset-2 transition-colors cursor-pointer"
              >
                Faça login aqui
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
