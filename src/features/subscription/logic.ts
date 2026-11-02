/**
 * Règles d'affichage de l'abonnement (pures, testées).
 */

type Unit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
const DAYS: Record<Unit, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/** Forme minimale d'un produit renvoyé par le store (via RevenueCat). */
export type StoreProductLike = {
  priceString: string;
  /** iOS : offre d'introduction (essai gratuit si prix 0). */
  introPrice?: { price: number; periodUnit: string; periodNumberOfUnits: number } | null;
  /** Android : option d'abonnement par défaut, avec une éventuelle phase gratuite. */
  defaultOption?: { freePhase?: { billingPeriod: { unit: string; value: number } } | null } | null;
};

/**
 * Durée de l'essai gratuit annoncée PAR LE STORE (en jours), ou null.
 * On n'affiche jamais un essai que le store ne confirme pas.
 */
export function trialDays(product: StoreProductLike | null | undefined): number | null {
  if (!product) return null;
  const ios = product.introPrice;
  if (ios && ios.price === 0) {
    const unit = ios.periodUnit.toUpperCase() as Unit;
    if (DAYS[unit]) return DAYS[unit] * ios.periodNumberOfUnits;
  }
  const android = product.defaultOption?.freePhase?.billingPeriod;
  if (android) {
    const unit = android.unit.toUpperCase() as Unit;
    if (DAYS[unit]) return DAYS[unit] * android.value;
  }
  return null;
}

export type EntitlementState = {
  active: boolean;
  periodType: string | null;
  expiresAt: string | null;
  willRenew: boolean;
  billingIssue: boolean;
  store: string | null;
  /** A déjà eu un accès (essai ou abonnement) qui a pris fin. */
  hadAccess: boolean;
};

export type EntitlementRowLike = {
  period_type: string | null;
  expires_at: string | null;
  will_renew: boolean;
  billing_issue: boolean;
  store: string | null;
} | null;

/** Interprète la ligne `entitlements` (null : jamais abonné). */
export function entitlementState(row: EntitlementRowLike, now = Date.now()): EntitlementState {
  const expires = row?.expires_at ? Date.parse(row.expires_at) : null;
  const active = expires !== null && expires > now;
  return {
    active,
    periodType: row?.period_type ?? null,
    expiresAt: row?.expires_at ?? null,
    willRenew: !!row?.will_renew,
    billingIssue: !!row?.billing_issue,
    store: row?.store ?? null,
    hadAccess: expires !== null && !active,
  };
}

export type StatusLine =
  | { key: 'trial'; date: string; willRenew: boolean }
  | { key: 'renews'; date: string }
  | { key: 'endsOn'; date: string }
  | { key: 'expired' }
  | { key: 'none' };

/** Phrase de statut pour les réglages. */
export function statusLine(s: EntitlementState): StatusLine {
  if (!s.active) return s.hadAccess ? { key: 'expired' } : { key: 'none' };
  const date = s.expiresAt!.slice(0, 10);
  if (s.periodType === 'trial') return { key: 'trial', date, willRenew: s.willRenew };
  return s.willRenew ? { key: 'renews', date } : { key: 'endsOn', date };
}
