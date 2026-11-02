import type { TFunction } from 'i18next';

import { CURRENCIES, type CurrencyCode } from '@/shared/config/currencies';
import { lastMonths, toYearMonth } from '@/shared/lib/dates';

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

export function buildDemoDashboard(currency: CurrencyCode, t: TFunction, now = new Date()): DashboardData {
  const a = (v: number) => amount(v, currency);
  const history = [4200, 3600, 6500, 5800, 8700, 10450];

  return {
    currency,
    isDemo: true,
    incomeMinor: a(12300),
    expensesMinor: a(9250),
    balanceHistory: lastMonths(6, now).map((month, i) => ({ month, balanceMinor: a(history[i] ?? 0) })),
    expensesByCategory: [
      { key: 'food', amountMinor: a(3400) },
      { key: 'housing', amountMinor: a(2800) },
      { key: 'transport', amountMinor: a(1250) },
      { key: 'bills', amountMinor: a(950) },
      { key: 'leisure', amountMinor: a(550) },
      { key: 'other', amountMinor: a(300) },
    ],
    savingsGoal: { name: t('demo.goalName'), targetMinor: a(50000), currentMinor: a(30000) },
    subscriptions: [
      { id: 's1', name: t('demo.video'), icon: 'video', amountMinor: a(120), dayOfMonth: 5 },
      { id: 's2', name: t('demo.music'), icon: 'music', amountMinor: a(60), dayOfMonth: 12 },
      { id: 's3', name: t('demo.internet'), icon: 'internet', amountMinor: a(349), dayOfMonth: 20 },
    ],
    recentTransactions: [
      { id: 't1', label: t('demo.supermarket'), icon: 'food', amountMinor: -a(350), date: daysAgo(0, now) },
      { id: 't2', label: t('demo.online'), icon: 'shopping', amountMinor: -a(1200), date: daysAgo(1, now) },
      { id: 't3', label: t('demo.cafe'), icon: 'cafe', amountMinor: -a(25), date: daysAgo(1, now) },
      { id: 't4', label: t('demo.salary'), icon: 'salary', amountMinor: a(12300), date: daysAgo(3, now) },
    ],
  };
}

export function emptyDashboard(currency: CurrencyCode): DashboardData {
  return {
    currency,
    isDemo: false,
    incomeMinor: 0,
    expensesMinor: 0,
    balanceHistory: [],
    expensesByCategory: [],
    savingsGoal: null,
    subscriptions: [],
    recentTransactions: [],
  };
}
