import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import type { Account, AccountType, AccountWithBalance } from '@/features/transactions/types';
import type { CurrencyCode } from '@/shared/config/currencies';
import { supabase } from '@/shared/lib/supabase';

const COLUMNS = 'id, name, type, currency_code, initial_balance_minor, is_archived, created_at';

export const accountsKey = ['accounts'] as const;

/** Comptes de l'utilisateur avec leur solde calculé par la base. */
export function useAccounts() {
  const { session } = useAuth();
  return useQuery({
    queryKey: accountsKey,
    enabled: !!session,
    queryFn: async (): Promise<AccountWithBalance[]> => {
      const [accounts, balances] = await Promise.all([
        supabase.from('accounts').select(COLUMNS).order('created_at'),
        supabase.from('account_balances').select('account_id, balance_minor'),
      ]);
      if (accounts.error) throw accounts.error;
      if (balances.error) throw balances.error;
      const byId = new Map((balances.data ?? []).map((b) => [b.account_id as string, Number(b.balance_minor)]));
      return (accounts.data as Account[]).map((a) => ({
        ...a,
        initial_balance_minor: Number(a.initial_balance_minor),
        balance_minor: byId.get(a.id) ?? Number(a.initial_balance_minor),
      }));
    },
  });
}

export type AccountInput = {
  name: string;
  type: AccountType;
  currency_code: CurrencyCode;
  initial_balance_minor: number;
};

export function useSaveAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: AccountInput & { id?: string }) => {
      const query = id
        ? supabase.from('accounts').update(input).eq('id', id)
        : supabase.from('accounts').insert(input);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: accountsKey }),
  });
}

export function useArchiveAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('accounts').update({ is_archived: archived }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: accountsKey }),
  });
}

/** Supprime un compte. Échoue (code 23503) s'il contient des transactions : il faut alors l'archiver. */
export function useDeleteAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('accounts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: accountsKey }),
  });
}

/** Erreur « compte encore utilisé par des transactions » (clé étrangère). */
export function isInUseError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23503';
}
