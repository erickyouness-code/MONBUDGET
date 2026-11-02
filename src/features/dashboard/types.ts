import type { LucideIcon } from 'lucide-react-native';

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
  expensesByCategory: { id: string; label: string; amountMinor: number }[];
  savingsGoal: { name: string; targetMinor: number; currentMinor: number } | null;
  subscriptions: { id: string; name: string; icon: LucideIcon; amountMinor: number; dayOfMonth: number }[];
  recentTransactions: {
    id: string;
    label: string;
    icon: LucideIcon;
    /** Signé : négatif pour une dépense, positif pour un revenu. */
    amountMinor: number;
    date: string;
    /** Transfert : affiché sans signe ni couleur. */
    neutral?: boolean;
    /** Présent pour une vraie transaction (ouvre sa fiche). */
    transactionId?: string;
  }[];
};
