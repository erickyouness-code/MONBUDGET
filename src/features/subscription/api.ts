import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/shared/lib/supabase';

import { entitlementState, type EntitlementRowLike, type EntitlementState } from './logic';
import { forgetPurchaser, identifyPurchaser } from './purchases';

export const entitlementKey = ['entitlement'] as const;

/** Droit d'accès Premium de l'utilisateur, tel qu'enregistré par le SERVEUR. */
export function useEntitlement() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: [...entitlementKey, session?.user.id],
    enabled: !!session,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<EntitlementState> => {
      const { data, error } = await supabase
        .from('entitlements')
        .select('period_type, expires_at, will_renew, billing_issue, store')
        .maybeSingle();
      if (error) throw error;
      return entitlementState(data as EntitlementRowLike);
    },
  });
  return query;
}

/**
 * Demande au serveur de relire l'état officiel auprès de RevenueCat (après un
 * achat ou une restauration), puis rafraîchit l'écran.
 */
export function useSyncEntitlement() {
  const client = useQueryClient();
  return async () => {
    await supabase.functions.invoke('sync-entitlement', { method: 'POST' }).catch(() => undefined);
    await client.invalidateQueries({ queryKey: entitlementKey });
  };
}

/**
 * À brancher une fois, une fois connecté : associe RevenueCat à l'utilisateur et
 * relit l'abonnement à chaque retour dans l'application (expiration, renouvellement).
 */
export function useSubscriptionLifecycle() {
  const { session } = useAuth();
  const client = useQueryClient();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      void forgetPurchaser();
      return;
    }
    void identifyPurchaser(userId).catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void client.invalidateQueries({ queryKey: entitlementKey });
    });
    return () => sub.remove();
  }, [client]);
}
