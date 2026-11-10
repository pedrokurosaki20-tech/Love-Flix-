/**
 * Avatares temáticos elegantes e 100% autossuficientes no padrão visual Love Flix.
 * Utilizam data URIs em SVG de altíssima definição para carregamento instantâneo,
 * sem requisições externas e sem risco de imagem quebrada.
 */

export interface AvatarOption {
  id: string;
  name: string;
  category: string;
  accentColor: string;
  src: string;
}

export const LOVEFLIX_PRESET_AVATARS: AvatarOption[] = [
  {
    id: 'cinephile-crimson',
    name: 'Cinéfilo Carmesim',
    category: 'Cinema',
    accentColor: '#E50914',
    src: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23E50914"/><stop offset="100%" stop-color="%23670005"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(%23g1)"/><circle cx="60" cy="50" r="22" fill="%23FFFFFF"/><path d="M26 102c0-18.778 15.222-34 34-34s34 15.222 34 34v6H26v-6z" fill="%23FFFFFF"/><circle cx="53" cy="48" r="3.5" fill="%23E50914"/><circle cx="67" cy="48" r="3.5" fill="%23E50914"/><path d="M54 58q6 4 12 0" stroke="%23E50914" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>`,
  },
  {
    id: 'director-noir',
    name: 'Diretor Noir',
    category: 'Clássicos',
    accentColor: '#3B82F6',
    src: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%231E3A8A"/><stop offset="100%" stop-color="%230F172A"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(%23g2)"/><circle cx="60" cy="50" r="22" fill="%23E2E8F0"/><path d="M26 102c0-18.778 15.222-34 34-34s34 15.222 34 34v6H26v-6z" fill="%23E2E8F0"/><rect x="42" y="44" width="36" height="10" rx="3" fill="%230F172A"/><circle cx="50" cy="49" r="3" fill="%2338BDF8"/><circle cx="70" cy="49" r="3" fill="%2338BDF8"/></svg>`,
  },
  {
    id: 'anime-neon',
    name: 'Anime & Doramas',
    category: 'Animação',
    accentColor: '#A855F7',
    src: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%239333EA"/><stop offset="100%" stop-color="%233B0764"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(%23g3)"/><circle cx="60" cy="50" r="22" fill="%23FAF5FF"/><path d="M26 102c0-18.778 15.222-34 34-34s34 15.222 34 34v6H26v-6z" fill="%23FAF5FF"/><path d="M48 48l4-6 4 6zM64 48l4-6 4 6z" fill="%239333EA"/><path d="M53 58q7 4 14 0" stroke="%239333EA" stroke-width="2.5" stroke-linecap="round" fill="none"/><polygon points="60,20 63,27 70,28 65,33 66,40 60,36 54,40 55,33 50,28 57,27" fill="%23FBBF24"/></svg>`,
  },
  {
    id: 'scifi-explorer',
    name: 'Explorador Sci-Fi',
    category: 'Ficção',
    accentColor: '#10B981',
    src: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23059669"/><stop offset="100%" stop-color="%23022C22"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(%23g4)"/><circle cx="60" cy="50" r="22" fill="%23ECFDF5"/><path d="M26 102c0-18.778 15.222-34 34-34s34 15.222 34 34v6H26v-6z" fill="%23ECFDF5"/><path d="M42 45h36v8c0 5-4 9-9 9H51c-5 0-9-4-9-9v-8z" fill="%23022C22"/><rect x="46" y="47" width="28" height="4" rx="2" fill="%2334D399"/></svg>`,
  },
  {
    id: 'popcorn-retro',
    name: 'Pipoca Fan',
    category: 'Comédia',
    accentColor: '#F59E0B',
    src: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g5" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23D97706"/><stop offset="100%" stop-color="%23451A03"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(%23g5)"/><circle cx="60" cy="50" r="22" fill="%23FFFBEB"/><path d="M26 102c0-18.778 15.222-34 34-34s34 15.222 34 34v6H26v-6z" fill="%23FFFBEB"/><circle cx="52" cy="46" r="3.5" fill="%23B45309"/><circle cx="68" cy="46" r="3.5" fill="%23B45309"/><path d="M52 56c2 4 12 4 16 0" stroke="%23B45309" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>`,
  },
  {
    id: 'action-flame',
    name: 'Ação & Aventura',
    category: 'Ação',
    accentColor: '#EF4444',
    src: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g6" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23EA580C"/><stop offset="100%" stop-color="%237C2D12"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(%23g6)"/><circle cx="60" cy="50" r="22" fill="%23FFF7ED"/><path d="M26 102c0-18.778 15.222-34 34-34s34 15.222 34 34v6H26v-6z" fill="%23FFF7ED"/><path d="M45 48l8-2-4 5zM75 48l-8-2 4 5z" fill="%23C2410C"/><path d="M52 58h16" stroke="%23C2410C" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'romance-velvet',
    name: 'Romance & Drama',
    category: 'Romance',
    accentColor: '#EC4899',
    src: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g7" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23DB2777"/><stop offset="100%" stop-color="%23700735"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(%23g7)"/><circle cx="60" cy="50" r="22" fill="%23FDF2F8"/><path d="M26 102c0-18.778 15.222-34 34-34s34 15.222 34 34v6H26v-6z" fill="%23FDF2F8"/><circle cx="53" cy="48" r="3.5" fill="%23BE185D"/><circle cx="67" cy="48" r="3.5" fill="%23BE185D"/><path d="M54 58q6 4 12 0" stroke="%23BE185D" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>`,
  },
  {
    id: 'cyber-neon',
    name: 'Cyber & Séries',
    category: 'Séries',
    accentColor: '#06B6D4',
    src: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g8" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%230891B2"/><stop offset="100%" stop-color="%23164E63"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(%23g8)"/><circle cx="60" cy="50" r="22" fill="%23ECFEFF"/><path d="M26 102c0-18.778 15.222-34 34-34s34 15.222 34 34v6H26v-6z" fill="%23ECFEFF"/><circle cx="52" cy="48" r="3.5" fill="%230E7490"/><circle cx="68" cy="48" r="3.5" fill="%230E7490"/><path d="M52 58h16" stroke="%230E7490" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  },
];

export function getDefaultAvatar(index = 0): string {
  const safeIndex = Math.abs(index) % LOVEFLIX_PRESET_AVATARS.length;
  return LOVEFLIX_PRESET_AVATARS[safeIndex].src;
}
