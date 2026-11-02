/**
 * Moteur d'analyse des dépenses (pur, testé).
 *
 * Principes :
 *  - Uniquement des règles explicables, à partir des données de l'utilisateur.
 *  - Comparaisons « à période égale » (du 1er au même jour du mois).
 *  - Les mois sans aucune donnée ne comptent pas dans les moyennes.
 *  - Sans assez de données, on le dit au lieu de deviner.
 *  - Les montants sont des entiers (centimes / francs).
 */
import type { CurrencyCode } from '@/shared/config/currencies';

export type Tx = {
  type: 'expense' | 'income';
  amount_minor: number;
  occurred_on: string; // AAAA-MM-JJ
  category_id: string | null;
  description: string | null;
};

export type BudgetInput = { categoryId: string | null; limitMinor: number; thresholdPct: number; spentMinor: number };

export type Severity = 'warning' | 'positive' | 'info';

export type Insight =
  | { kind: 'notEnoughData'; severity: 'info'; days: number; count: number }
  | { kind: 'spendingOverIncome'; severity: 'warning'; incomeMinor: number; expensesMinor: number; gapMinor: number }
  | { kind: 'savingsRate'; severity: 'positive' | 'info'; rate: number; incomeMinor: number }
  | { kind: 'budgetExceeded'; severity: 'warning'; categoryId: string | null; overMinor: number; percent: number }
  | { kind: 'budgetWarning'; severity: 'warning'; categoryId: string | null; remainingMinor: number; percent: number }
  | { kind: 'categoryUp'; severity: 'warning'; categoryId: string; currentMinor: number; averageMinor: number; percent: number; months: number }
  | { kind: 'categoryDown'; severity: 'positive'; categoryId: string; currentMinor: number; averageMinor: number; percent: number; months: number }
  | { kind: 'endOfMonth'; severity: 'warning' | 'info'; estimateMinor: number; balanceMinor: number; incomingMinor: number; outgoingMinor: number }
  | { kind: 'topCategories'; severity: 'info'; items: { categoryId: string; amountMinor: number; share: number }[]; totalMinor: number }
  | { kind: 'smallExpenses'; severity: 'info'; count: number; totalMinor: number; thresholdMinor: number }
  | { kind: 'recurring'; severity: 'info'; items: RecurringExpense[] };

export type RecurringExpense = {
  key: string;
  label: string | null;
  categoryId: string | null;
  typicalMinor: number;
  months: number;
  lastDate: string;
  inCalendar: boolean;
};

/** Seuils minimaux par devise : en dessous, une différence n'est pas significative. */
export const SMALL_AMOUNT: Record<CurrencyCode, number> = { MAD: 5000, XAF: 3000 }; // 50 DH / 3 000 FCFA

export type EngineInput = {
  today: string;
  currency: CurrencyCode;
  /** Revenus et dépenses (sans transferts) depuis au moins 4 mois avant le mois en cours. */
  transactions: Tx[];
  budgets: BudgetInput[];
  /** Solde total des comptes actifs (null : inconnu). */
  totalBalanceMinor: number | null;
  /** Échéances non réglées du reste du mois (calendrier). */
  remainingScheduled: { incomeMinor: number; expenseMinor: number } | null;
  /** Titres et montants des échéances du calendrier (pour ne pas proposer un doublon). */
  calendarEntries: { title: string; amountMinor: number | null; categoryId: string | null }[];
};

// ---------------------------------------------------------------------------
// Outils de dates
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
const ym = (iso: string) => iso.slice(0, 7);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function monthShift(iso: string, delta: number): { start: string; y: number; m: number } {
  const [y, m] = iso.split('-').map(Number) as [number, number];
  const total = m - 1 + delta;
  const ny = y + Math.floor(total / 12);
  const nm = (((total % 12) + 12) % 12) + 1;
  return { start: `${ny}-${pad(nm)}-01`, y: ny, m: nm };
}

/** Même fenêtre que « du 1er au jour J » dans un mois précédent (J limité à la fin du mois). */
function samePeriod(today: string, delta: number): { from: string; to: string } {
  const day = Number(today.slice(8, 10));
  const { start, y, m } = monthShift(today, delta);
  return { from: start, to: `${y}-${pad(m)}-${pad(Math.min(day, daysIn(y, m)))}` };
}

const sum = (list: Tx[]) => list.reduce((a, t) => a + t.amount_minor, 0);
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

/** Description normalisée : minuscules, sans chiffres ni ponctuation ni accents. */
export function normalizeLabel(text: string | null): string | null {
  if (!text) return null;
  const n = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z؀-ۿ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return n.length >= 3 ? n : null;
}

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

/** Mois précédents (1 à 3) où l'utilisateur avait au moins une transaction. */
function activePreviousMonths(input: EngineInput): number[] {
  const months = new Set(input.transactions.map((t) => ym(t.occurred_on)));
  return [-1, -2, -3].filter((d) => months.has(ym(monthShift(input.today, d).start)));
}

function categoryTrends(input: EngineInput, current: Tx[]): Insight[] {
  const deltas = activePreviousMonths(input);
  if (deltas.length < 2) return []; // pas assez d'historique pour parler d'habitudes
  const floor = SMALL_AMOUNT[input.currency];
  const byCategory = new Map<string, number>();
  for (const t of current) if (t.category_id) byCategory.set(t.category_id, (byCategory.get(t.category_id) ?? 0) + t.amount_minor);

  const previousTotals = deltas.map((d) => {
    const { from, to } = samePeriod(input.today, d);
    const map = new Map<string, number>();
    for (const t of input.transactions) {
      if (t.type !== 'expense' || !t.category_id || t.occurred_on < from || t.occurred_on > to) continue;
      map.set(t.category_id, (map.get(t.category_id) ?? 0) + t.amount_minor);
    }
    return map;
  });

  const categories = new Set([...byCategory.keys(), ...previousTotals.flatMap((m) => [...m.keys()])]);
  const out: Insight[] = [];
  for (const categoryId of categories) {
    const currentMinor = byCategory.get(categoryId) ?? 0;
    const averageMinor = Math.round(previousTotals.reduce((a, m) => a + (m.get(categoryId) ?? 0), 0) / deltas.length);
    if (averageMinor <= 0) continue;
    const diff = currentMinor - averageMinor;
    const percent = Math.round((diff / averageMinor) * 100);
    const significant = Math.abs(diff) >= Math.max(floor, averageMinor * 0.25) && Math.abs(percent) >= 30;
    if (!significant) continue;
    if (diff > 0) out.push({ kind: 'categoryUp', severity: 'warning', categoryId, currentMinor, averageMinor, percent, months: deltas.length });
    else out.push({ kind: 'categoryDown', severity: 'positive', categoryId, currentMinor, averageMinor, percent, months: deltas.length });
  }
  // Les plus fortes variations (en montant) d'abord, 3 au maximum de chaque sens.
  const ups = out.filter((i) => i.kind === 'categoryUp').sort((a, b) => diffOf(b) - diffOf(a)).slice(0, 3);
  const downs = out.filter((i) => i.kind === 'categoryDown').sort((a, b) => diffOf(a) - diffOf(b)).slice(0, 2);
  return [...ups, ...downs];
}
const diffOf = (i: Insight) => (i.kind === 'categoryUp' || i.kind === 'categoryDown' ? i.currentMinor - i.averageMinor : 0);

/** Dépenses qui reviennent chaque mois, à montant proche. */
export function detectRecurring(input: EngineInput): RecurringExpense[] {
  const windowStart = monthShift(input.today, -4).start;
  const groups = new Map<string, Tx[]>();
  for (const t of input.transactions) {
    if (t.type !== 'expense' || t.occurred_on < windowStart) continue;
    const label = normalizeLabel(t.description);
    // Sans description : même catégorie ET même montant exact.
    const key = label ? `d:${label}` : t.category_id ? `c:${t.category_id}:${t.amount_minor}` : null;
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const calendar = input.calendarEntries.map((c) => ({ ...c, label: normalizeLabel(c.title) }));
  const result: RecurringExpense[] = [];
  for (const [key, list] of groups) {
    const months = new Set(list.map((t) => ym(t.occurred_on)));
    if (months.size < 3) continue; // au moins 3 mois différents
    if (list.length > months.size + 1) continue; // achats fréquents (courses…), pas un abonnement
    const typical = median(list.map((t) => t.amount_minor));
    if (!list.every((t) => Math.abs(t.amount_minor - typical) <= typical * 0.15)) continue; // montants proches
    const sorted = [...list].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
    const last = sorted[sorted.length - 1]!;
    const label = key.startsWith('d:') ? last.description : null;
    const inCalendar = calendar.some(
      (c) =>
        (c.label && key === `d:${c.label}`) ||
        (c.amountMinor !== null && c.categoryId === last.category_id && Math.abs(c.amountMinor - typical) <= typical * 0.15),
    );
    result.push({ key, label, categoryId: last.category_id, typicalMinor: typical, months: months.size, lastDate: last.occurred_on, inCalendar });
  }
  return result.sort((a, b) => b.typicalMinor - a.typicalMinor).slice(0, 5);
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------
const order: Record<Severity, number> = { warning: 0, positive: 1, info: 2 };

export function analyze(input: EngineInput): Insight[] {
  const monthStart = `${ym(input.today)}-01`;
  const inMonth = input.transactions.filter((t) => t.occurred_on >= monthStart && t.occurred_on <= input.today);
  const expenses = inMonth.filter((t) => t.type === 'expense');
  const incomeMinor = sum(inMonth.filter((t) => t.type === 'income'));
  const expensesMinor = sum(expenses);
  const insights: Insight[] = [];

  // Assez de données ? (au moins 10 transactions sur au moins 14 jours)
  const dates = input.transactions.map((t) => t.occurred_on).sort();
  const first = dates[0];
  const historyDays = first ? Math.round((Date.parse(`${input.today}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000) + 1 : 0;
  if (input.transactions.length < 10 || historyDays < 14) {
    insights.push({ kind: 'notEnoughData', severity: 'info', days: historyDays, count: input.transactions.length });
  }

  // Budgets
  for (const b of input.budgets) {
    const percent = Math.round((b.spentMinor / b.limitMinor) * 100);
    if (b.spentMinor > b.limitMinor) {
      insights.push({ kind: 'budgetExceeded', severity: 'warning', categoryId: b.categoryId, overMinor: b.spentMinor - b.limitMinor, percent });
    } else if (b.spentMinor * 100 >= b.limitMinor * b.thresholdPct) {
      insights.push({ kind: 'budgetWarning', severity: 'warning', categoryId: b.categoryId, remainingMinor: b.limitMinor - b.spentMinor, percent });
    }
  }

  // Revenus et dépenses du mois
  if (incomeMinor > 0) {
    if (expensesMinor > incomeMinor) {
      insights.push({ kind: 'spendingOverIncome', severity: 'warning', incomeMinor, expensesMinor, gapMinor: expensesMinor - incomeMinor });
    } else {
      const rate = Math.round(((incomeMinor - expensesMinor) / incomeMinor) * 100);
      insights.push({ kind: 'savingsRate', severity: rate >= 20 ? 'positive' : 'info', rate, incomeMinor });
    }
  }

  // Fin de mois (ESTIMATION à partir du solde et du calendrier)
  if (input.totalBalanceMinor !== null && input.remainingScheduled && (input.remainingScheduled.incomeMinor > 0 || input.remainingScheduled.expenseMinor > 0)) {
    const estimateMinor = input.totalBalanceMinor + input.remainingScheduled.incomeMinor - input.remainingScheduled.expenseMinor;
    insights.push({
      kind: 'endOfMonth',
      severity: estimateMinor < 0 ? 'warning' : 'info',
      estimateMinor,
      balanceMinor: input.totalBalanceMinor,
      incomingMinor: input.remainingScheduled.incomeMinor,
      outgoingMinor: input.remainingScheduled.expenseMinor,
    });
  }

  // Habitudes par catégorie
  insights.push(...categoryTrends(input, expenses));

  // Catégories les plus coûteuses
  if (expensesMinor > 0) {
    const map = new Map<string, number>();
    for (const t of expenses) if (t.category_id) map.set(t.category_id, (map.get(t.category_id) ?? 0) + t.amount_minor);
    const items = [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([categoryId, amountMinor]) => ({ categoryId, amountMinor, share: Math.round((amountMinor / expensesMinor) * 100) }));
    insights.push({ kind: 'topCategories', severity: 'info', items, totalMinor: expensesMinor });
  }

  // Petites dépenses qui s'additionnent
  const threshold = SMALL_AMOUNT[input.currency];
  const small = expenses.filter((t) => t.amount_minor <= threshold);
  if (small.length >= 10 && sum(small) >= threshold * 3) {
    insights.push({ kind: 'smallExpenses', severity: 'info', count: small.length, totalMinor: sum(small), thresholdMinor: threshold });
  }

  // Dépenses récurrentes
  const recurring = detectRecurring(input);
  if (recurring.length > 0) insights.push({ kind: 'recurring', severity: 'info', items: recurring });

  return insights.sort((a, b) => order[a.severity] - order[b.severity]);
}
