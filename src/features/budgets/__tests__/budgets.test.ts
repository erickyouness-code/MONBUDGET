import { budgetLevel, crossedAlerts, dailyAllowance, daysLeftInMonth, projectEndOfMonth, usedPercent, type BudgetStatus } from '../logic';

const b = (spentMinor: number, limitMinor = 70000, thresholdPct = 80, categoryId: string | null = 'food'): BudgetStatus => ({
  categoryId,
  limitMinor,
  thresholdPct,
  spentMinor,
});

describe('niveau d’un budget', () => {
  it('normal, alerte au seuil, dépassé au-delà du plafond', () => {
    expect(budgetLevel(b(55000))).toBe('ok'); // 78 %
    expect(budgetLevel(b(56000))).toBe('warning'); // 80 % pile
    expect(budgetLevel(b(70000))).toBe('warning'); // 100 % : atteint, pas dépassé
    expect(budgetLevel(b(70001))).toBe('exceeded');
  });
  it('respecte un seuil personnalisé', () => {
    expect(budgetLevel(b(60000, 70000, 90))).toBe('ok');
    expect(budgetLevel(b(63000, 70000, 90))).toBe('warning');
  });
  it('calcule le pourcentage consommé', () => {
    expect(usedPercent(b(60000))).toBe(86);
    expect(usedPercent(b(80000))).toBe(114);
  });
});

describe('anticiper la fin de mois', () => {
  it('compte les jours restants, aujourd’hui compris', () => {
    expect(daysLeftInMonth(new Date(2026, 10, 12))).toBe(19); // 12 → 30 novembre
    expect(daysLeftInMonth(new Date(2026, 10, 30))).toBe(1);
    expect(daysLeftInMonth(new Date(2028, 1, 1))).toBe(29); // février bissextile
  });
  it('donne un montant par jour arrondi vers le bas', () => {
    // 5 000 − 750 = 4 250 DH sur 19 jours = 223,68… → 223 DH
    expect(dailyAllowance(500000, 75000, new Date(2026, 10, 12), 100)).toBe(22300);
    expect(dailyAllowance(500000, 500000, new Date(2026, 10, 12), 100)).toBeNull();
    // FCFA : unité = 1 franc
    expect(dailyAllowance(300000, 0, new Date(2026, 10, 30), 1)).toBe(300000);
  });
  it('estime la fin de mois seulement à partir du 3e jour', () => {
    expect(projectEndOfMonth(75000, new Date(2026, 10, 2))).toBeNull();
    // 750 DH en 12 jours → 30 jours ≈ 1 875 DH
    expect(projectEndOfMonth(75000, new Date(2026, 10, 12))).toBe(187500);
  });
});

describe('alertes déclenchées par une dépense', () => {
  it('signale le passage au seuil puis le dépassement', () => {
    expect(crossedAlerts([b(50000)], [b(60000)]).map((a) => a.level)).toEqual(['warning']);
    expect(crossedAlerts([b(60000)], [b(80000)]).map((a) => a.level)).toEqual(['exceeded']);
  });
  it('ne répète pas une alerte déjà connue', () => {
    expect(crossedAlerts([b(60000)], [b(65000)])).toEqual([]);
    expect(crossedAlerts([b(80000)], [b(90000)])).toEqual([]);
  });
  it('trie : dépassements d’abord, budget global avant les catégories', () => {
    const before = [b(0, 500000, 80, null), b(0)];
    const after = [b(450000, 500000, 80, null), b(80000)];
    const alerts = crossedAlerts(before, after);
    expect(alerts.map((a) => [a.status.categoryId, a.level])).toEqual([
      ['food', 'exceeded'],
      [null, 'warning'],
    ]);
  });
  it('traite un nouveau budget comme parti de zéro', () => {
    expect(crossedAlerts([], [b(80000)]).map((a) => a.level)).toEqual(['exceeded']);
  });
});
