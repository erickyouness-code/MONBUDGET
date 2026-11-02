import type { LucideIcon } from 'lucide-react-native';

import type { CurrencyCode } from '@/shared/config/currencies';
import type { YearMonth } from '@/shared/lib/dates';

import type { ComparisonRanges } from './logic';

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
 * Tout ce qu'affiche le tableau de bord pour un mois donné.
 * Vient de vos transactions (calculs faits par la base), ou d'exemples
 * clairement signalés en mode démonstration.
 */
export type DashboardData = {
  currency: CurrencyCode;
  isDemo: boolean;
  /** Première requête encore en cours (aucun chiffre à afficher). */
  isLoading: boolean;
  comparison: ComparisonRanges;
  /** Somme des soldes des comptes actifs (null : aucun compte). */
  totalBalanceMinor: number | null;
  accountsCount: number;
  incomeMinor: number;
  expensesMinor: number;
  /** Mêmes totaux sur la période de comparaison. */
  previousIncomeMinor: number;
  previousExpensesMinor: number;
  /** Solde total en fin de mois, sur 6 mois. */
  balanceHistory: { month: YearMonth; balanceMinor: number }[];
  /** Revenus et dépenses par mois, sur 6 mois. */
  monthly: { month: YearMonth; incomeMinor: number; expensesMinor: number }[];
  expensesByCategory: { id: string; label: string; amountMinor: number }[];
  /** Objectif mis en avant : le plus proche de son échéance parmi ceux non atteints. */
  savingsGoal: { name: string; targetMinor: number; currentMinor: number } | null;
  /** Prochaines échéances du calendrier (retards en premier). */
  upcoming: {
    id: string;
    title: string;
    icon: LucideIcon;
    /** null pour un simple rappel. */
    amountMinor: number | null;
    dueOn: string;
    income: boolean;
    overdue: boolean;
    /** Présent pour une vraie échéance (ouvre sa fiche). */
    itemId?: string;
  }[];
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
