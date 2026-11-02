import type { CurrencyCode } from '@/shared/config/currencies';
import type { YearMonth } from '@/shared/lib/dates';

export type ExpenseCategoryKey = 'food' | 'housing' | 'transport' | 'bills' | 'leisure' | 'other';

export type IconKey =
  | 'food'
  | 'housing'
  | 'transport'
  | 'bills'
  | 'leisure'
  | 'other'
  | 'salary'
  | 'cafe'
  | 'shopping'
  | 'video'
  | 'music'
  | 'internet';

/**
 * Tout ce qu'affiche le tableau de bord. À l'étape 3, ces données viendront
 * de calculs SQL sur vos transactions ; pour l'instant elles sont vides
 * (ou d'exemple si le mode démonstration est activé).
 */
export type DashboardData = {
  currency: CurrencyCode;
  isDemo: boolean;
  incomeMinor: number;
  expensesMinor: number;
  balanceHistory: { month: YearMonth; balanceMinor: number }[];
  expensesByCategory: { key: ExpenseCategoryKey; amountMinor: number }[];
  savingsGoal: { name: string; targetMinor: number; currentMinor: number } | null;
  subscriptions: { id: string; name: string; icon: IconKey; amountMinor: number; dayOfMonth: number }[];
  recentTransactions: { id: string; label: string; icon: IconKey; amountMinor: number; date: string }[];
};
