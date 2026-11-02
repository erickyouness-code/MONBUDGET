import { ArrowLeftRight } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAccounts } from '@/features/accounts/api';
import { useCategories } from '@/features/categories/api';
import { categoryIcon, categoryLabel } from '@/features/categories/meta';
import { useGoals } from '@/features/goals/api';
import { useCompletions, useScheduledItems } from '@/features/schedule/api';
import { upcoming } from '@/features/schedule/logic';
import { KIND_ICONS } from '@/features/schedule/meta';
import { toISODate , summarize } from '@/features/transactions/logic';
import { useCurrency } from '@/features/profile/api';
import { useMonthlyOverview, useRecentTransactions, useTransactionsInRange } from '@/features/transactions/api';
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
  const goals = useGoals();
  const scheduled = useScheduledItems();
  const completions = useCompletions();

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
      savingsGoal: featuredGoal(goals.data),
      upcoming: nextOccurrences(scheduled.data, completions.data),
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
    goals.data,
    scheduled.data,
    completions.data,
  ]);
}

/** Les 4 prochaines échéances non réglées (retards d'abord). */
function nextOccurrences(
  items: ReturnType<typeof useScheduledItems>['data'],
  completions: ReturnType<typeof useCompletions>['data'],
): DashboardData['upcoming'] {
  if (!items || !completions) return [];
  const g = upcoming(items, completions, toISODate(new Date()));
  return [...g.overdue, ...g.today, ...g.week, ...g.later].slice(0, 4).map((o) => ({
    id: `${o.item.id}|${o.dueOn}`,
    itemId: o.item.id,
    title: o.item.title,
    icon: KIND_ICONS[o.item.kind],
    amountMinor: o.item.amount_minor,
    dueOn: o.dueOn,
    income: o.item.kind === 'income',
    overdue: o.state === 'overdue',
  }));
}

/** Objectif à mettre en avant : non atteint, échéance la plus proche (sinon le plus récent). */
function featuredGoal(goals: ReturnType<typeof useGoals>['data']): DashboardData['savingsGoal'] {
  const open = (goals ?? []).filter((g) => !g.is_archived && g.savedMinor < g.target_minor);
  const pool = open.length > 0 ? open : (goals ?? []).filter((g) => !g.is_archived);
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => {
    if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date);
    if (a.target_date) return -1;
    if (b.target_date) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
  const g = sorted[0]!;
  return { name: g.name, targetMinor: g.target_minor, currentMinor: g.savedMinor };
}
