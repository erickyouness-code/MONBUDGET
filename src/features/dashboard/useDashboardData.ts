import { ArrowLeftRight } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAccounts } from '@/features/accounts/api';
import { useCategories } from '@/features/categories/api';
import { categoryIcon, categoryLabel } from '@/features/categories/meta';
import { useCurrency } from '@/features/profile/api';
import { useMonthlyOverview, useRecentTransactions, useTransactionsInRange } from '@/features/transactions/api';
import { summarize } from '@/features/transactions/logic';
import { usePreferences } from '@/shared/store/preferences';

import { buildDemoDashboard } from './demoData';
import { comparisonRanges } from './logic';
import type { DashboardData } from './types';

/** Nombre de catégories affichées dans l'anneau ; les autres sont regroupées. */
const TOP_CATEGORIES = 5;

/**
 * Données du tableau de bord pour le mois affiché.
 * - Mode démonstration : exemples clairement signalés.
 * - Sinon : uniquement vos transactions et vos comptes.
 */
export function useDashboardData(month: Date): DashboardData {
  const { t, i18n } = useTranslation();
  const currency = useCurrency();
  const demoMode = usePreferences((s) => s.demoMode);

  const comparison = useMemo(() => comparisonRanges(month), [month]);
  const current = useTransactionsInRange(comparison.current);
  const previous = useTransactionsInRange(comparison.previous);
  const overview = useMonthlyOverview(comparison.current.to, 6);
  const accounts = useAccounts();
  const recent = useRecentTransactions(4);
  const categories = useCategories();

  return useMemo((): DashboardData => {
    if (demoMode) return buildDemoDashboard(currency, t, comparison, month);

    const rows = current.data ?? [];
    const now = summarize(rows);
    const before = summarize(previous.data ?? []);
    const active = (accounts.data ?? []).filter((a) => !a.is_archived);
    const categoryById = new Map((categories.data ?? []).map((c) => [c.id, c]));

    // Dépenses par catégorie, de la plus importante à la plus petite.
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (row.type !== 'expense' || !row.category_id) continue;
      totals.set(row.category_id, (totals.get(row.category_id) ?? 0) + row.amount_minor);
    }
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const expensesByCategory = sorted.slice(0, TOP_CATEGORIES).map(([id, amountMinor]) => ({
      id,
      label: categoryLabel(categoryById.get(id), t),
      amountMinor,
    }));
    const rest = sorted.slice(TOP_CATEGORIES).reduce((sum, [, v]) => sum + v, 0);
    if (rest > 0) expensesByCategory.push({ id: 'rest', label: t('dashboard.otherCategories'), amountMinor: rest });

    // Courbe : on ne montre l'historique qu'à partir du moment où il existe des données.
    const months = overview.data ?? [];
    const firstUseful = months.findIndex((m) => m.endBalanceMinor !== 0 || m.incomeMinor !== 0 || m.expensesMinor !== 0);
    const usefulMonths = firstUseful === -1 ? [] : months.slice(firstUseful);

    const recentTransactions = (recent.data ?? []).map((tx) => {
      const category = tx.category_id ? categoryById.get(tx.category_id) : undefined;
      const isTransfer = tx.type === 'transfer';
      return {
        id: tx.id,
        transactionId: tx.id,
        label: tx.description || (isTransfer ? t('add.transfer') : categoryLabel(category, t)),
        icon: isTransfer ? ArrowLeftRight : categoryIcon(category),
        amountMinor: tx.type === 'expense' ? -tx.amount_minor : tx.amount_minor,
        date: tx.occurred_on,
        neutral: isTransfer,
      };
    });

    return {
      currency,
      isDemo: false,
      isLoading: current.isPending || accounts.isPending,
      comparison,
      totalBalanceMinor: accounts.data ? active.reduce((sum, a) => sum + a.balance_minor, 0) : null,
      accountsCount: active.length,
      incomeMinor: now.incomeMinor,
      expensesMinor: now.expensesMinor,
      previousIncomeMinor: before.incomeMinor,
      previousExpensesMinor: before.expensesMinor,
      // Une courbe n'a de sens qu'avec au moins deux points.
      balanceHistory: usefulMonths.length >= 2 ? usefulMonths.map((m) => ({ month: m.month, balanceMinor: m.endBalanceMinor })) : [],
      monthly: usefulMonths.map((m) => ({ month: m.month, incomeMinor: m.incomeMinor, expensesMinor: m.expensesMinor })),
      expensesByCategory,
      savingsGoal: null, // étape 5
      subscriptions: [], // étape 6
      recentTransactions,
    };
    // i18n.language : recalcule les libellés quand la langue change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    demoMode,
    currency,
    t,
    i18n.language,
    comparison,
    month,
    current.data,
    current.isPending,
    previous.data,
    overview.data,
    accounts.data,
    accounts.isPending,
    recent.data,
    categories.data,
  ]);
}
