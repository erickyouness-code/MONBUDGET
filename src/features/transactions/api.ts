import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { accountsKey } from '@/features/accounts/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/shared/lib/supabase';

import { monthRange, searchPattern } from './logic';
import type { Transaction, TransactionType, TransactionWrite } from './types';

const COLUMNS =
  'id, type, amount_minor, occurred_on, account_id, to_account_id, category_id, payment_method, description, created_at';
export const PAGE_SIZE = 50;

export const transactionsKey = ['transactions'] as const;

export type TransactionFilters = {
  search: string;
  type: TransactionType | 'all';
  /** Catégories dont le nom (traduit) correspond à la recherche. */
  matchingCategoryIds: string[];
};

function normalize(row: Transaction): Transaction {
  return { ...row, amount_minor: Number(row.amount_minor) };
}

/** Historique paginé (50 par page), du plus récent au plus ancien. */
export function useTransactionList(filters: TransactionFilters) {
  const { session } = useAuth();
  return useInfiniteQuery({
    queryKey: [...transactionsKey, 'list', filters],
    enabled: !!session,
    initialPageParam: 0,
    getNextPageParam: (last: Transaction[], all) => (last.length === PAGE_SIZE ? all.length : undefined),
    queryFn: async ({ pageParam }): Promise<Transaction[]> => {
      let query = supabase
        .from('transactions')
        .select(COLUMNS)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .range(pageParam * PAGE_SIZE, pageParam * PAGE_SIZE + PAGE_SIZE - 1);

      if (filters.type !== 'all') query = query.eq('type', filters.type);

      const pattern = searchPattern(filters.search);
      if (pattern) {
        const parts = [`description.ilike.${pattern}`];
        if (filters.matchingCategoryIds.length) parts.push(`category_id.in.(${filters.matchingCategoryIds.join(',')})`);
        query = query.or(parts.join(','));
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as Transaction[]).map(normalize);
    },
  });
}

/** Les N dernières transactions (tableau de bord). */
export function useRecentTransactions(limit = 4) {
  const { session } = useAuth();
  return useQuery({
    queryKey: [...transactionsKey, 'recent', limit],
    enabled: !!session,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select(COLUMNS)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as Transaction[]).map(normalize);
    },
  });
}

/** Revenus et dépenses du mois en cours (les transferts sont exclus). */
export function useMonthTransactions(date = new Date()) {
  const { session } = useAuth();
  const { from, to } = monthRange(date);
  return useQuery({
    queryKey: [...transactionsKey, 'month', from],
    enabled: !!session,
    queryFn: async (): Promise<Pick<Transaction, 'type' | 'amount_minor' | 'category_id'>[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('type, amount_minor, category_id')
        .in('type', ['expense', 'income'])
        .gte('occurred_on', from)
        .lte('occurred_on', to)
        .range(0, 9999);
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, amount_minor: Number(r.amount_minor) })) as Pick<
        Transaction,
        'type' | 'amount_minor' | 'category_id'
      >[];
    },
  });
}

export function useTransaction(id: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: [...transactionsKey, 'one', id],
    enabled: !!session && !!id,
    queryFn: async (): Promise<Transaction> => {
      const { data, error } = await supabase.from('transactions').select(COLUMNS).eq('id', id!).single();
      if (error) throw error;
      return normalize(data as Transaction);
    },
  });
}

/** Après chaque modification : l'historique ET les soldes des comptes sont rafraîchis. */
function useInvalidateMoney() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: transactionsKey }),
      client.invalidateQueries({ queryKey: accountsKey }),
    ]);
}

export function useSaveTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async ({ id, ...row }: TransactionWrite & { id?: string }) => {
      const { error } = id
        ? await supabase.from('transactions').update(row).eq('id', id)
        : await supabase.from('transactions').insert(row);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
