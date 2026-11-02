/**
 * Calendrier financier : calcul des échéances (pur, testé).
 * Toutes les dates sont des chaînes AAAA-MM-JJ, sans fuseau horaire.
 */

export type ScheduleKind = 'bill' | 'subscription' | 'income' | 'payment' | 'reminder';
export type Frequency = 'once' | 'weekly' | 'monthly' | 'yearly';

export type ScheduledItem = {
  id: string;
  kind: ScheduleKind;
  title: string;
  amount_minor: number | null;
  category_id: string | null;
  account_id: string | null;
  frequency: Frequency;
  interval_count: number;
  start_date: string;
  end_date: string | null;
  remind_days_before: number | null;
  is_active: boolean;
  note: string | null;
};

export type Completion = {
  id: string;
  item_id: string;
  due_on: string;
  status: 'paid' | 'skipped';
  transaction_id: string | null;
};

const pad = (n: number) => String(n).padStart(2, '0');
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const make = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  const [ya, ma, da] = parts(a);
  const [yb, mb, db] = parts(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** Date de la k-ième échéance (k = 0 : la première). */
function nth(item: Pick<ScheduledItem, 'frequency' | 'interval_count' | 'start_date'>, k: number): string {
  const [y, m, d] = parts(item.start_date);
  const step = item.interval_count * k;
  switch (item.frequency) {
    case 'once':
      return item.start_date;
    case 'weekly':
      return addDaysIso(item.start_date, 7 * step);
    case 'monthly': {
      const total = m - 1 + step;
      const ny = y + Math.floor(total / 12);
      const nm = (total % 12) + 1;
      // Le 31 devient le 30, le 29 ou le 28 selon le mois.
      return make(ny, nm, Math.min(d, daysInMonth(ny, nm)));
    }
    case 'yearly': {
      const ny = y + step;
      return make(ny, m, Math.min(d, daysInMonth(ny, m))); // 29 février → 28 hors années bissextiles
    }
  }
}

/** Toutes les échéances d'un élément entre deux dates (incluses). */
export function occurrences(item: ScheduledItem, from: string, to: string): string[] {
  if (!item.is_active || to < from) return [];
  const last = item.end_date && item.end_date < to ? item.end_date : to;
  if (item.frequency === 'once') return item.start_date >= from && item.start_date <= last ? [item.start_date] : [];

  // Point de départ approximatif pour ne pas parcourir tout l'historique.
  let k = 0;
  if (from > item.start_date) {
    const days = diffDays(item.start_date, from);
    const per = { weekly: 7, monthly: 28, yearly: 365 }[item.frequency] * item.interval_count;
    k = Math.max(0, Math.floor(days / per) - 1);
  }
  const result: string[] = [];
  for (let guard = 0; guard < 1000; guard++, k++) {
    const date = nth(item, k);
    if (date > last) break;
    if (date >= from) result.push(date);
  }
  return result;
}

export type OccurrenceState = 'overdue' | 'today' | 'upcoming' | 'paid' | 'skipped';

export type Occurrence = {
  item: ScheduledItem;
  dueOn: string;
  state: OccurrenceState;
  completion?: Completion;
};

/** Échéances d'une période avec leur état (réglée, ignorée, en retard…). */
export function occurrencesBetween(items: ScheduledItem[], completions: Completion[], from: string, to: string, today: string): Occurrence[] {
  const done = new Map(completions.map((c) => [`${c.item_id}|${c.due_on}`, c]));
  const list: Occurrence[] = [];
  for (const item of items) {
    for (const dueOn of occurrences(item, from, to)) {
      const completion = done.get(`${item.id}|${dueOn}`);
      const state: OccurrenceState = completion
        ? completion.status
        : dueOn < today
          ? 'overdue'
          : dueOn === today
            ? 'today'
            : 'upcoming';
      list.push({ item, dueOn, state, completion });
    }
  }
  return list.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.item.title.localeCompare(b.item.title));
}

export type UpcomingGroups = { overdue: Occurrence[]; today: Occurrence[]; week: Occurrence[]; later: Occurrence[] };

/** Ce qui reste à faire : retards (30 derniers jours), aujourd'hui, 7 prochains jours, ensuite. */
export function upcoming(items: ScheduledItem[], completions: Completion[], today: string, horizonDays = 30): UpcomingGroups {
  const list = occurrencesBetween(items, completions, addDaysIso(today, -30), addDaysIso(today, horizonDays), today);
  const weekEnd = addDaysIso(today, 7);
  return {
    overdue: list.filter((o) => o.state === 'overdue'),
    today: list.filter((o) => o.state === 'today'),
    week: list.filter((o) => o.state === 'upcoming' && o.dueOn <= weekEnd),
    later: list.filter((o) => o.state === 'upcoming' && o.dueOn > weekEnd),
  };
}

export const isIncome = (item: Pick<ScheduledItem, 'kind'>) => item.kind === 'income';

/** Reste à payer et à recevoir sur le mois (échéances non réglées). */
export function monthTotals(items: ScheduledItem[], completions: Completion[], monthStart: string, today: string) {
  const [y, m] = parts(monthStart);
  const end = make(y, m, daysInMonth(y, m));
  let toPay = 0;
  let toReceive = 0;
  for (const o of occurrencesBetween(items, completions, monthStart, end, today)) {
    if (o.state === 'paid' || o.state === 'skipped' || o.item.amount_minor === null) continue;
    if (isIncome(o.item)) toReceive += o.item.amount_minor;
    else toPay += o.item.amount_minor;
  }
  return { toPayMinor: toPay, toReceiveMinor: toReceive };
}

export type PlannedNotification = { key: string; date: string; item: ScheduledItem; dueOn: string };

/**
 * Notifications à programmer : pour chaque échéance future non réglée, X jours
 * avant (à 9 h, heure locale). Limité en nombre (iOS en accepte 64 au maximum).
 */
export function notificationPlan(items: ScheduledItem[], completions: Completion[], today: string, max = 50): PlannedNotification[] {
  const list = occurrencesBetween(
    items.filter((i) => i.remind_days_before !== null),
    completions,
    today,
    addDaysIso(today, 74),
    today,
  );
  return list
    .filter((o) => o.state === 'today' || o.state === 'upcoming')
    .map((o) => ({ key: `${o.item.id}|${o.dueOn}`, date: addDaysIso(o.dueOn, -(o.item.remind_days_before ?? 0)), item: o.item, dueOn: o.dueOn }))
    .filter((n) => n.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, max);
}
