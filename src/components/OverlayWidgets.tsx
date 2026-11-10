import React from 'react';
import { AuthModal } from './AuthModal';
import { DnsPromptModals } from './DnsPromptModals';

export const OverlayWidgets: React.FC = () => {
  return (
    <>
      <AuthModal />
      <DnsPromptModals />
    </>
  );
};
