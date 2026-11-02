import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/features/auth/AuthProvider';
import { categoriesKey } from '@/features/categories/api';
import { categoryLabel } from '@/features/categories/meta';
import { transactionsKey } from '@/features/transactions/api';
import { toISODate } from '@/features/transactions/logic';
import type { Category } from '@/features/transactions/types';
import { supabase } from '@/shared/lib/supabase';
import { useToast } from '@/shared/store/toast';

import { crossedAlerts, usedPercent, type BudgetStatus } from './logic';

/** Clé rangée sous « transactions » : rafraîchie après chaque dépense. */
export const budgetKey = (month: string) => [...transactionsKey, 'budgets', month] as const;

/** Premier jour du mois, au format AAAA-MM-JJ. */
export const monthStart = (d = new Date()) => toISODate(new Date(d.getFullYear(), d.getMonth(), 1));

async function fetchBudgetStatus(month: string): Promise<BudgetStatus[]> {
  const { data, error } = await supabase.rpc('budget_status', { p_month: month });
  if (error) throw error;
  return ((data ?? []) as { category_id: string | null; limit_minor: number; alert_threshold_pct: number; spent_minor: number }[]).map((r) => ({
    categoryId: r.category_id,
    limitMinor: Number(r.limit_minor),
    thresholdPct: Number(r.alert_threshold_pct),
    spentMinor: Number(r.spent_minor),
  }));
}

/** Budgets en vigueur pour un mois, avec ce qui a été dépensé. */
export function useBudgetStatus(month = monthStart()) {
  const { session } = useAuth();
  return useQuery({
    queryKey: budgetKey(month),
    enabled: !!session,
    queryFn: () => fetchBudgetStatus(month),
  });
}

/** Définit (ou retire, avec limitMinor null) un budget à partir du mois en cours. */
export function useSetBudget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { categoryId: string | null; limitMinor: number | null; thresholdPct: number }) => {
      const { error } = await supabase.rpc('set_budget', {
        p_category_id: input.categoryId,
        p_limit_minor: input.limitMinor,
        p_threshold_pct: input.thresholdPct,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...transactionsKey, 'budgets'] });
    },
  });
}

function labelFor(client: QueryClient, categoryId: string | null, t: TFunction): string {
  if (categoryId === null) return t('budgets.global');
  const categories = client.getQueryData<Category[]>(categoriesKey) ?? [];
  return categoryLabel(categories.find((c) => c.id === categoryId), t);
}

/**
 * Alertes de budget après une dépense :
 *  1. `snapshot()` avant l'enregistrement (état connu des budgets) ;
 *  2. `check(before)` après : si un budget passe en alerte ou en dépassement,
 *     un message s'affiche. Rien n'est bloquant : en cas de souci réseau,
 *     on n'affiche simplement rien.
 */
export function useBudgetAlerts() {
  const client = useQueryClient();
  const { t } = useTranslation();
  const show = useToast((s) => s.show);
  const month = monthStart();

  const snapshot = async (): Promise<BudgetStatus[] | null> => {
    const cached = client.getQueryData<BudgetStatus[]>(budgetKey(month));
    if (cached) return cached;
    try {
      return await client.fetchQuery({ queryKey: budgetKey(month), queryFn: () => fetchBudgetStatus(month) });
    } catch {
      return null;
    }
  };

  const check = async (before: BudgetStatus[] | null) => {
    if (!before || before.length === 0) return;
    try {
      const after = await client.fetchQuery({ queryKey: budgetKey(month), queryFn: () => fetchBudgetStatus(month), staleTime: 0 });
      const first = crossedAlerts(before, after)[0];
      if (!first) return;
      const name = labelFor(client, first.status.categoryId, t as unknown as TFunction);
      const percent = usedPercent(first.status);
      show({
        tone: first.level === 'exceeded' ? 'error' : 'warning',
        title: first.level === 'exceeded' ? t('budgets.alertExceededTitle') : t('budgets.alertWarningTitle'),
        message:
          first.level === 'exceeded'
            ? t('budgets.alertExceeded', { name, percent })
            : t('budgets.alertWarning', { name, percent }),
        href: '/budgets',
      });
    } catch {
      // Pas d'alerte si le réseau ne répond pas : la dépense, elle, est bien enregistrée.
    }
  };

  return { snapshot, check, month };
}
