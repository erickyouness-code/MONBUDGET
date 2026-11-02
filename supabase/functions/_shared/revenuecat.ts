// Accès serveur à RevenueCat et à la base (exécuté par Supabase Edge Functions, Deno).
import { createClient } from 'npm:@supabase/supabase-js@2';

import { entitlementFromSubscriber, type EntitlementRow, type RcSubscriberResponse } from './entitlement.ts';

/** Lit l'état OFFICIEL de l'abonnement d'un utilisateur auprès de RevenueCat. */
export async function fetchEntitlement(userId: string): Promise<EntitlementRow> {
  const secret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!secret) throw new Error('REVENUECAT_SECRET_API_KEY manquante');
  // Adresse modifiable uniquement pour les tests automatiques.
  const api = Deno.env.get('REVENUECAT_API_URL') ?? 'https://api.revenuecat.com';
  const res = await fetch(`${api}/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`RevenueCat a répondu ${res.status}`);
  return entitlementFromSubscriber((await res.json()) as RcSubscriberResponse);
}

/** Client « administrateur » : la clé service_role ne quitte jamais le serveur. */
export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

export async function saveEntitlement(userId: string, row: EntitlementRow): Promise<void> {
  const { error } = await adminClient()
    .from('entitlements')
    .upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
