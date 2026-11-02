import type { TFunction } from 'i18next';

import { CURRENCIES, type CurrencyCode } from '@/shared/config/currencies';
import { lastMonths, toYearMonth } from '@/shared/lib/dates';

import { ICONS } from './icons';
import type { ComparisonRanges } from './logic';
import type { DashboardData } from './types';

/**
 * Données D'EXEMPLE pour le mode démonstration uniquement.
 * Elles ne sont jamais enregistrées et l'écran affiche une bannière
 * « Données d'exemple » tant qu'elles sont visibles.
 */

// Montants de référence en dirhams ; convertis approximativement pour le FCFA.
const XAF_PER_MAD = 60;

function amount(dirhams: number, currency: CurrencyCode): number {
  if (currency === 'MAD') return dirhams * 10 ** CURRENCIES.MAD.decimals;
  return Math.round((dirhams * XAF_PER_MAD) / 50) * 50;
}

function daysAgo(n: number, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
  return `${toYearMonth(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildDemoDashboard(
  currency: CurrencyCode,
  t: TFunction,
  comparison: ComparisonRanges,
  month: Date,
  now = new Date(),
): DashboardData {
  const a = (v: number) => amount(v, currency);
  const history = [4200, 3600, 6500, 5800, 8700, 10450];
  const incomes = [11800, 11800, 12300, 11800, 12300, 12300];
  const expenses = [10900, 12400, 9400, 12500, 9400, 9250];
  const months = lastMonths(6, month);

  return {
    currency,
    isDemo: true,
    isLoading: false,
    comparison,
    totalBalanceMinor: a(10450),
    accountsCount: 3,
    incomeMinor: a(12300),
    expensesMinor: a(9250),
    previousIncomeMinor: a(11800),
    previousExpensesMinor: a(10100),
    balanceHistory: months.map((m, i) => ({ month: m, balanceMinor: a(history[i] ?? 0) })),
    monthly: months.map((m, i) => ({ month: m, incomeMinor: a(incomes[i] ?? 0), expensesMinor: a(expenses[i] ?? 0) })),
    expensesByCategory: [
      { id: 'food', label: t('categories.food'), amountMinor: a(3400) },
      { id: 'housing', label: t('categories.housing'), amountMinor: a(2800) },
      { id: 'transport', label: t('categories.transport'), amountMinor: a(1250) },
      { id: 'bills', label: t('categories.bills'), amountMinor: a(950) },
      { id: 'leisure', label: t('categories.leisure'), amountMinor: a(550) },
      { id: 'other', label: t('categories.other'), amountMinor: a(300) },
    ],
    savingsGoal: { name: t('demo.goalName'), targetMinor: a(50000), currentMinor: a(30000) },
    subscriptions: [
      { id: 's1', name: t('demo.video'), icon: ICONS.video, amountMinor: a(120), dayOfMonth: 5 },
      { id: 's2', name: t('demo.music'), icon: ICONS.music, amountMinor: a(60), dayOfMonth: 12 },
      { id: 's3', name: t('demo.internet'), icon: ICONS.internet, amountMinor: a(349), dayOfMonth: 20 },
    ],
    recentTransactions: [
      { id: 't1', label: t('demo.supermarket'), icon: ICONS.food, amountMinor: -a(350), date: daysAgo(0, now) },
      { id: 't2', label: t('demo.online'), icon: ICONS.shopping, amountMinor: -a(1200), date: daysAgo(1, now) },
      { id: 't3', label: t('demo.cafe'), icon: ICONS.cafe, amountMinor: -a(25), date: daysAgo(1, now) },
      { id: 't4', label: t('demo.salary'), icon: ICONS.salary, amountMinor: a(12300), date: daysAgo(3, now) },
    ],
  };
}
