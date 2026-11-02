// Suppression définitive du compte de l'utilisateur connecté (exigée par Apple
// et Google). Par sécurité, le mot de passe est redemandé et vérifié ICI.
// Toutes les données sont effacées par la base (suppressions en cascade, testé
// dans supabase/tests/account_deletion.test.sql). Le journal des paiements est
// conservé mais anonymisé.
// Déploiement : npx supabase functions deploy delete-account
import { createClient } from 'npm:@supabase/supabase-js@2';

import { adminClient, deleteRevenueCatCustomer, json } from '../_shared/revenuecat.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return json(405, { code: 'method_not_allowed' });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { code: 'unauthorized' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user?.email) return json(401, { code: 'unauthorized' });
  const user = auth.user;

  let body: { password?: unknown; confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { code: 'bad_request' });
  }
  // Confirmation explicite + mot de passe : jamais de suppression « par accident ».
  if (body.confirm !== 'DELETE' || typeof body.password !== 'string' || !body.password) return json(400, { code: 'bad_request' });

  const checker = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: check, error: checkError } = await checker.auth.signInWithPassword({ email: user.email!, password: body.password });
  if (checkError || check.user?.id !== user.id) return json(403, { code: 'wrong_password' });
  await checker.auth.signOut().catch(() => undefined);

  try {
    // Historique d'achats chez RevenueCat (au mieux ; n'annule pas l'abonnement du store).
    const revenueCatCleared = await deleteRevenueCatCustomer(user.id);
    if (!revenueCatCleared) console.warn('Client RevenueCat non effacé', user.id);

    const { error } = await adminClient().auth.admin.deleteUser(user.id);
    if (error) throw error;
    return json(200, { deleted: true });
  } catch (e) {
    console.error('Suppression du compte impossible', e);
    return json(500, { code: 'server_error' });
  }
});
