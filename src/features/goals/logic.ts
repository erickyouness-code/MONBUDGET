/**
 * Règles des objectifs d'épargne (pures, testées).
 */

const DAY = 86_400_000;

/** Nombre de jours entiers entre deux dates AAAA-MM-JJ (b − a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((toUtc(b) - toUtc(a)) / DAY);
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

export function progressOf(savedMinor: number, targetMinor: number) {
  const remainingMinor = Math.max(targetMinor - savedMinor, 0);
  return {
    ratio: targetMinor > 0 ? savedMinor / targetMinor : 0,
    percent: targetMinor > 0 ? Math.floor((savedMinor / targetMinor) * 100) : 0,
    remainingMinor,
    reached: savedMinor >= targetMinor,
  };
}

const ceilTo = (value: number, unit: number) => Math.ceil(value / unit) * unit;

export type Plan =
  | { kind: 'reached' }
  | { kind: 'noDeadline' }
  | { kind: 'overdue'; daysLate: number }
  | { kind: 'plan'; daysLeft: number; perMonthMinor: number; perWeekMinor: number };

/**
 * Combien mettre de côté pour atteindre l'objectif à temps.
 * Arrondi vers le HAUT à l'unité de la devise (pour ne pas finir juste en dessous).
 */
export function planContributions(
  remainingMinor: number,
  todayIso: string,
  targetDate: string | null,
  unit: number,
): Plan {
  if (remainingMinor <= 0) return { kind: 'reached' };
  if (!targetDate) return { kind: 'noDeadline' };
  const daysLeft = daysBetween(todayIso, targetDate);
  if (daysLeft < 0) return { kind: 'overdue', daysLate: -daysLeft };
  const days = Math.max(daysLeft, 1);
  const months = Math.max(1, Math.ceil(days / 30.4375));
  const weeks = Math.max(1, Math.ceil(days / 7));
  return {
    kind: 'plan',
    daysLeft,
    perMonthMinor: ceilTo(remainingMinor / months, unit),
    perWeekMinor: ceilTo(remainingMinor / weeks, unit),
  };
}

/** En dessous de 14 jours d'historique, on ne se risque pas à estimer. */
export const MIN_HISTORY_DAYS = 14;

/**
 * ESTIMATION de la date d'atteinte au rythme des 90 derniers jours
 * (montant de départ exclu). Null si pas assez d'historique ou aucun rythme.
 */
export function estimateCompletion(
  remainingMinor: number,
  savedLast90Minor: number,
  createdOn: string,
  todayIso: string,
): string | null {
  if (remainingMinor <= 0) return todayIso;
  const history = Math.min(90, daysBetween(createdOn, todayIso) + 1);
  if (history < MIN_HISTORY_DAYS || savedLast90Minor <= 0) return null;
  const perDay = savedLast90Minor / history;
  return addDaysIso(todayIso, Math.ceil(remainingMinor / perDay));
}

export type GoalStatus = 'reached' | 'onTrack' | 'behind' | 'overdue' | 'unknown';

/** Situation de l'objectif, pour un badge clair. */
export function goalStatus(plan: Plan, estimate: string | null, targetDate: string | null): GoalStatus {
  if (plan.kind === 'reached') return 'reached';
  if (plan.kind === 'overdue') return 'overdue';
  if (!targetDate || !estimate) return 'unknown';
  return estimate <= targetDate ? 'onTrack' : 'behind';
}
