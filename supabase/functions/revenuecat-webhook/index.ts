// Notifications RevenueCat (achat, renouvellement, annulation, expiration…).
// Déploiement : npx supabase functions deploy revenuecat-webhook --no-verify-jwt
// (RevenueCat ne possède pas de jeton Supabase : il s'authentifie avec un secret partagé.)
import { safeEqual, usersFromEvent, type RcWebhookEvent } from '../_shared/entitlement.ts';
import { adminClient, fetchEntitlement, json, saveEntitlement } from '../_shared/revenuecat.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });

  // 1. Authentification : le secret configuré dans RevenueCat (en-tête Authorization).
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  const received = req.headers.get('Authorization') ?? '';
  if (!expected || !safeEqual(received, `Bearer ${expected}`)) return json(401, { error: 'Non autorisé' });

  let event: RcWebhookEvent;
  try {
    event = ((await req.json()) as { event?: RcWebhookEvent }).event ?? {};
  } catch {
    return json(400, { error: 'Corps invalide' });
  }
  if (!event.id || !event.type) return json(400, { error: 'Événement incomplet' });
  if (event.type === 'TEST') return json(200, { ok: true });

  const users = usersFromEvent(event);
  const db = adminClient();

  // 2. Journal (anti-doublon et audit). Un événement déjà reçu est simplement re-synchronisé.
  await db.from('billing_events').upsert({ id: event.id, user_id: users[0] ?? null, type: event.type }, { onConflict: 'id', ignoreDuplicates: true });

  // 3. On ne fait pas confiance au contenu de la notification : on redemande l'état officiel.
  try {
    for (const userId of users) await saveEntitlement(userId, await fetchEntitlement(userId));
  } catch (error) {
    console.error('Synchronisation impossible', error);
    return json(500, { error: 'Synchronisation impossible' }); // RevenueCat réessaiera
  }
  return json(200, { ok: true, users: users.length });
});
