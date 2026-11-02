import { monthTotals, notificationPlan, occurrences, occurrencesBetween, upcoming, type Completion, type ScheduledItem } from '../logic';

const item = (over: Partial<ScheduledItem>): ScheduledItem => ({
  id: 'i1',
  kind: 'bill',
  title: 'Électricité',
  amount_minor: 35000,
  category_id: null,
  account_id: null,
  frequency: 'monthly',
  interval_count: 1,
  start_date: '2026-01-31',
  end_date: null,
  remind_days_before: 2,
  is_active: true,
  note: null,
  ...over,
});

describe('dates d’échéance', () => {
  it('mensuel le 31 : 30 en avril, 28 en février', () => {
    expect(occurrences(item({}), '2026-01-01', '2026-05-31')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });
  it('mensuel ne dérive pas après un mois court', () => {
    // Après le 28 février, on revient bien au 31 mars (et non au 28).
    expect(occurrences(item({}), '2026-02-01', '2026-03-31')).toEqual(['2026-02-28', '2026-03-31']);
  });
  it('tous les 3 mois, en commençant au milieu de l’historique', () => {
    expect(occurrences(item({ start_date: '2025-01-15', interval_count: 3 }), '2026-03-01', '2026-12-31')).toEqual(['2026-04-15', '2026-07-15', '2026-10-15']);
  });
  it('hebdomadaire et une fois', () => {
    expect(occurrences(item({ frequency: 'weekly', start_date: '2026-11-02' }), '2026-11-01', '2026-11-20')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(occurrences(item({ frequency: 'once', start_date: '2026-11-20' }), '2026-11-01', '2026-11-30')).toEqual(['2026-11-20']);
    expect(occurrences(item({ frequency: 'once', start_date: '2026-12-20' }), '2026-11-01', '2026-11-30')).toEqual([]);
  });
  it('annuel le 29 février : 28 hors années bissextiles', () => {
    expect(occurrences(item({ frequency: 'yearly', start_date: '2028-02-29' }), '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });
  it('respecte la date de fin et la mise en pause', () => {
    expect(occurrences(item({ start_date: '2026-01-10', end_date: '2026-03-10' }), '2026-01-01', '2026-12-31')).toHaveLength(3);
    expect(occurrences(item({ is_active: false }), '2026-01-01', '2026-12-31')).toEqual([]);
  });
});

const done = (due_on: string, status: 'paid' | 'skipped' = 'paid'): Completion => ({ id: `c${due_on}`, item_id: 'i1', due_on, status, transaction_id: null });

describe('état des échéances', () => {
  const bill = item({ start_date: '2026-10-10' });
  it('en retard, réglée, ignorée, aujourd’hui, à venir', () => {
    const list = occurrencesBetween([bill], [done('2026-10-10')], '2026-10-01', '2026-12-31', '2026-11-10');
    expect(list.map((o) => [o.dueOn, o.state])).toEqual([
      ['2026-10-10', 'paid'],
      ['2026-11-10', 'today'],
      ['2026-12-10', 'upcoming'],
    ]);
    const late = occurrencesBetween([bill], [], '2026-10-01', '2026-10-31', '2026-11-10');
    expect(late[0]?.state).toBe('overdue');
  });
  it('regroupe : retards, aujourd’hui, 7 jours, plus tard', () => {
    const groups = upcoming([bill, item({ id: 'i2', frequency: 'weekly', start_date: '2026-11-13', title: 'Marché' })], [], '2026-11-12');
    expect(groups.overdue.map((o) => o.dueOn)).toEqual(['2026-11-10']);
    expect(groups.today).toEqual([]);
    expect(groups.week.map((o) => o.dueOn)).toEqual(['2026-11-13']);
    expect(groups.later.map((o) => o.dueOn)).toEqual(['2026-11-20', '2026-11-27', '2026-12-04', '2026-12-10', '2026-12-11']);
  });
});

describe('totaux du mois', () => {
  it('reste à payer et à recevoir, hors échéances réglées ou ignorées', () => {
    const items = [
      item({ start_date: '2026-11-05' }), // 350 payée
      item({ id: 'i2', start_date: '2026-11-20', amount_minor: 12000 }), // 120 à payer
      item({ id: 'i3', kind: 'income', start_date: '2026-11-25', amount_minor: 900000 }), // 9 000 à recevoir
      item({ id: 'i4', kind: 'reminder', amount_minor: null, start_date: '2026-11-15' }),
    ];
    expect(monthTotals(items, [done('2026-11-05')], '2026-11-01', '2026-11-12')).toEqual({ toPayMinor: 12000, toReceiveMinor: 900000 });
  });
});

describe('notifications', () => {
  it('programme X jours avant, uniquement dans le futur et non réglées', () => {
    const plan = notificationPlan([item({ start_date: '2026-11-13', remind_days_before: 2 })], [done('2026-12-13')], '2026-11-12');
    // 13 nov. − 2 j = 11 nov. (passé) → ignorée ; 13 déc. réglée → ignorée ; 13 janv. → 11 janv.
    expect(plan.map((n) => [n.dueOn, n.date])).toEqual([['2027-01-13', '2027-01-11']]);
  });
  it('n’envoie rien sans rappel demandé et respecte le maximum', () => {
    expect(notificationPlan([item({ remind_days_before: null, start_date: '2026-11-20' })], [], '2026-11-12')).toEqual([]);
    const daily = item({ frequency: 'weekly', start_date: '2026-11-13', remind_days_before: 0 });
    expect(notificationPlan([daily, { ...daily, id: 'b' }, { ...daily, id: 'c' }], [], '2026-11-12', 5)).toHaveLength(5);
  });
});
