import React, { useState } from 'react';
import { Film, User } from 'lucide-react';

interface ResilientImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackType?: 'poster' | 'backdrop' | 'avatar';
}

export const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  alt,
  className = '',
  fallbackType = 'poster',
}) => {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#191919] via-[#121212] to-[#0a0a0a] text-[#A1A1A1] select-none p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        {fallbackType === 'avatar' ? (
          <User className="w-8 h-8 text-[#A1A1A1]/60 mb-1.5" />
        ) : (
          <Film className="w-8 h-8 text-[#E50914]/60 mb-2" />
        )}
        <span className="text-xs font-medium text-white/75 line-clamp-2 max-w-[16ch]">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-[#141414] ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 bg-[#181818] animate-pulse" aria-hidden="true" />
      )}
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};
