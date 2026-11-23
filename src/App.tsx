/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { UserDataProvider, useUserData } from './context/UserDataContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { ExternalRoomProvider, useExternalRoom } from './context/ExternalRoomContext';
import { Header } from './components/Header';
import { FloatingDock } from './components/FloatingDock';
import { Footer } from './components/Footer';
import { StreamingPlayerModal } from './components/StreamingPlayerModal';
import { OverlayWidgets } from './components/OverlayWidgets';
import { AuthCard } from './components/AuthCard';
import { EmailConfirmationCard } from './components/EmailConfirmationCard';
import { WhoIsWatchingScreen } from './components/WhoIsWatchingScreen';

import { HomePage } from './pages/HomePage';
import { MoviesPage } from './pages/MoviesPage';
import { SeriesPage } from './pages/SeriesPage';
import { AnimesPage } from './pages/AnimesPage';
import { DoramasPage } from './pages/DoramasPage';
import { DocumentariesPage } from './pages/DocumentariesPage';
import { SessaoFlixPage } from './pages/SessaoFlixPage';
import { SearchPage } from './pages/SearchPage';
import { MyFlixPage } from './pages/MyFlixPage';
import {
  CollectionDetailPage,
  MediaDetailPage,
  PersonDetailPage,
} from './pages/DetailPage';

const ToastStack: React.FC = () => {
  const { toasts } = useUserData();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[120] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl border backdrop-blur-md text-center animate-fade-in ${
            toast.variant === 'accent'
              ? 'bg-[#141414]/95 border-[#E50914]/50 text-white'
              : 'bg-[#141414]/95 border-white/15 text-white/90'
          }`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
};

const ConfirmedEmailBanner: React.FC = () => {
  const { isConfirmedRedirectTab, dismissConfirmedRedirectTab } = useUserData();
  if (!isConfirmedRedirectTab) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[115] w-[calc(100%-24px)] max-w-md animate-fade-in">
      <div className="rounded-2xl bg-[#09080a]/95 border border-emerald-500/40 shadow-[0_14px_40px_rgba(0,0,0,0.85)] px-4 py-3 flex items-center justify-between gap-3 backdrop-blur-md">
        <div className="min-w-0">
          <p className="text-xs font-bold text-emerald-400">
            E-mail confirmado com sucesso!
          </p>
          <p className="text-[11px] text-white/80 leading-snug mt-0.5">
            Você já pode voltar para o navegador onde iniciou o cadastro ou continuar por aqui.
          </p>
        </div>
        <button
          type="button"
          onClick={dismissConfirmedRedirectTab}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white cursor-pointer transition-colors"
        >
          Continuar
        </button>
      </div>
    </div>
  );
};

const AppWorkspace: React.FC = () => {
  const { route } = useNavigation();
  const {
    isLoggedIn,
    isAuthReady,
    isProfileSelected,
    isPasswordRecovery,
    pendingEmailConfirmation,
  } = useUserData();
  const { isConnected, isPickerMode } = useExternalRoom();

  if (!isAuthReady) {
    return (
      <div className="min-h-[100dvh] bg-[#080808] text-white flex items-center justify-center">
        <div className="font-display text-xl font-extrabold tracking-tight">
          <span className="text-[#E50914]">LOVE</span> FLIX
        </div>
      </div>
    );
  }

  // 1. Caso o usuário não esteja logado ou esteja redefinindo a senha via link de e-mail
  if (!isLoggedIn || isPasswordRecovery) {
    // Quando acabou de cadastrar e aguarda confirmação: fecha a tela de cadastro e exibe apenas o card estilizado de e-mail enviado
    if (!isPasswordRecovery && pendingEmailConfirmation) {
      return (
        <div className="min-h-[100dvh] bg-[#080808] text-white flex flex-col justify-center items-center px-3 sm:px-4 py-6 relative overflow-hidden">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[320px] bg-[#E50914]/14 rounded-full blur-[150px] pointer-events-none" />
          <div className="relative z-10 w-full flex justify-center">
            <EmailConfirmationCard />
          </div>
          <ToastStack />
        </div>
      );
    }

    return (
      <div className="min-h-[100dvh] bg-[#080808] text-white flex flex-col justify-center items-center px-4 py-6 relative overflow-hidden">
        {/* Glow de iluminação cinematográfica */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[340px] bg-[#E50914]/10 rounded-full blur-[140px] pointer-events-none" />

        {/* Marca no topo */}
        <div className="mb-6 text-center relative z-10">
          <div className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white select-none">
            <span className="text-[#E50914]">LOVE</span> FLIX
          </div>
        </div>

        {/* Card de Autenticação */}
        <div className="relative z-10 w-full max-w-md animate-fade-in">
          <AuthCard />
        </div>

        {/* Rodapé discreto */}
        <footer className="mt-8 text-center relative z-10">
          <span className="font-display text-xs font-bold text-white/40 tracking-wider">
            <span className="text-[#E50914]/60">LOVE</span> FLIX
          </span>
        </footer>
        <ToastStack />
      </div>
    );
  }

  // 2. Logado, mas nenhum perfil selecionado: exibe a tela "Quem está assistindo?"
  if (!isProfileSelected) {
    return (
      <>
        <ConfirmedEmailBanner />
        <WhoIsWatchingScreen />
        <ToastStack />
      </>
    );
  }

  const isActiveWatchRoom = isConnected && !isPickerMode;

  const renderPage = () => {
    if (isActiveWatchRoom) {
      return <SessaoFlixPage />;
    }

    switch (route.page) {
      case 'home':
        return <HomePage />;
      case 'movies':
        return <MoviesPage />;
      case 'series':
        return <SeriesPage />;
      case 'animes':
        return <AnimesPage />;
      case 'doramas':
        return <DoramasPage />;
      case 'documentaries':
        return <DocumentariesPage />;
      case 'sessao-flix':
        return <SessaoFlixPage />;
      case 'search':
        return <SearchPage />;
      case 'my-flix':
      case 'my-account':
        return <MyFlixPage />;
      case 'detail':
        return (
          <MediaDetailPage
            mediaType={route.mediaType || 'movie'}
            id={route.id || 0}
          />
        );
      case 'person':
        return <PersonDetailPage personId={route.id || 0} />;
      case 'collection':
        return <CollectionDetailPage collectionId={route.id || 0} />;
      default:
        return <HomePage />;
    }
  };

  const pageTransitionKey = isActiveWatchRoom
    ? 'active-watch-room'
    : `${route.page}-${route.mediaType || ''}-${route.id || ''}`;

  return (
    <div
      className={`bg-[#080808] text-white flex flex-col ${
        isActiveWatchRoom ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]'
      }`}
    >
      {!isActiveWatchRoom && <Header />}

      {/* Main Streaming Viewport */}
      <main className={`flex-1 min-w-0 ${isActiveWatchRoom ? 'min-h-0' : ''}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={pageTransitionKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>

      {!isActiveWatchRoom && <Footer />}

      {/* Floating Capsule Dock & Interactive Modals */}
      {!isActiveWatchRoom && (
        <>
          <FloatingDock />
          <StreamingPlayerModal />
          <OverlayWidgets />
        </>
      )}
      <ToastStack />
    </div>
  );
};

export default function App() {
  return (
    <UserDataProvider>
      <NavigationProvider>
        <ExternalRoomProvider>
          <AppWorkspace />
        </ExternalRoomProvider>
      </NavigationProvider>
    </UserDataProvider>
  );
}
