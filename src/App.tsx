/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { UserDataProvider, useUserData } from './context/UserDataContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { ExternalRoomProvider } from './context/ExternalRoomContext';
import { Header } from './components/Header';
import { FloatingDock } from './components/FloatingDock';
import { Footer } from './components/Footer';
import { StreamingPlayerModal } from './components/StreamingPlayerModal';
import { OverlayWidgets } from './components/OverlayWidgets';
import { AuthCard } from './components/AuthCard';
import { WhoIsWatchingScreen } from './components/WhoIsWatchingScreen';

import { HomePage } from './pages/HomePage';
import { MoviesPage } from './pages/MoviesPage';
import { SeriesPage } from './pages/SeriesPage';
import { AnimesPage } from './pages/AnimesPage';
import { DoramasPage } from './pages/DoramasPage';
import { DocumentariesPage } from './pages/DocumentariesPage';
import { SearchPage } from './pages/SearchPage';
import { MyFlixPage } from './pages/MyFlixPage';
import {
  CollectionDetailPage,
  MediaDetailPage,
  PersonDetailPage,
} from './pages/DetailPage';

const AppWorkspace: React.FC = () => {
  const { route } = useNavigation();
  const { isLoggedIn, isProfileSelected } = useUserData();

  // 1. Caso o usuário não esteja logado, exige login ou cadastro para entrar
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#080808] text-white flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden">
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
      </div>
    );
  }

  // 2. Logado, mas nenhum perfil selecionado: exibe a tela "Quem está assistindo?"
  if (!isProfileSelected) {
    return <WhoIsWatchingScreen />;
  }

  const renderPage = () => {
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

  const pageTransitionKey = `${route.page}-${route.mediaType || ''}-${route.id || ''}`;

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col">
      {/* Top Brand & Horizontal Category Carousel */}
      <Header />

      {/* Main Streaming Viewport */}
      <main className="flex-1 min-w-0">
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

      <Footer />

      {/* Floating Capsule Dock & Interactive Modals */}
      <FloatingDock />
      <StreamingPlayerModal />
      <OverlayWidgets />
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
