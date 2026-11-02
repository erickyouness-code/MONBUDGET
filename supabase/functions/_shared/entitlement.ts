/**
 * Conversion de l'état officiel RevenueCat (API REST « subscribers ») en
 * ligne de la table `entitlements`. Code pur, sans dépendance à Deno :
 * testé avec Jest (voir __tests__/entitlement.test.ts).
 */

export const ENTITLEMENT_ID = 'premium';

export type EntitlementRow = {
  product_id: string | null;
  store: string | null;
  period_type: string | null;
  expires_at: string | null;
  will_renew: boolean;
  billing_issue: boolean;
};

type RcSubscription = {
  expires_date?: string | null;
  period_type?: string | null;
  store?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  grace_period_expires_date?: string | null;
};

type RcEntitlement = {
  expires_date?: string | null;
  product_identifier?: string | null;
  grace_period_expires_date?: string | null;
};

export type RcSubscriberResponse = {
  subscriber?: {
    entitlements?: Record<string, RcEntitlement | undefined>;
    subscriptions?: Record<string, RcSubscription | undefined>;
  };
};

const STORES = new Set(['app_store', 'play_store', 'stripe', 'promotional']);
const PERIODS = new Set(['trial', 'intro', 'normal', 'prepaid']);
/** Accès sans date de fin (ex. accès offert à vie) : date lointaine. */
const NO_END = '2999-12-31T00:00:00.000Z';

const latest = (...dates: (string | null | undefined)[]) =>
  dates.filter((d): d is string => !!d).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

export const NO_ACCESS: EntitlementRow = {
  product_id: null,
  store: null,
  period_type: null,
  expires_at: null,
  will_renew: false,
  billing_issue: false,
};

export function entitlementFromSubscriber(body: RcSubscriberResponse, entitlementId = ENTITLEMENT_ID): EntitlementRow {
  const ent = body.subscriber?.entitlements?.[entitlementId];
  if (!ent) return NO_ACCESS;

  const productId = ent.product_identifier ?? null;
  const sub: RcSubscription = (productId && body.subscriber?.subscriptions?.[productId]) || {};
  // Délai de grâce (problème de paiement en cours de résolution) : l'accès continue.
  const expires = ent.expires_date === null ? NO_END : latest(ent.expires_date, ent.grace_period_expires_date, sub.grace_period_expires_date);

  return {
    product_id: productId,
    store: sub.store && STORES.has(sub.store) ? sub.store : sub.store ? 'unknown' : null,
    period_type: sub.period_type && PERIODS.has(sub.period_type) ? sub.period_type : 'normal',
    expires_at: expires ? new Date(expires).toISOString() : null,
    will_renew: !sub.unsubscribe_detected_at && !sub.billing_issues_detected_at,
    billing_issue: !!sub.billing_issues_detected_at,
  };
}

/** Les identifiants d'utilisateurs Supabase sont des UUID ; on ignore les identifiants anonymes RevenueCat. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RcWebhookEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
};

/** Utilisateurs concernés par une notification (pour un transfert : les deux côtés). */
export function usersFromEvent(event: RcWebhookEvent): string[] {
  const ids = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ];
  return [...new Set(ids.filter((id): id is string => !!id && UUID.test(id)))];
}

/** Comparaison à durée constante (évite de deviner un secret par mesure du temps). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
