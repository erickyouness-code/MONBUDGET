import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { authStorage } from './secureStorage';

/**
 * Client Supabase unique de l'application.
 *
 * Les deux valeurs ci-dessous sont PUBLIQUES par conception : la clé « anon »
 * ne donne accès qu'à ce que les règles RLS autorisent. La clé secrète
 * « service_role » ne doit JAMAIS apparaître dans l'application.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = url.startsWith('https://') && anonKey.length > 20;

// Garde-fou : refuse une clé service_role collée par erreur.
function looksLikeServiceRoleKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(atob(key.split('.')[1] ?? '')) as { role?: string };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

if (looksLikeServiceRoleKey(anonKey)) {
  throw new Error(
    'Clé Supabase dangereuse : EXPO_PUBLIC_SUPABASE_ANON_KEY contient la clé secrète « service_role ». Utilisez la clé publique « anon ».',
  );
}

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? url : 'https://not-configured.invalid',
  isSupabaseConfigured ? anonKey : 'not-configured',
  {
    auth: {
      storage: authStorage,
      storageKey: 'monbudget.auth',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Sur mobile, on ne rafraîchit la session que lorsque l'application est au premier plan.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
