import { analyze, detectRecurring, normalizeLabel, type EngineInput, type Insight, type Tx } from '../engine';

const exp = (occurred_on: string, amount: number, category_id = 'food', description: string | null = null): Tx => ({
  type: 'expense',
  amount_minor: amount * 100,
  occurred_on,
  category_id,
  description,
});
const inc = (occurred_on: string, amount: number): Tx => ({ type: 'income', amount_minor: amount * 100, occurred_on, category_id: 'salary', description: null });

const base = (transactions: Tx[], over: Partial<EngineInput> = {}): EngineInput => ({
  today: '2026-11-12',
  currency: 'MAD',
  transactions,
  budgets: [],
  totalBalanceMinor: null,
  remainingScheduled: null,
  calendarEntries: [],
  ...over,
});
const find = <K extends Insight['kind']>(list: Insight[], kind: K) => list.find((i) => i.kind === kind) as Extract<Insight, { kind: K }> | undefined;

/** Trois mois d'historique « normal » (août → octobre) + un salaire chaque mois. */
function history(): Tx[] {
  const list: Tx[] = [];
  for (const m of ['08', '09', '10']) {
    list.push(inc(`2026-${m}-01`, 9000));
    list.push(exp(`2026-${m}-03`, 300, 'food'), exp(`2026-${m}-08`, 300, 'food'));
    list.push(exp(`2026-${m}-05`, 100, 'transport'), exp(`2026-${m}-10`, 100, 'transport'));
    list.push(exp(`2026-${m}-20`, 1500, 'leisure')); // après le 12 : hors période comparée
  }
  return list;
}

describe('données insuffisantes', () => {
  it('le dit clairement au lieu de deviner', () => {
    const r = analyze(base([exp('2026-11-10', 50), exp('2026-11-11', 20)]));
    expect(find(r, 'notEnoughData')).toMatchObject({ count: 2 });
    expect(find(r, 'categoryUp')).toBeUndefined();
  });
});

describe('habitudes par catégorie (à période égale)', () => {
  it('signale une hausse nette et une baisse nette', () => {
    const now = [inc('2026-11-01', 9000), exp('2026-11-03', 600, 'food'), exp('2026-11-09', 600, 'food'), exp('2026-11-05', 50, 'transport')];
    const r = analyze(base([...history(), ...now]));
    // Alimentation : 1 200 vs 600 en moyenne du 1er au 12 → +100 %
    expect(find(r, 'categoryUp')).toMatchObject({ categoryId: 'food', currentMinor: 120000, averageMinor: 60000, percent: 100, months: 3 });
    // Transport : 50 vs 200 → −75 %, mais −150 DH ≥ 50 DH : significatif
    expect(find(r, 'categoryDown')).toMatchObject({ categoryId: 'transport', percent: -75 });
    // Les loisirs du 20 ne comptent pas : on compare du 1er au 12.
    expect(r.some((i) => i.kind === 'categoryDown' && i.categoryId === 'leisure')).toBe(false);
  });
  it('ignore les petites variations', () => {
    const now = [exp('2026-11-03', 330, 'food'), exp('2026-11-09', 330, 'food')]; // +10 %
    expect(find(analyze(base([...history(), ...now])), 'categoryUp')).toBeUndefined();
  });
  it('ne compare pas sans au moins 2 mois d’historique', () => {
    const r = analyze(base([exp('2026-10-03', 100), exp('2026-10-05', 100), ...Array.from({ length: 10 }, (_, i) => exp(`2026-11-0${(i % 9) + 1}`, 300))]));
    expect(find(r, 'categoryUp')).toBeUndefined();
  });
  it('un mois sans aucune donnée ne fait pas baisser la moyenne', () => {
    const list = history().filter((t) => !t.occurred_on.startsWith('2026-08')); // août vide
    const now = [exp('2026-11-03', 600, 'food'), exp('2026-11-09', 600, 'food')];
    expect(find(analyze(base([...list, ...now])), 'categoryUp')).toMatchObject({ averageMinor: 60000, months: 2 });
  });
});

describe('revenus et dépenses du mois', () => {
  it('taux d’épargne positif', () => {
    const r = analyze(base([...history(), inc('2026-11-01', 9000), exp('2026-11-03', 3000)]));
    expect(find(r, 'savingsRate')).toMatchObject({ rate: 67, severity: 'positive' });
  });
  it('alerte si les dépenses dépassent les revenus', () => {
    const r = analyze(base([...history(), inc('2026-11-01', 1000), exp('2026-11-03', 1500)]));
    expect(find(r, 'spendingOverIncome')).toMatchObject({ gapMinor: 50000 });
    expect(r[0]?.severity).toBe('warning'); // les alertes passent en premier
  });
  it('sans revenu ce mois-ci, ne conclut rien', () => {
    const r = analyze(base([...history(), exp('2026-11-03', 1500)]));
    expect(find(r, 'spendingOverIncome')).toBeUndefined();
    expect(find(r, 'savingsRate')).toBeUndefined();
  });
});

describe('budgets et fin de mois', () => {
  it('budget dépassé et budget presque atteint', () => {
    const r = analyze(
      base(history(), {
        budgets: [
          { categoryId: 'food', limitMinor: 70000, thresholdPct: 80, spentMinor: 80000 },
          { categoryId: null, limitMinor: 500000, thresholdPct: 80, spentMinor: 420000 },
        ],
      }),
    );
    expect(find(r, 'budgetExceeded')).toMatchObject({ categoryId: 'food', overMinor: 10000, percent: 114 });
    expect(find(r, 'budgetWarning')).toMatchObject({ categoryId: null, remainingMinor: 80000, percent: 84 });
  });
  it('estime la fin de mois à partir du solde et du calendrier', () => {
    const r = analyze(base(history(), { totalBalanceMinor: 200000, remainingScheduled: { incomeMinor: 0, expenseMinor: 300000 } }));
    expect(find(r, 'endOfMonth')).toMatchObject({ estimateMinor: -100000, severity: 'warning' });
  });
  it('pas d’estimation sans échéance au calendrier', () => {
    expect(find(analyze(base(history(), { totalBalanceMinor: 200000, remainingScheduled: { incomeMinor: 0, expenseMinor: 0 } })), 'endOfMonth')).toBeUndefined();
  });
});

describe('catégories et petites dépenses', () => {
  it('top 3 avec part des dépenses', () => {
    const r = analyze(base([...history(), exp('2026-11-02', 600, 'food'), exp('2026-11-03', 300, 'transport'), exp('2026-11-04', 100, 'leisure')]));
    expect(find(r, 'topCategories')?.items).toEqual([
      { categoryId: 'food', amountMinor: 60000, share: 60 },
      { categoryId: 'transport', amountMinor: 30000, share: 30 },
      { categoryId: 'leisure', amountMinor: 10000, share: 10 },
    ]);
  });
  it('repère les petites dépenses qui s’additionnent', () => {
    const cafes = Array.from({ length: 12 }, (_, i) => exp(`2026-11-${String(i + 1).padStart(2, '0')}`, 25, 'food', 'Café'));
    expect(find(analyze(base([...history(), ...cafes])), 'smallExpenses')).toMatchObject({ count: 12, totalMinor: 30000 });
  });
});

describe('dépenses récurrentes', () => {
  it('normalise les descriptions', () => {
    expect(normalizeLabel('  Netflix  11/2026 ')).toBe('netflix');
    expect(normalizeLabel('Électricité')).toBe('electricite');
    expect(normalizeLabel('42')).toBeNull();
  });
  it('détecte un abonnement mensuel à montant stable', () => {
    const list = ['08', '09', '10', '11'].map((m) => exp(`2026-${m}-05`, m === '10' ? 125 : 120, 'leisure', `Streaming ${m}`));
    const found = detectRecurring(base(list));
    expect(found).toEqual([
      { key: 'd:streaming', label: 'Streaming 11', categoryId: 'leisure', typicalMinor: 12000, months: 4, lastDate: '2026-11-05', inCalendar: false },
    ]);
  });
  it('ignore les achats fréquents et les montants très variables', () => {
    const groceries = ['08', '09', '10'].flatMap((m) => [exp(`2026-${m}-02`, 200, 'food', 'Marjane'), exp(`2026-${m}-15`, 180, 'food', 'Marjane'), exp(`2026-${m}-25`, 210, 'food', 'Marjane')]);
    const variable = ['08', '09', '10'].map((m, i) => exp(`2026-${m}-10`, [100, 300, 50][i]!, 'bills', 'Taxi'));
    expect(detectRecurring(base([...groceries, ...variable]))).toEqual([]);
  });
  it('sait si la dépense est déjà dans le calendrier', () => {
    const list = ['08', '09', '10'].map((m) => exp(`2026-${m}-20`, 349, 'bills', 'Internet'));
    expect(detectRecurring(base(list, { calendarEntries: [{ title: 'internet', amountMinor: null, categoryId: null }] }))[0]?.inCalendar).toBe(true);
    // Sans description : même catégorie, même montant
    const rent = ['08', '09', '10'].map((m) => exp(`2026-${m}-05`, 3000, 'housing'));
    expect(detectRecurring(base(rent, { calendarEntries: [{ title: 'Loyer', amountMinor: 300000, categoryId: 'housing' }] }))[0]?.inCalendar).toBe(true);
  });
});
