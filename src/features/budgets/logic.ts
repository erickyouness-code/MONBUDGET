/**
 * Règles des budgets (pures, testées).
 */

export type BudgetLevel = 'ok' | 'warning' | 'exceeded';

export type BudgetStatus = {
  /** null = budget global (toutes les dépenses du mois). */
  categoryId: string | null;
  limitMinor: number;
  thresholdPct: number;
  spentMinor: number;
};

/** Normal, alerte (seuil atteint) ou dépassé (au-delà du plafond). */
export function budgetLevel(b: Pick<BudgetStatus, 'limitMinor' | 'thresholdPct' | 'spentMinor'>): BudgetLevel {
  if (b.spentMinor > b.limitMinor) return 'exceeded';
  if (b.spentMinor * 100 >= b.limitMinor * b.thresholdPct) return 'warning';
  return 'ok';
}

/** Part consommée, en % arrondi (peut dépasser 100). */
export function usedPercent(b: Pick<BudgetStatus, 'limitMinor' | 'spentMinor'>): number {
  return b.limitMinor > 0 ? Math.round((b.spentMinor / b.limitMinor) * 100) : 0;
}

/** Jours restants dans le mois, aujourd'hui compris. */
export function daysLeftInMonth(today: Date): number {
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return last - today.getDate() + 1;
}

/**
 * Montant qu'on peut encore dépenser par jour sans dépasser le plafond.
 * Arrondi vers le bas à l'unité de la devise (prudence). Null si plus rien.
 */
export function dailyAllowance(limitMinor: number, spentMinor: number, today: Date, unit: number): number | null {
  const remaining = limitMinor - spentMinor;
  if (remaining <= 0) return null;
  const perDay = remaining / daysLeftInMonth(today);
  return Math.floor(perDay / unit) * unit;
}

/**
 * ESTIMATION des dépenses en fin de mois au rythme actuel.
 * Null pendant les 3 premiers jours : trop peu de données pour être utile.
 */
export function projectEndOfMonth(spentMinor: number, today: Date): number | null {
  const day = today.getDate();
  if (day < 3) return null;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return Math.round((spentMinor / day) * daysInMonth);
}

const rank: Record<BudgetLevel, number> = { ok: 0, warning: 1, exceeded: 2 };

/**
 * Budgets dont le niveau s'est aggravé entre deux états (ex. après une
 * nouvelle dépense) : ce sont eux qui déclenchent une alerte.
 */
export function crossedAlerts(before: BudgetStatus[], after: BudgetStatus[]): { status: BudgetStatus; level: BudgetLevel }[] {
  const previous = new Map(before.map((b) => [b.categoryId ?? 'global', budgetLevel(b)]));
  return after
    .map((status) => ({ status, level: budgetLevel(status) }))
    .filter(({ status, level }) => level !== 'ok' && rank[level] > rank[previous.get(status.categoryId ?? 'global') ?? 'ok'])
    // Le plus grave d'abord, puis le budget global avant les catégories.
    .sort((a, b) => rank[b.level] - rank[a.level] || Number(a.status.categoryId !== null) - Number(b.status.categoryId !== null));
}
