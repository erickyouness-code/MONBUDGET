import { canGoForward, comparisonRanges, computeChange, savingsRate, shiftMonth } from '../logic';

describe('périodes comparées', () => {
  it('mois en cours : même période du mois précédent', () => {
    const r = comparisonRanges(new Date(2026, 10, 1), new Date(2026, 10, 12));
    expect(r).toEqual({
      current: { from: '2026-11-01', to: '2026-11-12' },
      previous: { from: '2026-10-01', to: '2026-10-12' },
      mode: 'samePeriod',
    });
  });

  it('31 mars : comparé au mois de février entier (28 ou 29 jours)', () => {
    expect(comparisonRanges(new Date(2026, 2, 1), new Date(2026, 2, 31)).previous).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(comparisonRanges(new Date(2028, 2, 1), new Date(2028, 2, 31)).previous).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('janvier : comparé à décembre de l’année précédente', () => {
    expect(comparisonRanges(new Date(2027, 0, 1), new Date(2027, 0, 10)).previous).toEqual({ from: '2026-12-01', to: '2026-12-10' });
  });

  it('mois passé : mois complets', () => {
    const r = comparisonRanges(new Date(2026, 8, 1), new Date(2026, 10, 12));
    expect(r).toEqual({
      current: { from: '2026-09-01', to: '2026-09-30' },
      previous: { from: '2026-08-01', to: '2026-08-31' },
      mode: 'fullMonth',
    });
  });
});

describe('variation', () => {
  it('calcule le pourcentage arrondi', () => {
    expect(computeChange(1200, 1000)).toEqual({ percent: 20, direction: 'up' });
    expect(computeChange(750, 1000)).toEqual({ percent: -25, direction: 'down' });
    expect(computeChange(1000, 1000)).toEqual({ percent: 0, direction: 'flat' });
  });
  it('n’invente pas de pourcentage si le mois précédent est vide', () => {
    expect(computeChange(500, 0)).toEqual({ percent: null, direction: 'up' });
    expect(computeChange(0, 0)).toEqual({ percent: null, direction: 'flat' });
  });
});

describe('taux d’épargne', () => {
  it('part des revenus non dépensée', () => {
    expect(savingsRate(1230000, 925000)).toBe(25);
    expect(savingsRate(100000, 150000)).toBe(-50);
    expect(savingsRate(0, 5000)).toBeNull();
  });
});

describe('navigation entre les mois', () => {
  it('ne va pas au-delà du mois en cours', () => {
    const today = new Date(2026, 10, 12);
    expect(canGoForward(new Date(2026, 10, 1), today)).toBe(false);
    expect(canGoForward(new Date(2026, 9, 1), today)).toBe(true);
    expect(shiftMonth(new Date(2026, 0, 1), -1)).toEqual(new Date(2025, 11, 1));
  });
});
