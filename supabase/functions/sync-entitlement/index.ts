// Appelée par l'application juste après un achat ou une restauration, pour un
// accès immédiat (sans attendre la notification RevenueCat).
// Ne synchronise QUE l'utilisateur connecté (identifié par son jeton Supabase).
// Déploiement : npx supabase functions deploy sync-entitlement
import { createClient } from 'npm:@supabase/supabase-js@2';

import { fetchEntitlement, json, saveEntitlement } from '../_shared/revenuecat.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { error: 'Non connecté' });

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return json(401, { error: 'Non connecté' });

  try {
    const row = await fetchEntitlement(data.user.id);
    await saveEntitlement(data.user.id, row);
    return json(200, { active: !!row.expires_at && Date.parse(row.expires_at) > Date.now(), expires_at: row.expires_at, period_type: row.period_type });
  } catch (e) {
    console.error('Synchronisation impossible', e);
    return json(502, { error: 'Synchronisation impossible' });
  }
});
