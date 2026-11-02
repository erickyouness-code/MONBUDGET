import { entitlementFromSubscriber, NO_ACCESS, safeEqual, usersFromEvent } from '../entitlement';

const USER = '11111111-2222-3333-4444-555555555555';

describe('état d’abonnement RevenueCat → droit d’accès', () => {
  it('essai en cours', () => {
    const row = entitlementFromSubscriber({
      subscriber: {
        entitlements: { premium: { expires_date: '2026-11-15T10:00:00Z', product_identifier: 'monbudget_monthly' } },
        subscriptions: { monbudget_monthly: { period_type: 'trial', store: 'app_store', unsubscribe_detected_at: null } },
      },
    });
    expect(row).toEqual({
      product_id: 'monbudget_monthly',
      store: 'app_store',
      period_type: 'trial',
      expires_at: '2026-11-15T10:00:00.000Z',
      will_renew: true,
      billing_issue: false,
    });
  });

  it('annulation : accès jusqu’à la fin de la période, sans renouvellement', () => {
    const row = entitlementFromSubscriber({
      subscriber: {
        entitlements: { premium: { expires_date: '2026-12-01T00:00:00Z', product_identifier: 'p' } },
        subscriptions: { p: { period_type: 'normal', store: 'play_store', unsubscribe_detected_at: '2026-11-12T08:00:00Z' } },
      },
    });
    expect(row).toMatchObject({ expires_at: '2026-12-01T00:00:00.000Z', will_renew: false, store: 'play_store' });
  });

  it('problème de paiement : délai de grâce pris en compte', () => {
    const row = entitlementFromSubscriber({
      subscriber: {
        entitlements: { premium: { expires_date: '2026-11-10T00:00:00Z', grace_period_expires_date: '2026-11-26T00:00:00Z', product_identifier: 'p' } },
        subscriptions: { p: { billing_issues_detected_at: '2026-11-10T01:00:00Z', store: 'app_store' } },
      },
    });
    expect(row).toMatchObject({ expires_at: '2026-11-26T00:00:00.000Z', billing_issue: true, will_renew: false });
  });

  it('aucun droit Premium : aucun accès', () => {
    expect(entitlementFromSubscriber({ subscriber: { entitlements: {} } })).toEqual(NO_ACCESS);
    expect(entitlementFromSubscriber({})).toEqual(NO_ACCESS);
  });

  it('accès sans fin (offert) et magasin inconnu', () => {
    const row = entitlementFromSubscriber({
      subscriber: { entitlements: { premium: { expires_date: null, product_identifier: 'gift' } }, subscriptions: { gift: { store: 'amazon' } } },
    });
    expect(row).toMatchObject({ expires_at: '2999-12-31T00:00:00.000Z', store: 'unknown', period_type: 'normal' });
  });
});

describe('notification RevenueCat → utilisateurs concernés', () => {
  it('garde les identifiants Supabase et ignore les anonymes', () => {
    expect(usersFromEvent({ app_user_id: USER, original_app_user_id: '$RCAnonymousID:abc', aliases: [USER] })).toEqual([USER]);
  });
  it('transfert : les deux comptes sont re-synchronisés', () => {
    const other = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(usersFromEvent({ type: 'TRANSFER', transferred_from: [USER], transferred_to: [other] }).sort()).toEqual([USER, other].sort());
  });
});

describe('vérification du secret', () => {
  it('compare exactement', () => {
    expect(safeEqual('Bearer abc', 'Bearer abc')).toBe(true);
    expect(safeEqual('Bearer abd', 'Bearer abc')).toBe(false);
    expect(safeEqual('', 'Bearer abc')).toBe(false);
  });
});
