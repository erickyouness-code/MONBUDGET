import { entitlementState, statusLine, trialDays } from '../logic';

describe('essai gratuit annoncé par le store', () => {
  it('iOS : offre d’introduction gratuite de 3 jours', () => {
    expect(trialDays({ priceString: '29,00 DH', introPrice: { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 3 } })).toBe(3);
  });
  it('Android : phase gratuite de 3 jours', () => {
    expect(trialDays({ priceString: '1 500 FCFA', defaultOption: { freePhase: { billingPeriod: { unit: 'DAY', value: 3 } } } })).toBe(3);
  });
  it('une offre d’introduction payante n’est pas un essai gratuit', () => {
    expect(trialDays({ priceString: '29 DH', introPrice: { price: 9, periodUnit: 'MONTH', periodNumberOfUnits: 1 } })).toBeNull();
  });
  it('rien n’est affiché si le store ne confirme pas d’essai', () => {
    expect(trialDays({ priceString: '29 DH' })).toBeNull();
    expect(trialDays(null)).toBeNull();
  });
});

const now = Date.parse('2026-11-12T10:00:00Z');
const row = (over: object) => ({ period_type: 'normal', expires_at: '2026-12-01T00:00:00Z', will_renew: true, billing_issue: false, store: 'app_store', ...over });

describe('état de l’abonnement', () => {
  it('jamais abonné', () => {
    expect(entitlementState(null, now)).toMatchObject({ active: false, hadAccess: false });
    expect(statusLine(entitlementState(null, now))).toEqual({ key: 'none' });
  });
  it('essai en cours', () => {
    const s = entitlementState(row({ period_type: 'trial', expires_at: '2026-11-15T10:00:00Z' }), now);
    expect(s.active).toBe(true);
    expect(statusLine(s)).toEqual({ key: 'trial', date: '2026-11-15', willRenew: true });
  });
  it('abonnement qui se renouvelle / annulé (fin de période)', () => {
    expect(statusLine(entitlementState(row({}), now))).toEqual({ key: 'renews', date: '2026-12-01' });
    expect(statusLine(entitlementState(row({ will_renew: false }), now))).toEqual({ key: 'endsOn', date: '2026-12-01' });
  });
  it('expiré : plus d’accès, mais on sait qu’il y en a eu un', () => {
    const s = entitlementState(row({ expires_at: '2026-11-10T00:00:00Z' }), now);
    expect(s).toMatchObject({ active: false, hadAccess: true });
    expect(statusLine(s)).toEqual({ key: 'expired' });
  });
  it('problème de paiement signalé', () => {
    expect(entitlementState(row({ billing_issue: true }), now).billingIssue).toBe(true);
  });
});
