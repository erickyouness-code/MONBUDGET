import { ArrowLeftRight } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useCategories } from '@/features/categories/api';
import { categoryIcon, categoryLabel } from '@/features/categories/meta';
import { useCurrency } from '@/features/profile/api';
import { useMonthTransactions, useRecentTransactions } from '@/features/transactions/api';
import { summarize } from '@/features/transactions/logic';
import { usePreferences } from '@/shared/store/preferences';

import { buildDemoDashboard, emptyDashboard } from './demoData';
import type { DashboardData } from './types';

/** Nombre de catégories affichées dans l'anneau ; les autres sont regroupées. */
const TOP_CATEGORIES = 5;

/**
 * Données du tableau de bord.
 * - Mode démonstration : exemples clairement signalés.
 * - Sinon : vos transactions réelles (mois en cours). La courbe, l'épargne et
 *   les abonnements arriveront aux étapes 3, 5 et 6.
 */
export function useDashboardData(): DashboardData {
  const { t, i18n } = useTranslation();
  const currency = useCurrency();
  const demoMode = usePreferences((s) => s.demoMode);
  const month = useMonthTransactions();
  const recent = useRecentTransactions(4);
  const categories = useCategories();

  return useMemo(() => {
    if (demoMode) return buildDemoDashboard(currency, t);

    const base = emptyDashboard(currency);
    const monthRows = month.data ?? [];
    const { incomeMinor, expensesMinor } = summarize(monthRows);
    const categoryById = new Map((categories.data ?? []).map((c) => [c.id, c]));

    // Dépenses du mois par catégorie, de la plus importante à la plus petite.
    const totals = new Map<string, number>();
    for (const row of monthRows) {
      if (row.type !== 'expense' || !row.category_id) continue;
      totals.set(row.category_id, (totals.get(row.category_id) ?? 0) + row.amount_minor);
    }
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, TOP_CATEGORIES).map(([id, amountMinor]) => ({
      id,
      label: categoryLabel(categoryById.get(id), t),
      amountMinor,
    }));
    const rest = sorted.slice(TOP_CATEGORIES).reduce((sum, [, v]) => sum + v, 0);
    if (rest > 0) top.push({ id: 'rest', label: t('dashboard.otherCategories'), amountMinor: rest });

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

    return { ...base, incomeMinor, expensesMinor, expensesByCategory: top, recentTransactions };
    // i18n.language : recalcule les libellés quand la langue change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, currency, t, i18n.language, month.data, recent.data, categories.data]);
}
