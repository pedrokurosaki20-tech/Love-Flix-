import { createClient } from '@supabase/supabase-js';

const DEFAULT_PUBLIC_SUPABASE_URL = 'https://umginlxnunahennujkan.supabase.co';
const DEFAULT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_VaynvvfK5jIQ4ZJhwFU_fA_uUKYBO5D';

export function normalizeSupabaseUrl(rawUrl?: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/auth\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

const rawEnvUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawEnvKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseUrl =
  normalizeSupabaseUrl(rawEnvUrl) || DEFAULT_PUBLIC_SUPABASE_URL;

export const supabaseAnonKey =
  (rawEnvKey || '').trim() || DEFAULT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;
