/**
 * Outils de l'assistant : chaque réponse chiffrée vient d'ici, calculée de façon
 * exacte à partir des données de l'utilisateur (lues avec SON jeton, donc
 * limitées par les règles RLS). L'IA choisit l'outil et formule la réponse ;
 * elle ne fait aucun calcul.
 */
import { planContributions, progressOf, estimateCompletion, goalStatus } from '../app/goals-logic.ts';
import { occurrencesBetween, upcoming, type Completion, type ScheduledItem } from '../app/schedule-logic.ts';

import { categoryName, matchCategories, normalize, OVERALL_BUDGET, type CategoryLike } from './categories.ts';
import { ceilToUnit, DECIMALS, floorToUnit, formatAmount, pct, toMinor, type Currency, type Lang } from './format.ts';
import { addDays, daysBetween, isIsoDate, monthEnd, monthStart, PERIODS, resolvePeriod, shiftMonths, type Range } from './periods.ts';

// ---------------------------------------------------------------------------
// Accès aux données (implémenté avec Supabase dans data.ts, simulé dans les tests)
// ---------------------------------------------------------------------------
export type TxRow = {
  id: string;
  type: 'expense' | 'income' | 'transfer';
  amount_minor: number;
  occurred_on: string;
  category_id: string | null;
  account_id: string;
  to_account_id: string | null;
  description: string | null;
};
export type AccountRow = { id: string; name: string; type: string; is_archived: boolean; balance_minor: number };
export type BudgetRow = { category_id: string | null; limit_minor: number; alert_threshold_pct: number; spent_minor: number };
export type GoalRow = {
  id: string;
  name: string;
  target_minor: number;
  target_date: string | null;
  created_on: string;
  is_archived: boolean;
  saved_minor: number;
  saved_last_90_minor: number;
};

export interface AssistantData {
  /** Transactions entre deux dates incluses (tous types). `truncated` si la limite de lecture est atteinte. */
  transactions(range: Range): Promise<{ rows: TxRow[]; truncated: boolean }>;
  accounts(): Promise<AccountRow[]>;
  categories(): Promise<CategoryLike[]>;
  budgets(monthStart: string): Promise<BudgetRow[]>;
  goals(): Promise<GoalRow[]>;
  schedule(): Promise<{ items: ScheduledItem[]; completions: Completion[] }>;
}

export type ToolContext = { data: AssistantData; currency: Currency; lang: Lang; today: string };
export type ToolOutput = { content: string; isError: boolean };

// ---------------------------------------------------------------------------
// Définitions envoyées à l'IA (format de l'API Claude)
// ---------------------------------------------------------------------------
const periodProps = {
  period: {
    type: 'string',
    enum: [...PERIODS],
    description:
      'Time window, resolved on the server from today\'s date. "this_week"/"this_month"/"this_year" run up to today. "last_3_months" = the 3 full months before the current month. Use "custom" only for explicit dates.',
  },
  start_date: { type: 'string', description: 'YYYY-MM-DD, only with period "custom".' },
  end_date: { type: 'string', description: 'YYYY-MM-DD, only with period "custom".' },
} as const;

export const TOOL_DEFINITIONS = [
  {
    name: 'get_summary',
    description:
      'Income, expenses, net result and savings rate for a period, the top expense categories, and the same figures for the previous comparable period. Transfers between the user\'s own accounts are excluded (they are neither income nor expense). Use for questions like "how much did I spend this week?" or "how is my month going?".',
    input_schema: { type: 'object', properties: { ...periodProps }, required: ['period'], additionalProperties: false },
  },
  {
    name: 'get_category_breakdown',
    description:
      'Every category with its total for a period, its share of the total, and the change compared to the previous comparable period. Use to find where money goes, which category grew, or where the user could cut spending.',
    input_schema: {
      type: 'object',
      properties: { ...periodProps, type: { type: 'string', enum: ['expense', 'income'], description: 'Default: expense.' } },
      required: ['period'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_transactions',
    description:
      'Find individual transactions in a period, optionally filtered by text (description), category name, type or minimum amount. Returns the number and total of all matches plus up to 20 of them. Use for "what did I spend at X", "my biggest expenses", "how much on taxis".',
    input_schema: {
      type: 'object',
      properties: {
        ...periodProps,
        text: { type: 'string', description: 'Words to look for in the transaction description.' },
        category: { type: 'string', description: 'Category name or part of it, in any language.' },
        type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
        min_amount: { type: 'number', description: 'Minimum amount in main currency units (e.g. 100 for 100 DH).' },
        sort: { type: 'string', enum: ['recent', 'largest'], description: 'Default: recent.' },
        limit: { type: 'integer', description: 'How many transactions to list (1-20, default 10).' },
      },
      required: ['period'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_accounts',
    description: 'Current balance of each account or wallet (cash, bank, mobile money, savings) and the total, as recorded by the user in the app.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_budgets',
    description:
      'Monthly budgets: limit, amount spent, remaining amount, percentage used and status (ok, warning, exceeded). For the current month, also the days left and the amount that can still be spent per day.',
    input_schema: {
      type: 'object',
      properties: { month: { type: 'string', enum: ['this_month', 'last_month'], description: 'Default: this_month.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_goals',
    description:
      'Savings goals: target, amount saved, remaining amount, progress, deadline, required saving per month/week to reach it on time, and an ESTIMATED completion date based on the last 90 days (may be null).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_upcoming',
    description:
      'Scheduled bills, subscriptions, payments, expected incomes and reminders from the financial calendar: overdue items (last 30 days) and upcoming items over the next N days, with totals still to pay and to receive.',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'Horizon in days (1-90, default 30).' } },
      additionalProperties: false,
    },
  },
  {
    name: 'check_affordability',
    description:
      'Checks whether a planned purchase fits the user\'s recorded finances: current balances, bills still due and incomes still expected this month, balance projected after the purchase, average monthly income and expenses over the last 3 full months, and the overall budget. Returns an assessment code. This is an ESTIMATE based only on what the user recorded in the app.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Price in main currency units (e.g. 3000 for 3 000 DH).' },
        label: { type: 'string', description: 'What the user wants to buy (optional).' },
      },
      required: ['amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'plan_savings',
    description:
      'Computes how much to set aside per month and per week to reach a savings target, either by a date or within a number of months, and compares it with the user\'s average monthly surplus (income minus expenses over the last 3 full months). Use for "how much should I save per month to have X by Y?". For an existing goal, prefer get_goals.',
    input_schema: {
      type: 'object',
      properties: {
        target_amount: { type: 'number', description: 'Target in main currency units.' },
        target_date: { type: 'string', description: 'YYYY-MM-DD deadline (give this OR months).' },
        months: { type: 'integer', description: 'Number of months from today (1-120).' },
        already_saved: { type: 'number', description: 'Amount already put aside, in main currency units (default 0).' },
      },
      required: ['target_amount'],
      additionalProperties: false,
    },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'];

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------
type Input = Record<string, unknown>;

class ToolInputError extends Error {}

export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutput> {
  const args = (input && typeof input === 'object' ? input : {}) as Input;
  try {
    const handler = HANDLERS[name as ToolName];
    if (!handler) throw new ToolInputError(`unknown tool "${name}"`);
    const result = await handler(args, ctx);
    return { content: JSON.stringify(result), isError: false };
  } catch (e) {
    if (e instanceof ToolInputError) return { content: JSON.stringify({ error: e.message }), isError: true };
    // Ne jamais transmettre le détail d'une erreur interne à l'IA.
    console.error(`Outil ${name} en échec`, e);
    return { content: JSON.stringify({ error: 'data temporarily unavailable' }), isError: true };
  }
}

const HANDLERS: Record<ToolName, (args: Input, ctx: ToolContext) => Promise<unknown>> = {
  get_summary: getSummary,
  get_category_breakdown: getCategoryBreakdown,
  search_transactions: searchTransactions,
  get_accounts: getAccounts,
  get_budgets: getBudgets,
  get_goals: getGoals,
  get_upcoming: getUpcoming,
  check_affordability: checkAffordability,
  plan_savings: planSavings,
};

function periodOf(args: Input, ctx: ToolContext) {
  const resolved = resolvePeriod(args, ctx.today);
  if ('error' in resolved) throw new ToolInputError(resolved.error);
  return resolved;
}

const money = (minor: number, ctx: ToolContext) => formatAmount(minor, ctx.currency, ctx.lang);

type Totals = { income: number; expenses: number; incomeCount: number; expenseCount: number; transferCount: number };

function totalsOf(rows: TxRow[]): Totals {
  const t: Totals = { income: 0, expenses: 0, incomeCount: 0, expenseCount: 0, transferCount: 0 };
  for (const r of rows) {
    if (r.type === 'income') {
      t.income += r.amount_minor;
      t.incomeCount++;
    } else if (r.type === 'expense') {
      t.expenses += r.amount_minor;
      t.expenseCount++;
    } else t.transferCount++;
  }
  return t;
}

function byCategory(rows: TxRow[], type: 'expense' | 'income') {
  const map = new Map<string | null, { total: number; count: number }>();
  for (const r of rows) {
    if (r.type !== type) continue;
    const entry = map.get(r.category_id) ?? { total: 0, count: 0 };
    entry.total += r.amount_minor;
    entry.count++;
    map.set(r.category_id, entry);
  }
  return map;
}

const withNote = (truncated: boolean) => (truncated ? { data_note: 'too many transactions: only the first ones were read, totals may be incomplete' } : {});

async function getSummary(args: Input, ctx: ToolContext) {
  const { range, previous } = periodOf(args, ctx);
  const [cur, prev, categories] = await Promise.all([ctx.data.transactions(range), ctx.data.transactions(previous), ctx.data.categories()]);
  const t = totalsOf(cur.rows);
  const p = totalsOf(prev.rows);
  const cats = new Map(categories.map((c) => [c.id, c]));
  const top = [...byCategory(cur.rows, 'expense').entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([id, v]) => ({ category: categoryName(id ? cats.get(id) : undefined, ctx.lang), amount: money(v.total, ctx), share_pct: pct(v.total, t.expenses) }));
  const net = t.income - t.expenses;
  return {
    period: range,
    transactions_recorded: t.incomeCount + t.expenseCount,
    ...(t.incomeCount + t.expenseCount === 0 ? { note: 'no income or expense recorded in this period' } : {}),
    income: money(t.income, ctx),
    expenses: money(t.expenses, ctx),
    net: money(net, ctx),
    net_is_positive: net >= 0,
    savings_rate_pct: t.income > 0 ? pct(net, t.income) : null,
    expense_count: t.expenseCount,
    income_count: t.incomeCount,
    transfers_excluded: t.transferCount,
    top_expense_categories: top,
    previous_period: { ...previous, income: money(p.income, ctx), expenses: money(p.expenses, ctx), net: money(p.income - p.expenses, ctx) },
    expenses_change_pct: p.expenses > 0 ? pct(t.expenses - p.expenses, p.expenses) : null,
    income_change_pct: p.income > 0 ? pct(t.income - p.income, p.income) : null,
    ...withNote(cur.truncated || prev.truncated),
  };
}

async function getCategoryBreakdown(args: Input, ctx: ToolContext) {
  const type = args.type === 'income' ? 'income' : 'expense';
  const { range, previous } = periodOf(args, ctx);
  const [cur, prev, categories] = await Promise.all([ctx.data.transactions(range), ctx.data.transactions(previous), ctx.data.categories()]);
  const cats = new Map(categories.map((c) => [c.id, c]));
  const now = byCategory(cur.rows, type);
  const before = byCategory(prev.rows, type);
  const total = [...now.values()].reduce((s, v) => s + v.total, 0);
  const previousTotal = [...before.values()].reduce((s, v) => s + v.total, 0);
  const ids = new Set([...now.keys(), ...before.keys()]);
  const rows = [...ids]
    .map((id) => {
      const a = now.get(id)?.total ?? 0;
      const b = before.get(id)?.total ?? 0;
      return {
        sortKey: a,
        category: categoryName(id ? cats.get(id) : undefined, ctx.lang),
        amount: money(a, ctx),
        share_pct: pct(a, total) ?? 0,
        count: now.get(id)?.count ?? 0,
        previous_amount: money(b, ctx),
        change_pct: b > 0 ? pct(a - b, b) : null,
        change_amount: money(a - b, ctx),
      };
    })
    .sort((x, y) => y.sortKey - x.sortKey)
    .map(({ sortKey: _s, ...rest }) => rest);
  return {
    type,
    period: range,
    previous_period: previous,
    total: money(total, ctx),
    previous_total: money(previousTotal, ctx),
    total_change_pct: previousTotal > 0 ? pct(total - previousTotal, previousTotal) : null,
    categories: rows,
    ...(rows.length === 0 ? { note: `no ${type} recorded in this period` } : {}),
    ...withNote(cur.truncated || prev.truncated),
  };
}

async function searchTransactions(args: Input, ctx: ToolContext) {
  const { range } = periodOf(args, ctx);
  const limit = Math.min(20, Math.max(1, Math.floor(Number(args.limit) || 10)));
  const [cur, categories, accounts] = await Promise.all([ctx.data.transactions(range), ctx.data.categories(), ctx.data.accounts()]);
  const cats = new Map(categories.map((c) => [c.id, c]));
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));

  let rows = cur.rows;
  if (args.type === 'expense' || args.type === 'income' || args.type === 'transfer') rows = rows.filter((r) => r.type === args.type);
  if (typeof args.category === 'string' && args.category.trim()) {
    const matched = matchCategories(categories, args.category);
    if (matched.length === 0) {
      return { period: range, matches_count: 0, note: `no category matches "${args.category}"`, available_categories: categories.map((c) => categoryName(c, ctx.lang)) };
    }
    const ids = new Set(matched.map((c) => c.id));
    rows = rows.filter((r) => r.category_id && ids.has(r.category_id));
  }
  if (typeof args.text === 'string' && args.text.trim()) {
    const words = normalize(args.text).split(/\s+/).filter(Boolean);
    rows = rows.filter((r) => {
      const hay = normalize(`${r.description ?? ''} ${categoryName(r.category_id ? cats.get(r.category_id) : undefined, ctx.lang)}`);
      return words.every((w) => hay.includes(w));
    });
  }
  if (args.min_amount !== undefined) {
    const min = toMinor(args.min_amount, ctx.currency);
    if (min === null) throw new ToolInputError('min_amount must be a positive number');
    rows = rows.filter((r) => r.amount_minor >= min);
  }
  const sorted = [...rows].sort((a, b) =>
    args.sort === 'largest' ? b.amount_minor - a.amount_minor : b.occurred_on.localeCompare(a.occurred_on) || b.amount_minor - a.amount_minor,
  );
  const sum = (type: TxRow['type']) => rows.filter((r) => r.type === type).reduce((s, r) => s + r.amount_minor, 0);
  return {
    period: range,
    matches_count: rows.length,
    total_expenses: money(sum('expense'), ctx),
    total_income: money(sum('income'), ctx),
    total_transfers: money(sum('transfer'), ctx),
    shown: sorted.slice(0, limit).map((r) => ({
      date: r.occurred_on,
      type: r.type,
      amount: money(r.amount_minor, ctx),
      category: r.type === 'transfer' ? null : categoryName(r.category_id ? cats.get(r.category_id) : undefined, ctx.lang),
      description: r.description,
      account: accountNames.get(r.account_id) ?? null,
      ...(r.to_account_id ? { to_account: accountNames.get(r.to_account_id) ?? null } : {}),
    })),
    ...(rows.length > limit ? { note: `${rows.length - limit} more matches not listed` } : {}),
    ...withNote(cur.truncated),
  };
}

async function getAccounts(_args: Input, ctx: ToolContext) {
  const accounts = await ctx.data.accounts();
  const active = accounts.filter((a) => !a.is_archived);
  const total = active.reduce((s, a) => s + a.balance_minor, 0);
  return {
    accounts: active.map((a) => ({ name: a.name, type: a.type, balance: money(a.balance_minor, ctx), negative: a.balance_minor < 0 })),
    total_balance: money(total, ctx),
    archived_accounts_not_counted: accounts.length - active.length,
    note: 'balances reflect only what the user recorded in the app',
  };
}

function budgetState(spent: number, limit: number, threshold: number): 'ok' | 'warning' | 'exceeded' {
  if (spent > limit) return 'exceeded';
  return spent * 100 >= limit * threshold ? 'warning' : 'ok';
}

async function getBudgets(args: Input, ctx: ToolContext) {
  const isLast = args.month === 'last_month';
  const start = monthStart(ctx.today, isLast ? -1 : 0);
  const [rows, categories] = await Promise.all([ctx.data.budgets(start), ctx.data.categories()]);
  const cats = new Map(categories.map((c) => [c.id, c]));
  const daysLeft = isLast ? 0 : daysBetween(ctx.today, monthEnd(ctx.today)) + 1; // aujourd'hui compris
  if (rows.length === 0) return { month: start.slice(0, 7), budgets: [], note: 'no budget defined: the user can create one in the Budgets screen' };
  const budgets = [...rows]
    .sort((a, b) => (a.category_id === null ? -1 : b.category_id === null ? 1 : b.spent_minor / b.limit_minor - a.spent_minor / a.limit_minor))
    .map((b) => {
      const remaining = b.limit_minor - b.spent_minor;
      return {
        category: b.category_id === null ? OVERALL_BUDGET[ctx.lang] : categoryName(cats.get(b.category_id), ctx.lang),
        limit: money(b.limit_minor, ctx),
        spent: money(b.spent_minor, ctx),
        remaining: money(Math.max(remaining, 0), ctx),
        ...(remaining < 0 ? { over_by: money(-remaining, ctx) } : {}),
        used_pct: pct(b.spent_minor, b.limit_minor),
        alert_threshold_pct: b.alert_threshold_pct,
        status: budgetState(b.spent_minor, b.limit_minor, b.alert_threshold_pct),
        ...(!isLast && remaining > 0 ? { can_spend_per_day: money(floorToUnit(remaining / daysLeft, ctx.currency), ctx) } : {}),
      };
    });
  return { month: start.slice(0, 7), ...(isLast ? {} : { days_left_including_today: daysLeft }), budgets };
}

async function getGoals(_args: Input, ctx: ToolContext) {
  const goals = (await ctx.data.goals()).filter((g) => !g.is_archived);
  if (goals.length === 0) return { goals: [], note: 'no savings goal yet: the user can create one in the Goals screen' };
  const unit = 10 ** DECIMALS[ctx.currency];
  return {
    goals: goals.map((g) => {
      const progress = progressOf(g.saved_minor, g.target_minor);
      const plan = planContributions(progress.remainingMinor, ctx.today, g.target_date, unit);
      const estimate = estimateCompletion(progress.remainingMinor, g.saved_last_90_minor, g.created_on, ctx.today);
      return {
        name: g.name,
        target: money(g.target_minor, ctx),
        saved: money(g.saved_minor, ctx),
        remaining: money(progress.remainingMinor, ctx),
        progress_pct: Math.min(progress.percent, 100),
        deadline: g.target_date,
        status: goalStatus(plan, estimate, g.target_date),
        ...(plan.kind === 'plan'
          ? { required_per_month: money(plan.perMonthMinor, ctx), required_per_week: money(plan.perWeekMinor, ctx), days_left: plan.daysLeft }
          : {}),
        ...(plan.kind === 'overdue' ? { days_past_deadline: plan.daysLate } : {}),
        estimated_completion_date: progress.reached ? null : estimate,
        saved_last_90_days: money(g.saved_last_90_minor, ctx),
      };
    }),
    note: 'estimated_completion_date is an ESTIMATE at the pace of the last 90 days; null when there is not enough history',
  };
}

async function getUpcoming(args: Input, ctx: ToolContext) {
  const days = Math.min(90, Math.max(1, Math.floor(Number(args.days) || 30)));
  const { items, completions } = await ctx.data.schedule();
  const groups = upcoming(items, completions, ctx.today, days);
  const view = (o: (typeof groups.overdue)[number]) => ({
    date: o.dueOn,
    title: o.item.title,
    kind: o.item.kind,
    amount: o.item.amount_minor === null ? null : money(o.item.amount_minor, ctx),
  });
  const pending = [...groups.overdue, ...groups.today, ...groups.week, ...groups.later];
  const sum = (income: boolean) =>
    pending.filter((o) => (o.item.kind === 'income') === income && o.item.amount_minor !== null).reduce((s, o) => s + (o.item.amount_minor ?? 0), 0);
  return {
    horizon: { start: ctx.today, end: addDays(ctx.today, days) },
    overdue: groups.overdue.map(view),
    upcoming: [...groups.today, ...groups.week, ...groups.later].map(view),
    still_to_pay: money(sum(false), ctx),
    still_to_receive: money(sum(true), ctx),
    ...(items.length === 0 ? { note: 'nothing scheduled: the user can add bills and incomes in the Calendar screen' } : {}),
  };
}

/** Moyennes mensuelles sur les 3 mois complets précédant le mois en cours. */
async function monthlyAverages(ctx: ToolContext) {
  const range = { start: monthStart(ctx.today, -3), end: addDays(monthStart(ctx.today), -1) };
  const { rows, truncated } = await ctx.data.transactions(range);
  const months = new Set(rows.filter((r) => r.type !== 'transfer').map((r) => r.occurred_on.slice(0, 7)));
  const t = totalsOf(rows);
  const n = months.size;
  return {
    monthsWithData: n,
    avgIncome: n ? Math.round(t.income / n) : null,
    avgExpenses: n ? Math.round(t.expenses / n) : null,
    truncated,
  };
}

async function checkAffordability(args: Input, ctx: ToolContext) {
  const amount = toMinor(args.amount, ctx.currency);
  if (amount === null) throw new ToolInputError('amount must be a positive number in main currency units');
  const end = monthEnd(ctx.today);
  const [accounts, schedule, avg, thisMonth, budgets] = await Promise.all([
    ctx.data.accounts(),
    ctx.data.schedule(),
    monthlyAverages(ctx),
    ctx.data.transactions({ start: monthStart(ctx.today), end: ctx.today }),
    ctx.data.budgets(monthStart(ctx.today)),
  ]);
  const balance = accounts.filter((a) => !a.is_archived).reduce((s, a) => s + a.balance_minor, 0);
  // Échéances non réglées : retards des 30 derniers jours + reste du mois.
  const pending = occurrencesBetween(schedule.items, schedule.completions, addDays(ctx.today, -30), end, ctx.today).filter(
    (o) => (o.state === 'overdue' || o.state === 'today' || o.state === 'upcoming') && o.item.amount_minor !== null,
  );
  const billsDue = pending.filter((o) => o.item.kind !== 'income').reduce((s, o) => s + (o.item.amount_minor ?? 0), 0);
  const incomeExpected = pending.filter((o) => o.item.kind === 'income').reduce((s, o) => s + (o.item.amount_minor ?? 0), 0);
  const projected = balance - billsDue + incomeExpected - amount;

  const overall = budgets.find((b) => b.category_id === null);
  const spentThisMonth = totalsOf(thisMonth.rows).expenses;
  const budgetRemaining = overall ? overall.limit_minor - overall.spent_minor : null;

  let assessment: 'not_covered' | 'tight' | 'covered';
  if (projected < 0) assessment = 'not_covered';
  else if (avg.avgExpenses !== null && projected < avg.avgExpenses * 0.25) assessment = 'tight';
  else assessment = 'covered';

  const caveats = ['estimate based only on the balances, bills and incomes recorded in the app'];
  if (avg.monthsWithData === 0) caveats.push('no full month of history yet: averages unavailable');
  if (schedule.items.length === 0) caveats.push('no bills or incomes scheduled in the calendar: upcoming bills may be missing');
  if (avg.truncated || thisMonth.truncated) caveats.push('too many transactions: averages may be incomplete');

  return {
    purchase: { label: typeof args.label === 'string' ? args.label.slice(0, 80) : null, amount: money(amount, ctx) },
    current_total_balance: money(balance, ctx),
    unpaid_bills_until_month_end: money(billsDue, ctx),
    expected_income_until_month_end: money(incomeExpected, ctx),
    projected_balance_after_purchase: money(projected, ctx),
    assessment,
    assessment_rule:
      'not_covered: projected balance below zero; tight: projected balance below 25% of average monthly expenses; covered: otherwise',
    average_monthly_income_last_3_months: avg.avgIncome === null ? null : money(avg.avgIncome, ctx),
    average_monthly_expenses_last_3_months: avg.avgExpenses === null ? null : money(avg.avgExpenses, ctx),
    months_of_history_used: avg.monthsWithData,
    purchase_vs_average_monthly_income_pct: avg.avgIncome ? pct(amount, avg.avgIncome) : null,
    spent_so_far_this_month: money(spentThisMonth, ctx),
    ...(budgetRemaining !== null
      ? { overall_budget_remaining: money(Math.max(budgetRemaining, 0), ctx), purchase_exceeds_overall_budget: amount > budgetRemaining }
      : { overall_budget_remaining: null }),
    caveats,
  };
}

async function planSavings(args: Input, ctx: ToolContext) {
  const target = toMinor(args.target_amount, ctx.currency);
  if (target === null) throw new ToolInputError('target_amount must be a positive number in main currency units');
  const saved = args.already_saved === undefined || args.already_saved === 0 ? 0 : toMinor(args.already_saved, ctx.currency);
  if (saved === null) throw new ToolInputError('already_saved must be a positive number');
  const remaining = Math.max(target - saved, 0);

  let deadline: string;
  let months: number;
  if (args.months !== undefined) {
    months = Math.floor(Number(args.months));
    if (!Number.isFinite(months) || months < 1 || months > 120) throw new ToolInputError('months must be between 1 and 120');
    deadline = shiftMonths(ctx.today, months);
  } else if (isIsoDate(args.target_date)) {
    deadline = args.target_date;
    if (deadline <= ctx.today) throw new ToolInputError('target_date must be in the future');
    months = Math.max(1, Math.ceil(daysBetween(ctx.today, deadline) / 30.4375));
  } else {
    throw new ToolInputError('give a target_date (YYYY-MM-DD) or a number of months; ask the user if unknown');
  }

  const weeks = Math.max(1, Math.ceil(daysBetween(ctx.today, deadline) / 7));
  const perMonth = remaining === 0 ? 0 : ceilToUnit(remaining / months, ctx.currency);
  const perWeek = remaining === 0 ? 0 : ceilToUnit(remaining / weeks, ctx.currency);
  const avg = await monthlyAverages(ctx);
  const surplus = avg.avgIncome !== null && avg.avgExpenses !== null ? avg.avgIncome - avg.avgExpenses : null;

  let feasibility: 'already_reached' | 'within_average_surplus' | 'above_average_surplus' | 'unknown';
  if (remaining === 0) feasibility = 'already_reached';
  else if (surplus === null) feasibility = 'unknown';
  else feasibility = perMonth <= surplus ? 'within_average_surplus' : 'above_average_surplus';

  return {
    target: money(target, ctx),
    already_saved: money(saved, ctx),
    remaining: money(remaining, ctx),
    deadline,
    months,
    required_per_month: money(perMonth, ctx),
    required_per_week: money(perWeek, ctx),
    average_monthly_surplus_last_3_months: surplus === null ? null : money(surplus, ctx),
    required_vs_surplus_pct: surplus && surplus > 0 ? pct(perMonth, surplus) : null,
    feasibility,
    months_of_history_used: avg.monthsWithData,
    note: 'amounts rounded up to the currency unit; the surplus is an average of past months, not a guarantee',
  };
}
