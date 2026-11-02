import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { accountsKey } from '@/features/accounts/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { transactionsKey } from '@/features/transactions/api';
import { toISODate } from '@/features/transactions/logic';
import { supabase } from '@/shared/lib/supabase';

import { addDaysIso, type Completion, type ScheduledItem } from './logic';

export const scheduleKey = ['schedule'] as const;

const ITEM_COLUMNS =
  'id, kind, title, amount_minor, category_id, account_id, frequency, interval_count, start_date, end_date, remind_days_before, is_active, note';

export function useScheduledItems() {
  const { session } = useAuth();
  return useQuery({
    queryKey: [...scheduleKey, 'items'],
    enabled: !!session,
    queryFn: async (): Promise<ScheduledItem[]> => {
      const { data, error } = await supabase.from('scheduled_items').select(ITEM_COLUMNS).order('start_date');
      if (error) throw error;
      return (data as ScheduledItem[]).map((i) => ({ ...i, amount_minor: i.amount_minor === null ? null : Number(i.amount_minor) }));
    },
  });
}

/** Règlements récents (un peu plus d'un an : suffisant pour le calendrier). */
export function useCompletions() {
  const { session } = useAuth();
  return useQuery({
    queryKey: [...scheduleKey, 'completions'],
    enabled: !!session,
    queryFn: async (): Promise<Completion[]> => {
      const { data, error } = await supabase
        .from('scheduled_completions')
        .select('id, item_id, due_on, status, transaction_id')
        .gte('due_on', addDaysIso(toISODate(new Date()), -400));
      if (error) throw error;
      return data as Completion[];
    },
  });
}

/** Rafraîchit le calendrier, et l'historique / les soldes si une transaction a pu être créée. */
function useInvalidate() {
  const client = useQueryClient();
  return (money = false) => {
    void client.invalidateQueries({ queryKey: scheduleKey });
    if (money) {
      void client.invalidateQueries({ queryKey: transactionsKey });
      void client.invalidateQueries({ queryKey: accountsKey });
    }
  };
}

export type ScheduledItemInput = Omit<ScheduledItem, 'id' | 'is_active' | 'note'> & { note?: string | null };

export function useSaveScheduledItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...row }: ScheduledItemInput & { id?: string }) => {
      const { error } = id
        ? await supabase.from('scheduled_items').update(row).eq('id', id)
        : await supabase.from('scheduled_items').insert(row);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteScheduledItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scheduled_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

/** Marque une échéance payée / reçue (crée la transaction) ou ignorée. */
export function useCompleteOccurrence() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { itemId: string; dueOn: string; status: 'paid' | 'skipped'; accountId?: string | null }) => {
      const { error } = await supabase.rpc('complete_occurrence', {
        p_item_id: input.itemId,
        p_due_on: input.dueOn,
        p_status: input.status,
        p_account_id: input.accountId ?? null,
        p_occurred_on: toISODate(new Date()),
      });
      if (error) throw error;
    },
    onSuccess: () => invalidate(true),
  });
}

/** Annule un règlement (et la transaction qu'il avait créée). */
export function useUndoOccurrence() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (completionId: string) => {
      const { error } = await supabase.rpc('undo_occurrence', { p_completion_id: completionId });
      if (error) throw error;
    },
    onSuccess: () => invalidate(true),
  });
}
