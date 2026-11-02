import { useMemo } from 'react';

import { useAccounts } from '@/features/accounts/api';
import { monthStart, useBudgetStatus } from '@/features/budgets/api';
import { useCurrency } from '@/features/profile/api';
import { useCompletions, useScheduledItems } from '@/features/schedule/api';
import { occurrencesBetween } from '@/features/schedule/logic';
import { useAnalysisTransactions } from '@/features/transactions/api';
import { toISODate } from '@/features/transactions/logic';

import { analyze, type Insight } from './engine';

/** Début du 4e mois précédent : l'analyse porte sur 4 mois complets + le mois en cours. */
function analysisStart(today: Date): string {
  return toISODate(new Date(today.getFullYear(), today.getMonth() - 4, 1));
}

/** Analyses du mois en cours, calculées à partir de VOS données uniquement. */
export function useInsights(): { insights: Insight[]; isLoading: boolean; isError: boolean } {
  const now = new Date();
  const today = toISODate(now);
  const currency = useCurrency();
  const transactions = useAnalysisTransactions(analysisStart(now));
  const budgets = useBudgetStatus(monthStart(now));
  const accounts = useAccounts();
  const items = useScheduledItems();
  const completions = useCompletions();

  const insights = useMemo(() => {
    if (!transactions.data) return [];
    const monthFirst = `${today.slice(0, 7)}-01`;
    const monthLast = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    // Échéances du mois pas encore réglées (retards compris).
    let incomeMinor = 0;
    let expenseMinor = 0;
    for (const o of occurrencesBetween(items.data ?? [], completions.data ?? [], monthFirst, monthLast, today)) {
      if (o.state === 'paid' || o.state === 'skipped' || o.item.amount_minor === null) continue;
      if (o.item.kind === 'income') incomeMinor += o.item.amount_minor;
      else expenseMinor += o.item.amount_minor;
    }

    return analyze({
      today,
      currency,
      transactions: transactions.data,
      budgets: budgets.data ?? [],
      totalBalanceMinor: accounts.data ? accounts.data.filter((a) => !a.is_archived).reduce((s, a) => s + a.balance_minor, 0) : null,
      remainingScheduled: items.data && completions.data ? { incomeMinor, expenseMinor } : null,
      calendarEntries: (items.data ?? []).map((i) => ({ title: i.title, amountMinor: i.amount_minor, categoryId: i.category_id })),
    });
    // `now` change à chaque rendu : on dépend de `today`, qui suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions.data, budgets.data, accounts.data, items.data, completions.data, currency, today]);

  return { insights, isLoading: transactions.isPending, isError: transactions.isError };
}
