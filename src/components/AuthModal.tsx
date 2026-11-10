import React from 'react';
import { X } from 'lucide-react';
import { useUserData } from '../context/UserDataContext';
import { AuthCard } from './AuthCard';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, authModalInitialMode } = useUserData();

  if (!isAuthModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-md my-auto">
        <button
          type="button"
          onClick={closeAuthModal}
          className="absolute right-4 top-4 z-10 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        <AuthCard
          initialMode={authModalInitialMode}
          onSuccess={closeAuthModal}
          isCompactModal={true}
        />
      </div>
    </div>
  );
};
