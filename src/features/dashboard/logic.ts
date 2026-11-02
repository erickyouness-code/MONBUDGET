import { toISODate } from '@/features/transactions/logic';

/**
 * Règles du tableau de bord (pures, testées).
 */

export type Range = { from: string; to: string };

export type ComparisonRanges = {
  current: Range;
  previous: Range;
  /**
   * 'samePeriod' : mois en cours, comparé à la même période du mois précédent
   *                (ex. du 1er au 12 novembre vs du 1er au 12 octobre).
   * 'fullMonth'  : mois passé, comparé au mois complet précédent.
   */
  mode: 'samePeriod' | 'fullMonth';
};

const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const lastOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

/** Périodes à comparer pour le mois affiché. */
export function comparisonRanges(month: Date, today = new Date()): ComparisonRanges {
  const start = firstOfMonth(month);
  const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  const isCurrent = start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth();

  if (!isCurrent) {
    return {
      current: { from: toISODate(start), to: toISODate(lastOfMonth(start)) },
      previous: { from: toISODate(prevStart), to: toISODate(lastOfMonth(prevStart)) },
      mode: 'fullMonth',
    };
  }

  // Même nombre de jours, sans dépasser la fin du mois précédent (31 mars → 28/29 février).
  const day = Math.min(today.getDate(), lastOfMonth(prevStart).getDate());
  return {
    current: { from: toISODate(start), to: toISODate(today) },
    previous: { from: toISODate(prevStart), to: toISODate(new Date(prevStart.getFullYear(), prevStart.getMonth(), day)) },
    mode: 'samePeriod',
  };
}

export type Change = {
  /** Variation en % arrondie, ou null si le mois précédent est vide (pas de comparaison possible). */
  percent: number | null;
  direction: 'up' | 'down' | 'flat';
};

/** Variation entre deux montants. On n'invente jamais de % quand la base est nulle. */
export function computeChange(current: number, previous: number): Change {
  if (previous === 0) return { percent: null, direction: current > 0 ? 'up' : 'flat' };
  const percent = Math.round(((current - previous) / previous) * 100);
  return { percent, direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat' };
}

/** Part des revenus mise de côté (en %). Null sans revenus. */
export function savingsRate(incomeMinor: number, expensesMinor: number): number | null {
  if (incomeMinor <= 0) return null;
  return Math.round(((incomeMinor - expensesMinor) / incomeMinor) * 100);
}

/** Peut-on avancer d'un mois ? (pas au-delà du mois en cours) */
export function canGoForward(month: Date, today = new Date()): boolean {
  return firstOfMonth(month) < firstOfMonth(today);
}

export function shiftMonth(month: Date, delta: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}
