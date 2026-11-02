import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { cancelAllReminders } from '@/shared/lib/notifications';
import { queryClient } from '@/shared/lib/queryClient';
import { isSupabaseConfigured, supabase } from '@/shared/lib/supabase';

type AuthState = {
  session: Session | null;
  /** true tant qu'on relit la session enregistrée sur le téléphone. */
  initializing: boolean;
  /**
   * Pendant la réinitialisation du mot de passe, Supabase ouvre une session
   * avant que le nouveau mot de passe soit enregistré. On « retient » alors la
   * navigation pour rester sur l'écran jusqu'à la fin de l'opération.
   */
  navigationHeld: boolean;
  setNavigationHeld: (held: boolean) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(isSupabaseConfigured);
  const [navigationHeld, setNavigationHeld] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setInitializing(false));

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // Déconnexion : on vide le cache pour ne rien laisser de l'ancien compte.
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
        // Plus aucun rappel du compte précédent sur ce téléphone.
        void cancelAllReminders();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () => ({ session, initializing, navigationHeld, setNavigationHeld }),
    [session, initializing, navigationHeld],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
