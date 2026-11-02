// Assistant financier : répond aux questions de l'utilisateur connecté à partir
// de SES données (lues avec son jeton, limitées par les règles RLS).
// - Abonnement Premium, accord explicite et quota vérifiés ICI, côté serveur.
// - La clé de l'API Claude (ANTHROPIC_API_KEY) reste un secret Supabase : elle
//   n'est jamais dans l'application.
// - Aucun contenu de conversation n'est enregistré ; seul le nombre de
//   questions et de jetons consommés l'est (quota, coûts).
// Déploiement : npx supabase functions deploy assistant
import Anthropic from 'npm:@anthropic-ai/sdk@1';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { runConversation } from '../_shared/assistant/conversation.ts';
import { supabaseData } from '../_shared/assistant/data.ts';
import type { Currency, Lang } from '../_shared/assistant/format.ts';
import { TIME_ZONES, todayIn } from '../_shared/assistant/periods.ts';
import { contextBlock, SYSTEM_PROMPT, weekdayOf } from '../_shared/assistant/prompt.ts';
import { parseRequest } from '../_shared/assistant/request.ts';
import { adminClient, json } from '../_shared/revenuecat.ts';

const MODEL = Deno.env.get('ASSISTANT_MODEL') || 'claude-opus-5-5';
const DAILY_LIMIT = Number(Deno.env.get('ASSISTANT_DAILY_LIMIT') || 20);
const PER_MINUTE_LIMIT = Number(Deno.env.get('ASSISTANT_PER_MINUTE_LIMIT') || 5);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return json(405, { code: 'method_not_allowed' });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { code: 'unauthorized' });
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return json(401, { code: 'unauthorized' });
  const userId = auth.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { code: 'bad_request' });
  }
  const parsed = parseRequest(body);
  if ('error' in parsed) return json(400, { code: 'bad_request', detail: parsed.error });

  try {
    // 1. Abonnement actif (essai compris), vérifié par la base.
    const premium = await userClient.rpc('has_premium');
    if (premium.error) throw premium.error;
    if (premium.data !== true) return json(402, { code: 'premium_required' });

    // 2. Accord explicite de l'utilisateur pour l'envoi de ses données au fournisseur d'IA.
    const profile = await userClient.from('profiles').select('currency_code, country_code, language, assistant_consent_at').maybeSingle();
    if (profile.error) throw profile.error;
    if (!profile.data?.assistant_consent_at) return json(403, { code: 'consent_required' });

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json(503, { code: 'not_configured' });

    // 3. Quota (le compteur n'est modifiable que par le serveur).
    const quota = await adminClient().rpc('assistant_consume', { p_user: userId, p_daily: DAILY_LIMIT, p_per_minute: PER_MINUTE_LIMIT });
    if (quota.error) throw quota.error;
    if (quota.data !== 'ok') return json(429, { code: quota.data });

    const currency: Currency = profile.data.currency_code === 'XAF' ? 'XAF' : 'MAD';
    const appLang = (['fr', 'ar', 'en'] as const).find((l) => l === profile.data?.language);
    const lang: Lang = parsed.language ?? appLang ?? 'fr';
    const today = todayIn(TIME_ZONES[profile.data.country_code ?? ''] ?? 'Africa/Casablanca');

    const client = new Anthropic({
      apiKey,
      // Adresse modifiable uniquement pour les tests automatiques.
      ...(Deno.env.get('ANTHROPIC_API_URL') ? { baseURL: Deno.env.get('ANTHROPIC_API_URL') } : {}),
      timeout: 60_000,
      maxRetries: 2,
    });

    const { result, usage } = await runConversation({
      create: (params) => client.beta.messages.create(params),
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
      context: contextBlock({ today, weekday: weekdayOf(today), country: profile.data.country_code, currency, lang }),
      turns: parsed.turns,
      tools: { data: supabaseData(userClient), currency, lang, today },
    });

    const record = await adminClient().rpc('assistant_record_usage', { p_user: userId, p_input: usage.input, p_output: usage.output });
    if (record.error) console.error('Consommation non enregistrée', record.error);

    if (result.kind === 'answer') return json(200, { reply: result.text, truncated: result.truncated });
    if (result.kind === 'refused') return json(200, { code: 'refused' });
    return json(502, { code: 'assistant_error' });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) {
      console.error('API Claude indisponible', e.message);
      return json(503, { code: 'busy' });
    }
    if (e instanceof Anthropic.APIError) {
      console.error(`API Claude : erreur ${e.status}`, e.message);
      return json(502, { code: 'assistant_error' });
    }
    console.error('Assistant en échec', e);
    return json(500, { code: 'server_error' });
  }
});
