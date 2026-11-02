import { addDaysIso, daysBetween, estimateCompletion, goalStatus, planContributions, progressOf } from '../logic';

describe('dates', () => {
  it('compte les jours entre deux dates', () => {
    expect(daysBetween('2026-11-12', '2026-11-30')).toBe(18);
    expect(daysBetween('2026-11-12', '2027-03-12')).toBe(120);
    expect(daysBetween('2026-11-12', '2026-11-01')).toBe(-11);
    expect(addDaysIso('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('progression', () => {
  it('calcule le pourcentage (arrondi vers le bas) et le reste', () => {
    expect(progressOf(30000, 50000)).toEqual({ ratio: 0.6, percent: 60, remainingMinor: 20000, reached: false });
    expect(progressOf(49999, 50000).percent).toBe(99); // jamais 100 % avant d'y être
    expect(progressOf(60000, 50000)).toMatchObject({ remainingMinor: 0, reached: true });
  });
});

describe('plan d’épargne', () => {
  it('répartit le reste par mois et par semaine, arrondi vers le haut', () => {
    // 2 000 DH en 120 jours : 4 mois → 500 DH/mois ; 18 semaines → 111,12 → 112 DH/semaine
    expect(planContributions(200000, '2026-11-12', '2027-03-12', 100)).toEqual({
      kind: 'plan',
      daysLeft: 120,
      perMonthMinor: 50000,
      perWeekMinor: 11200,
    });
  });
  it('gère l’échéance aujourd’hui, dépassée ou absente', () => {
    expect(planContributions(10000, '2026-11-12', '2026-11-12', 100)).toMatchObject({ kind: 'plan', perMonthMinor: 10000, perWeekMinor: 10000 });
    expect(planContributions(10000, '2026-11-12', '2026-11-02', 100)).toEqual({ kind: 'overdue', daysLate: 10 });
    expect(planContributions(10000, '2026-11-12', null, 100)).toEqual({ kind: 'noDeadline' });
    expect(planContributions(0, '2026-11-12', '2027-01-01', 100)).toEqual({ kind: 'reached' });
  });
  it('arrondit au franc pour le FCFA', () => {
    expect(planContributions(100000, '2026-11-12', '2027-02-10', 1)).toMatchObject({ perMonthMinor: 33334 });
  });
});

describe('estimation de la date d’atteinte', () => {
  it('utilise le rythme récent', () => {
    // 300 DH épargnés en 30 jours (10 DH/jour), reste 1 000 DH → 100 jours
    expect(estimateCompletion(100000, 30000, '2026-10-14', '2026-11-12')).toBe('2027-02-20');
  });
  it('ne devine pas sans historique suffisant ou sans versement', () => {
    expect(estimateCompletion(100000, 30000, '2026-11-05', '2026-11-12')).toBeNull(); // 8 jours
    expect(estimateCompletion(100000, 0, '2026-01-01', '2026-11-12')).toBeNull();
  });
});

describe('situation', () => {
  const plan = planContributions(100000, '2026-11-12', '2027-03-01', 100);
  it('en bonne voie, en retard, inconnue', () => {
    expect(goalStatus(plan, '2027-02-20', '2027-03-01')).toBe('onTrack');
    expect(goalStatus(plan, '2027-04-01', '2027-03-01')).toBe('behind');
    expect(goalStatus(plan, null, '2027-03-01')).toBe('unknown');
    expect(goalStatus({ kind: 'reached' }, null, null)).toBe('reached');
    expect(goalStatus({ kind: 'overdue', daysLate: 3 }, null, '2026-11-09')).toBe('overdue');
  });
});
