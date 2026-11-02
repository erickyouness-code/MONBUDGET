import { readFileSync } from 'node:fs';
import path from 'node:path';

import { formatMoneyCompact } from '../../../../src/shared/lib/money';
import { ar } from '../../../../src/shared/i18n/locales/ar';
import { en } from '../../../../src/shared/i18n/locales/en';
import { fr } from '../../../../src/shared/i18n/locales/fr';
import type { Completion, ScheduledItem } from '../app/schedule-logic';
import { CATEGORY_LABELS, matchCategories, type CategoryLike } from '../assistant/categories';
import { echoable, runConversation, type CreateMessage } from '../assistant/conversation';
import { formatAmount, toMinor } from '../assistant/format';
import { resolvePeriod, todayIn } from '../assistant/periods';
import { contextBlock, SYSTEM_PROMPT } from '../assistant/prompt';
import { parseRequest } from '../assistant/request';
import { runTool, TOOL_DEFINITIONS, type AccountRow, type AssistantData, type BudgetRow, type GoalRow, type ToolContext, type TxRow } from '../assistant/tools';

const ROOT = path.resolve(__dirname, '../../../..');
const TODAY = '2026-11-12'; // jeudi

// ---------------------------------------------------------------------------
// Jeu de données (dirhams, montants en centimes)
// ---------------------------------------------------------------------------
const categories: CategoryLike[] = [
  { id: 'c-food', key: 'food', name: null, kind: 'expense' },
  { id: 'c-tr', key: 'transport', name: null, kind: 'expense' },
  { id: 'c-sal', key: 'salary', name: null, kind: 'income' },
  { id: 'c-cafe', key: null, name: 'Café', kind: 'expense' },
];
const accounts: AccountRow[] = [
  { id: 'a1', name: 'Espèces', type: 'cash', is_archived: false, balance_minor: 50_000 },
  { id: 'a2', name: 'Banque', type: 'bank', is_archived: false, balance_minor: 1_200_000 },
  { id: 'a3', name: 'Ancien compte', type: 'bank', is_archived: true, balance_minor: 10_000 },
];
let n = 0;
const tx = (occurred_on: string, type: TxRow['type'], amount_minor: number, category_id: string | null, description: string | null = null, account_id = 'a1', to_account_id: string | null = null): TxRow => ({
  id: `t${++n}`,
  occurred_on,
  type,
  amount_minor,
  category_id,
  description,
  account_id,
  to_account_id,
});
const transactions: TxRow[] = [
  tx('2026-11-02', 'income', 800_000, 'c-sal', 'Salaire novembre', 'a2'),
  tx('2026-11-03', 'expense', 45_000, 'c-food', 'Marjane courses'),
  tx('2026-11-05', 'expense', 12_050, 'c-tr', 'Taxi aéroport'),
  tx('2026-11-09', 'expense', 2_500, 'c-cafe', 'Café'),
  tx('2026-11-10', 'transfer', 100_000, null, 'Retrait', 'a2', 'a1'),
  tx('2026-11-11', 'expense', 3_000, 'c-tr', 'Taxi'),
  tx('2026-10-02', 'income', 800_000, 'c-sal', null, 'a2'),
  tx('2026-10-04', 'expense', 60_000, 'c-food'),
  tx('2026-10-08', 'expense', 5_000, 'c-tr'),
  tx('2026-10-20', 'expense', 100_000, 'c-food'),
  tx('2026-09-02', 'income', 800_000, 'c-sal', null, 'a2'),
  tx('2026-09-10', 'expense', 300_000, 'c-food'),
  tx('2026-08-02', 'income', 700_000, 'c-sal', null, 'a2'),
  tx('2026-08-15', 'expense', 200_000, 'c-food'),
];
const budgets: Record<string, BudgetRow[]> = {
  '2026-11-01': [
    { category_id: null, limit_minor: 300_000, alert_threshold_pct: 80, spent_minor: 62_550 },
    { category_id: 'c-food', limit_minor: 50_000, alert_threshold_pct: 80, spent_minor: 45_000 },
  ],
};
const goals: GoalRow[] = [
  { id: 'g1', name: 'Téléphone', target_minor: 300_000, target_date: '2027-03-12', created_on: '2026-08-01', is_archived: false, saved_minor: 120_000, saved_last_90_minor: 60_000 },
  { id: 'g2', name: 'Archivé', target_minor: 1_000, target_date: null, created_on: '2026-01-01', is_archived: true, saved_minor: 0, saved_last_90_minor: 0 },
];
const item = (o: Partial<ScheduledItem> & Pick<ScheduledItem, 'id' | 'kind' | 'title' | 'start_date'>): ScheduledItem => ({
  amount_minor: null,
  category_id: null,
  account_id: null,
  frequency: 'once',
  interval_count: 1,
  end_date: null,
  remind_days_before: null,
  is_active: true,
  note: null,
  ...o,
});
const scheduleItems: ScheduledItem[] = [
  item({ id: 's1', kind: 'bill', title: 'Loyer', amount_minor: 250_000, frequency: 'monthly', start_date: '2026-01-15' }),
  item({ id: 's2', kind: 'income', title: 'Freelance', amount_minor: 150_000, start_date: '2026-11-20' }),
  item({ id: 's3', kind: 'reminder', title: 'Vignette', start_date: '2026-11-25' }),
];
const completions: Completion[] = [{ id: 'k1', item_id: 's1', due_on: '2026-10-15', status: 'paid', transaction_id: null }];

function fakeData(overrides: Partial<AssistantData> = {}): AssistantData & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    transactions: async (r) => {
      reads.push(`tx:${r.start}..${r.end}`);
      return { rows: transactions.filter((t) => t.occurred_on >= r.start && t.occurred_on <= r.end), truncated: false };
    },
    accounts: async () => accounts,
    categories: async () => categories,
    budgets: async (m) => budgets[m] ?? [],
    goals: async () => goals,
    schedule: async () => ({ items: scheduleItems, completions }),
    ...overrides,
  };
}

const ctx = (o: Partial<ToolContext> = {}): ToolContext => ({ data: fakeData(), currency: 'MAD', lang: 'fr', today: TODAY, ...o });
async function call(name: string, input: unknown, c: ToolContext = ctx()) {
  const out = await runTool(name, input, c);
  return { ...out, data: JSON.parse(out.content) };
}

// ---------------------------------------------------------------------------
describe('montants', () => {
  it('formate comme l’application (sans les caractères d’isolement arabes)', () => {
    const strip = (s: string) => s.replace(/[⁦⁩]/g, '').replace(/[  ]/g, ' ').replace('−', '-');
    for (const lang of ['fr', 'ar', 'en'] as const) {
      for (const [minor, cur] of [[125_050, 'MAD'], [-30_000, 'MAD'], [7, 'MAD'], [1_250_000, 'XAF'], [0, 'XAF']] as const) {
        expect(formatAmount(minor, cur, lang)).toBe(strip(formatMoneyCompact(minor, cur, lang)));
      }
    }
    expect(formatAmount(125_050, 'MAD', 'fr')).toBe('1 250,50 DH');
    expect(formatAmount(1_250_000, 'XAF', 'en')).toBe('1,250,000 FCFA');
  });

  it('convertit les montants donnés par l’IA, et refuse les valeurs invalides', () => {
    expect(toMinor(3000, 'MAD')).toBe(300_000);
    expect(toMinor(19.99, 'MAD')).toBe(1_999);
    expect(toMinor(1500, 'XAF')).toBe(1_500);
    expect(toMinor(-5, 'MAD')).toBeNull();
    expect(toMinor('3000', 'MAD')).toBeNull();
    expect(toMinor(Number.NaN, 'MAD')).toBeNull();
    expect(toMinor(1e20, 'MAD')).toBeNull();
  });
});

describe('copies de la logique de l’application', () => {
  it.each([
    ['src/features/schedule/logic.ts', 'supabase/functions/_shared/app/schedule-logic.ts'],
    ['src/features/goals/logic.ts', 'supabase/functions/_shared/app/goals-logic.ts'],
  ])('%s est identique à sa copie serveur (sinon : npm run sync:functions)', (app, copy) => {
    expect(readFileSync(path.join(ROOT, copy), 'utf8')).toBe(readFileSync(path.join(ROOT, app), 'utf8'));
  });

  it('les noms de catégories sont ceux de l’application', () => {
    for (const [key, labels] of Object.entries(CATEGORY_LABELS)) {
      expect(labels.fr).toBe(fr.categories[key as keyof typeof fr.categories]);
      expect(labels.en).toBe(en.categories[key as keyof typeof en.categories]);
      expect(labels.ar).toBe(ar.categories[key as keyof typeof ar.categories]);
    }
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual(Object.keys(fr.categories).sort());
  });

  it('recherche de catégorie sans accents, dans toutes les langues', () => {
    expect(matchCategories(categories, 'cafe').map((c) => c.id)).toEqual(['c-cafe']);
    expect(matchCategories(categories, 'Groceries').map((c) => c.id)).toEqual(['c-food']);
    expect(matchCategories(categories, 'النقل').map((c) => c.id)).toEqual(['c-tr']);
    expect(matchCategories(categories, '')).toEqual([]);
  });
});

describe('périodes', () => {
  const r = (period: string, extra = {}) => resolvePeriod({ period, ...extra }, TODAY);
  it('résout chaque période avec sa période de comparaison', () => {
    expect(r('this_month')).toEqual({ range: { start: '2026-11-01', end: TODAY }, previous: { start: '2026-10-01', end: '2026-10-12' } });
    expect(r('last_month')).toEqual({ range: { start: '2026-10-01', end: '2026-10-31' }, previous: { start: '2026-09-01', end: '2026-09-30' } });
    expect(r('this_week')).toEqual({ range: { start: '2026-11-09', end: TODAY }, previous: { start: '2026-11-02', end: '2026-11-05' } });
    expect(r('last_week')).toEqual({ range: { start: '2026-11-02', end: '2026-11-08' }, previous: { start: '2026-10-26', end: '2026-11-01' } });
    expect(r('last_7_days')).toEqual({ range: { start: '2026-11-06', end: TODAY }, previous: { start: '2026-10-30', end: '2026-11-05' } });
    expect(r('last_3_months')).toEqual({ range: { start: '2026-08-01', end: '2026-10-31' }, previous: { start: '2026-05-01', end: '2026-07-31' } });
    expect(r('this_year')).toEqual({ range: { start: '2026-01-01', end: TODAY }, previous: { start: '2025-01-01', end: '2025-11-12' } });
    expect(resolvePeriod({ period: 'this_month' }, '2026-03-31')).toEqual({ range: { start: '2026-03-01', end: '2026-03-31' }, previous: { start: '2026-02-01', end: '2026-02-28' } });
    expect(resolvePeriod({ period: 'last_month' }, '2026-01-15')).toEqual({ range: { start: '2025-12-01', end: '2025-12-31' }, previous: { start: '2025-11-01', end: '2025-11-30' } });
  });

  it('période personnalisée : contrôlée et jamais dans le futur', () => {
    expect(r('custom', { start_date: '2026-11-01', end_date: '2026-12-31' })).toEqual({ range: { start: '2026-11-01', end: TODAY }, previous: { start: '2026-10-20', end: '2026-10-31' } });
    expect(r('custom', { start_date: '2026-02-30', end_date: '2026-03-01' })).toHaveProperty('error');
    expect(r('custom', { start_date: '2026-11-10', end_date: '2026-11-01' })).toHaveProperty('error');
    expect(r('custom', { start_date: '2026-12-01', end_date: '2026-12-31' })).toHaveProperty('error');
    expect(r('custom', { start_date: '2024-01-01', end_date: '2026-11-01' })).toHaveProperty('error');
    expect(r('next_month')).toHaveProperty('error');
  });

  it('date du jour dans le fuseau du pays', () => {
    const lateUtc = new Date('2026-11-12T23:30:00Z');
    expect(todayIn('Africa/Libreville', lateUtc)).toBe('2026-11-13'); // UTC+1
    expect(todayIn('UTC', lateUtc)).toBe('2026-11-12');
  });
});

describe('outils de l’assistant', () => {
  it('résumé du mois : transferts exclus, comparaison au même moment du mois dernier', async () => {
    const { data, isError } = await call('get_summary', { period: 'this_month' });
    expect(isError).toBe(false);
    expect(data).toMatchObject({
      period: { start: '2026-11-01', end: TODAY },
      income: '8 000 DH',
      expenses: '625,50 DH',
      net: '7 374,50 DH',
      net_is_positive: true,
      savings_rate_pct: 92,
      expense_count: 4,
      transfers_excluded: 1,
      expenses_change_pct: -4,
      previous_period: { start: '2026-10-01', end: '2026-10-12', expenses: '650 DH' },
    });
    expect(data.top_expense_categories).toEqual([
      { category: 'Alimentation', amount: '450 DH', share_pct: 72 },
      { category: 'Transport', amount: '150,50 DH', share_pct: 24 },
      { category: 'Café', amount: '25 DH', share_pct: 4 },
    ]);
  });

  it('période sans données : le dit clairement au lieu d’inventer', async () => {
    const { data } = await call('get_summary', { period: 'custom', start_date: '2025-01-01', end_date: '2025-01-31' });
    expect(data.note).toMatch(/no income or expense/);
    expect(data.savings_rate_pct).toBeNull();
    expect(data.expenses_change_pct).toBeNull();
  });

  it('répartition par catégorie avec évolution, dans la langue demandée', async () => {
    const { data } = await call('get_category_breakdown', { period: 'this_month' }, ctx({ lang: 'en' }));
    expect(data.total).toBe('625.50 DH');
    expect(data.categories[0]).toEqual({ category: 'Groceries', amount: '450 DH', share_pct: 72, count: 1, previous_amount: '600 DH', change_pct: -25, change_amount: '-150 DH' });
    expect(data.categories.find((c: { category: string }) => c.category === 'Transport')).toMatchObject({ amount: '150.50 DH', previous_amount: '50 DH', change_pct: 201 });
  });

  it('recherche : texte, catégorie, montant minimum, tri', async () => {
    const taxis = (await call('search_transactions', { period: 'this_month', text: 'taxi' })).data;
    expect(taxis.matches_count).toBe(2);
    expect(taxis.total_expenses).toBe('150,50 DH');
    expect(taxis.shown.map((t: { date: string }) => t.date)).toEqual(['2026-11-11', '2026-11-05']);

    const biggest = (await call('search_transactions', { period: 'this_month', type: 'expense', sort: 'largest', limit: 1 })).data;
    expect(biggest.shown).toEqual([{ date: '2026-11-03', type: 'expense', amount: '450 DH', category: 'Alimentation', description: 'Marjane courses', account: 'Espèces' }]);
    expect(biggest.note).toMatch(/3 more/);

    const cafe = (await call('search_transactions', { period: 'this_month', category: 'cafe' })).data;
    expect(cafe.matches_count).toBe(1);

    const transfer = (await call('search_transactions', { period: 'this_month', type: 'transfer' })).data;
    expect(transfer.shown[0]).toMatchObject({ category: null, account: 'Banque', to_account: 'Espèces' });

    const unknown = (await call('search_transactions', { period: 'this_month', category: 'voyage' })).data;
    expect(unknown.matches_count).toBe(0);
    expect(unknown.available_categories).toContain('Café');

    expect((await call('search_transactions', { period: 'this_month', min_amount: 100 })).data.matches_count).toBe(4);
    expect((await call('search_transactions', { period: 'this_month', min_amount: -1 })).isError).toBe(true);
  });

  it('comptes : comptes archivés exclus du total', async () => {
    const { data } = await call('get_accounts', {});
    expect(data.total_balance).toBe('12 500 DH');
    expect(data.accounts).toHaveLength(2);
    expect(data.archived_accounts_not_counted).toBe(1);
  });

  it('budgets : statut, reste et montant disponible par jour', async () => {
    const { data } = await call('get_budgets', {});
    expect(data.days_left_including_today).toBe(19);
    expect(data.budgets[0]).toMatchObject({ category: 'Budget global du mois', limit: '3 000 DH', spent: '625,50 DH', remaining: '2 374,50 DH', used_pct: 21, status: 'ok', can_spend_per_day: '124 DH' });
    expect(data.budgets[1]).toMatchObject({ category: 'Alimentation', used_pct: 90, status: 'warning', remaining: '50 DH', can_spend_per_day: '2 DH' });
    expect((await call('get_budgets', { month: 'last_month' })).data.note).toMatch(/no budget/);
  });

  it('budget dépassé', async () => {
    const data = fakeData({ budgets: async () => [{ category_id: 'c-food', limit_minor: 40_000, alert_threshold_pct: 80, spent_minor: 45_000 }] });
    const out = (await call('get_budgets', {}, ctx({ data }))).data;
    expect(out.budgets[0]).toMatchObject({ status: 'exceeded', remaining: '0 DH', over_by: '50 DH' });
    expect(out.budgets[0].can_spend_per_day).toBeUndefined();
  });

  it('objectifs : effort mensuel exact et date estimée (présentée comme estimation)', async () => {
    const { data } = await call('get_goals', {});
    expect(data.goals).toHaveLength(1);
    expect(data.goals[0]).toMatchObject({
      name: 'Téléphone',
      saved: '1 200 DH',
      remaining: '1 800 DH',
      progress_pct: 40,
      required_per_month: '450 DH',
      required_per_week: '100 DH',
      estimated_completion_date: '2027-08-09',
      status: 'behind',
    });
    expect(data.note).toMatch(/ESTIMATE/);
  });

  it('échéances : retards, à venir et totaux', async () => {
    const { data } = await call('get_upcoming', { days: 30 });
    expect(data.overdue).toEqual([]);
    expect(data.upcoming.map((o: { date: string; title: string }) => `${o.date} ${o.title}`)).toEqual(['2026-11-15 Loyer', '2026-11-20 Freelance', '2026-11-25 Vignette']);
    expect(data.still_to_pay).toBe('2 500 DH');
    expect(data.still_to_receive).toBe('1 500 DH');
    expect(data.upcoming[2].amount).toBeNull();
  });

  it('achat de 3 000 DH : calcul prudent et explicite', async () => {
    const { data } = await call('check_affordability', { amount: 3000, label: 'téléphone' });
    expect(data).toMatchObject({
      purchase: { label: 'téléphone', amount: '3 000 DH' },
      current_total_balance: '12 500 DH',
      unpaid_bills_until_month_end: '2 500 DH',
      expected_income_until_month_end: '1 500 DH',
      projected_balance_after_purchase: '8 500 DH',
      assessment: 'covered',
      average_monthly_income_last_3_months: '7 666,67 DH',
      average_monthly_expenses_last_3_months: '2 216,67 DH',
      months_of_history_used: 3,
      purchase_vs_average_monthly_income_pct: 39,
      overall_budget_remaining: '2 374,50 DH',
      purchase_exceeds_overall_budget: true,
    });
    expect(data.caveats[0]).toMatch(/estimate/);
  });

  it('achat non couvert / juste', async () => {
    expect((await call('check_affordability', { amount: 12_000 })).data.assessment).toBe('not_covered');
    expect((await call('check_affordability', { amount: 11_000 })).data.assessment).toBe('tight');
    expect((await call('check_affordability', { amount: 0 })).isError).toBe(true);
  });

  it('plan d’épargne : par mois et par semaine, comparé à la capacité moyenne', async () => {
    const { data } = await call('plan_savings', { target_amount: 10_000, months: 6 });
    expect(data).toMatchObject({
      deadline: '2027-05-12',
      required_per_month: '1 667 DH',
      required_per_week: '385 DH',
      average_monthly_surplus_last_3_months: '5 450 DH',
      required_vs_surplus_pct: 31,
      feasibility: 'within_average_surplus',
    });
    const byDate = (await call('plan_savings', { target_amount: 10_000, target_date: '2027-05-12', already_saved: 4000 })).data;
    expect(byDate).toMatchObject({ remaining: '6 000 DH', months: 6, required_per_month: '1 000 DH' });
    expect((await call('plan_savings', { target_amount: 1000 })).isError).toBe(true);
    expect((await call('plan_savings', { target_amount: 1000, target_date: '2026-01-01' })).isError).toBe(true);
    expect((await call('plan_savings', { target_amount: 1000, months: 6, already_saved: 2000 })).data.feasibility).toBe('already_reached');
  });

  it('FCFA : sans décimales', async () => {
    const { data } = await call('check_affordability', { amount: 50_000.4 }, ctx({ currency: 'XAF' }));
    expect(data.purchase.amount).toBe('50 000 FCFA');
  });

  it('outil inconnu ou erreur interne : message d’erreur sans détail technique', async () => {
    expect((await call('delete_everything', {})).isError).toBe(true);
    const broken = fakeData({ accounts: async () => Promise.reject(new Error('mot de passe postgres=secret')) });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = await call('get_accounts', {}, ctx({ data: broken }));
    spy.mockRestore();
    expect(out.isError).toBe(true);
    expect(out.content).not.toMatch(/secret/);
  });

  it('chaque outil déclaré est implémenté et décrit', async () => {
    for (const def of TOOL_DEFINITIONS) {
      expect(def.description.length).toBeGreaterThan(40);
      expect(def.input_schema.type).toBe('object');
      const out = await runTool(def.name, { period: 'this_month', amount: 10, target_amount: 10, months: 1 }, ctx());
      expect(out.content).not.toMatch(/unknown tool/);
    }
  });
});

describe('requête de l’application', () => {
  it('garde les derniers échanges, commence par une question, fusionne les doublons', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` }));
    const out = parseRequest({ messages: [...many, { role: 'user', text: 'dernière' }], language: 'ar' });
    if ('error' in out) throw new Error(out.error);
    expect(out.language).toBe('ar');
    expect(out.turns[0]!.role).toBe('user');
    expect(out.turns).toHaveLength(11);
    expect(out.turns[0]).toEqual({ role: 'user', text: 'm10' });
    expect(out.turns.at(-1)).toEqual({ role: 'user', text: 'dernière' });
    const merged = parseRequest({ messages: [{ role: 'user', text: 'a' }, { role: 'user', text: 'b' }] });
    expect(merged).toEqual({ turns: [{ role: 'user', text: 'a\n\nb' }], language: null });
  });

  it('refuse les requêtes invalides', () => {
    expect(parseRequest(null)).toHaveProperty('error');
    expect(parseRequest({ messages: [] })).toHaveProperty('error');
    expect(parseRequest({ messages: [{ role: 'assistant', text: 'x' }] })).toHaveProperty('error');
    expect(parseRequest({ messages: [{ role: 'system', text: 'x' }] })).toHaveProperty('error');
    expect(parseRequest({ messages: [{ role: 'user', text: 'x'.repeat(1001) }] })).toHaveProperty('error');
    expect(parseRequest({ messages: Array.from({ length: 41 }, () => ({ role: 'user', text: 'x' })) })).toHaveProperty('error');
  });
});

describe('consignes', () => {
  it('rappellent les règles essentielles', () => {
    expect(SYSTEM_PROMPT).toMatch(/not a professional financial advisor/);
    expect(SYSTEM_PROMPT).toMatch(/never invent a figure/);
    expect(SYSTEM_PROMPT).toMatch(/estimates, not certainties/);
    expect(SYSTEM_PROMPT).toMatch(/PIN codes, one-time codes/);
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/); // aucune date : texte fixe, mis en cache
    expect(contextBlock({ today: TODAY, weekday: 'Thursday', country: 'GA', currency: 'XAF', lang: 'fr' })).toBe(
      "Today's date: 2026-11-12 (Thursday).\nUser's country: Gabon.\nCurrency: XAF (written \"FCFA\").\nApp language: French.",
    );
  });
});

// ---------------------------------------------------------------------------
describe('boucle de conversation', () => {
  type Msg = Awaited<ReturnType<CreateMessage>>;
  const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 };
  const message = (stop_reason: string, content: unknown[]): Msg => ({ id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason, content, usage }) as unknown as Msg;

  it('exécute les outils demandés puis renvoie la réponse', async () => {
    const calls: Parameters<CreateMessage>[0][] = [];
    const replies = [
      message('tool_use', [
        { type: 'thinking', thinking: '', signature: 's' },
        { type: 'tool_use', id: 'tu1', name: 'get_summary', input: { period: 'this_week' } },
        { type: 'tool_use', id: 'tu2', name: 'get_accounts', input: {} },
      ]),
      message('end_turn', [{ type: 'text', text: 'Cette semaine, vous avez dépensé 55 DH.' }]),
    ];
    const create: CreateMessage = async (p) => {
      calls.push(structuredClone(p));
      return replies.shift()!;
    };
    const { result, usage: used, steps } = await runConversation({
      create,
      model: 'claude-opus-5-5',
      systemPrompt: SYSTEM_PROMPT,
      context: 'ctx',
      turns: [{ role: 'user', text: 'Combien ai-je dépensé cette semaine ?' }],
      tools: ctx(),
    });
    expect(result).toEqual({ kind: 'answer', text: 'Cette semaine, vous avez dépensé 55 DH.', truncated: false });
    expect(steps).toBe(2);
    expect(used).toEqual({ input: 2200, output: 40 });

    const first = calls[0]!;
    expect(first.model).toBe('claude-opus-5-5');
    expect(first.system).toEqual([{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'ctx' }]);
    expect(first.tool_choice).toBeUndefined();
    expect(first.fallbacks).toBe('default');

    // 2e appel : l'historique est complété sans être modifié, résultats regroupés dans un seul message.
    const second = calls[1]!;
    expect(second.messages.slice(0, 1)).toEqual(first.messages);
    expect((second.messages[1]!.content as unknown[]).length).toBe(3);
    const results = second.messages[2]!.content as { type: string; tool_use_id: string; content: string }[];
    expect(results.map((r) => r.tool_use_id)).toEqual(['tu1', 'tu2']);
    expect(JSON.parse(results[0]!.content).expenses).toBe('55 DH');
    expect(JSON.parse(results[1]!.content).total_balance).toBe('12 500 DH');
  });

  it('refus du modèle, réponse vide, boucle infinie', async () => {
    const base = { model: 'm', systemPrompt: 's', context: 'c', turns: [{ role: 'user' as const, text: 'q' }], tools: ctx() };
    expect((await runConversation({ ...base, create: async () => message('refusal', []) })).result).toEqual({ kind: 'refused' });
    expect((await runConversation({ ...base, create: async () => message('end_turn', [{ type: 'thinking', thinking: '' }]) })).result).toEqual({ kind: 'failed', reason: 'empty' });
    const loop = await runConversation({ ...base, create: async () => message('tool_use', [{ type: 'tool_use', id: 'x', name: 'get_accounts', input: {} }]) });
    expect(loop.result).toEqual({ kind: 'failed', reason: 'too_many_steps' });
    expect(loop.steps).toBe(6);
  });

  it('relais vers un modèle de secours : blocs internes antérieurs non renvoyés', () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 'a' },
      { type: 'text', text: 'Début' },
      { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
      { type: 'thinking', thinking: '', signature: 'b' },
      { type: 'tool_use', id: 't', name: 'get_accounts', input: {} },
    ] as unknown as Parameters<typeof echoable>[0];
    expect(echoable(content).map((b) => b.type)).toEqual(['text', 'fallback', 'thinking', 'tool_use']);
  });
});
