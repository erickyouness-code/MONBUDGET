/**
 * Périodes demandées par l'IA, résolues ici en dates exactes (AAAA-MM-JJ).
 * L'IA ne calcule jamais de dates elle-même.
 */
export const PERIODS = [
  'today',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'last_7_days',
  'last_30_days',
  'last_3_months',
  'this_year',
  'custom',
] as const;
export type PeriodName = (typeof PERIODS)[number];
export type Range = { start: string; end: string };

const pad = (n: number) => String(n).padStart(2, '0');
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const make = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = parts(a);
  const [yb, mb, db] = parts(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** Premier jour du mois décalé de `delta` mois. */
export function monthStart(iso: string, delta = 0): string {
  const [y, m] = parts(iso);
  const total = m - 1 + delta;
  return make(y + Math.floor(total / 12), (((total % 12) + 12) % 12) + 1, 1);
}

export function monthEnd(iso: string): string {
  const [y, m] = parts(iso);
  return make(y, m, daysInMonth(y, m));
}

/** Même jour, `delta` mois plus tôt/tard (le 31 devient le dernier jour du mois). */
export function shiftMonths(iso: string, delta: number): string {
  const [, , d] = parts(iso);
  const start = monthStart(iso, delta);
  const [y, m] = parts(start);
  return make(y, m, Math.min(d, daysInMonth(y, m)));
}

/** Date du jour dans le fuseau de l'utilisateur. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const TIME_ZONES: Record<string, string> = { MA: 'Africa/Casablanca', GA: 'Africa/Libreville' };

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = parts(value);
  return y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Lundi de la semaine (semaine du lundi au dimanche). */
function weekStart(iso: string): string {
  const [y, m, d] = parts(iso);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

export const MAX_RANGE_DAYS = 366;

/**
 * Période et période précédente comparable :
 * - "ce mois-ci" (jusqu'à aujourd'hui) se compare au début du mois dernier, au même jour ;
 * - une période complète se compare à la période complète précédente.
 */
export function resolvePeriod(
  input: { period?: unknown; start_date?: unknown; end_date?: unknown },
  today: string,
): { range: Range; previous: Range } | { error: string } {
  const period = (input.period ?? 'this_month') as PeriodName;
  switch (period) {
    case 'today':
      return { range: { start: today, end: today }, previous: { start: addDays(today, -1), end: addDays(today, -1) } };
    case 'this_week': {
      const start = weekStart(today);
      return { range: { start, end: today }, previous: { start: addDays(start, -7), end: addDays(today, -7) } };
    }
    case 'last_week': {
      const start = addDays(weekStart(today), -7);
      return { range: { start, end: addDays(start, 6) }, previous: { start: addDays(start, -7), end: addDays(start, -1) } };
    }
    case 'this_month': {
      const start = monthStart(today);
      return { range: { start, end: today }, previous: { start: monthStart(today, -1), end: shiftMonths(today, -1) } };
    }
    case 'last_month': {
      const start = monthStart(today, -1);
      return { range: { start, end: monthEnd(start) }, previous: { start: monthStart(today, -2), end: monthEnd(monthStart(today, -2)) } };
    }
    case 'last_7_days':
    case 'last_30_days': {
      const n = period === 'last_7_days' ? 7 : 30;
      const start = addDays(today, -(n - 1));
      return { range: { start, end: today }, previous: { start: addDays(start, -n), end: addDays(start, -1) } };
    }
    case 'last_3_months': {
      const start = monthStart(today, -3);
      return { range: { start, end: addDays(monthStart(today), -1) }, previous: { start: monthStart(today, -6), end: addDays(start, -1) } };
    }
    case 'this_year': {
      const [y] = parts(today);
      const start = make(y, 1, 1);
      return { range: { start, end: today }, previous: { start: make(y - 1, 1, 1), end: shiftMonths(today, -12) } };
    }
    case 'custom': {
      const { start_date: s, end_date: e } = input;
      if (!isIsoDate(s) || !isIsoDate(e)) return { error: 'custom period needs valid start_date and end_date (YYYY-MM-DD)' };
      if (s > e) return { error: 'start_date must be before end_date' };
      if (s > today) return { error: 'the period is in the future: no recorded data yet' };
      const end = e > today ? today : e;
      const len = daysBetween(s, end) + 1;
      if (len > MAX_RANGE_DAYS) return { error: `period too long (max ${MAX_RANGE_DAYS} days)` };
      return { range: { start: s, end }, previous: { start: addDays(s, -len), end: addDays(s, -1) } };
    }
    default:
      return { error: `unknown period "${String(period)}"` };
  }
}
