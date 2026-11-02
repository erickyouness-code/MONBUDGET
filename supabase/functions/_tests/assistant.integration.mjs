// Test d'intégration de la fonction « assistant » : elle est réellement exécutée
// (Deno) face à une fausse API Claude et une fausse base Supabase.
// Vérifie l'ordre des contrôles (connexion, abonnement, accord, quota), que les
// données sont lues avec le jeton de l'UTILISATEUR, et la boucle d'outils.
// Lancer avec : npm run test:functions
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const DENO = process.env.DENO_BIN || 'deno';
const USER = '11111111-2222-3333-4444-555555555555';
const USER_TOKEN = 'jeton-utilisateur';
const SERVICE_KEY = 'cle-service-test';
const FAKE_PORT = 54401;
const FN_PORT = 8000;

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// ---------- État de la fausse base ----------
const state = {
  premium: true,
  consent: '2026-11-01T10:00:00Z',
  quota: 'ok',
  anthropic: [], // réponses préparées de la fausse API Claude
  anthropicStatus: 200,
};
const seen = { anthropic: [], consume: [], usage: [], dataAuth: new Set() };

const rows = {
  transactions: [
    { id: 't1', type: 'expense', amount_minor: 12050, occurred_on: today, category_id: 'c-food', account_id: 'a1', to_account_id: null, description: 'Courses' },
    { id: 't2', type: 'transfer', amount_minor: 50000, occurred_on: today, category_id: null, account_id: 'a1', to_account_id: 'a2', description: null },
  ],
  categories: [{ id: 'c-food', key: 'food', name: null, kind: 'expense' }],
  accounts: [{ id: 'a1', name: 'Espèces', type: 'cash', is_archived: false }],
  account_balances: [{ account_id: 'a1', balance_minor: 98765 }],
};

const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const send = (status, payload, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(payload));
    };
    const url = new URL(req.url, 'http://x');
    const auth = req.headers.authorization;

    // --- Fausse API Claude ---
    if (url.pathname === '/v1/messages') {
      const parsed = JSON.parse(body);
      seen.anthropic.push({ body: parsed, auth: req.headers.authorization ?? req.headers['x-api-key'], beta: req.headers['anthropic-beta'] });
      if (state.anthropicStatus !== 200) {
        return send(state.anthropicStatus, { type: 'error', error: { type: 'rate_limit_error', message: 'busy' } }, { 'retry-after-ms': '1' });
      }
      const next = state.anthropic.shift();
      return send(200, {
        id: `msg_${seen.anthropic.length}`,
        type: 'message',
        role: 'assistant',
        model: parsed.model,
        stop_reason: next.stop_reason,
        stop_sequence: null,
        content: next.content,
        usage: { input_tokens: 300, output_tokens: 50, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 },
      });
    }

    // --- Faux Supabase : connexion ---
    if (url.pathname === '/auth/v1/user') {
      if (auth === `Bearer ${USER_TOKEN}`) return send(200, { id: USER, aud: 'authenticated', role: 'authenticated', email: 'a@b.c' });
      return send(401, { message: 'invalid token' });
    }

    // --- Fonctions SQL ---
    if (url.pathname === '/rest/v1/rpc/has_premium') return send(200, state.premium);
    if (url.pathname === '/rest/v1/rpc/assistant_consume') {
      seen.consume.push({ auth, args: JSON.parse(body) });
      return send(200, state.quota);
    }
    if (url.pathname === '/rest/v1/rpc/assistant_record_usage') {
      seen.usage.push({ auth, args: JSON.parse(body) });
      return send(204, null);
    }
    if (url.pathname === '/rest/v1/rpc/budget_status') return send(200, []);

    // --- Tables (lecture) ---
    const table = url.pathname.replace('/rest/v1/', '');
    if (table === 'profiles') {
      const profile = { currency_code: 'MAD', country_code: 'MA', language: 'fr', assistant_consent_at: state.consent };
      return send(200, (req.headers.accept ?? '').includes('vnd.pgrst.object') ? profile : [profile]);
    }
    seen.dataAuth.add(auth);
    return send(200, rows[table] ?? []);
  });
});
await new Promise((r) => fake.listen(FAKE_PORT, r));

// ---------- La vraie fonction, exécutée par Deno ----------
const functionsDir = fileURLToPath(new URL('..', import.meta.url));
const proc = spawn(DENO, ['run', '--allow-net', '--allow-env', 'assistant/index.ts'], {
  cwd: functionsDir,
  env: {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ANTHROPIC_'))),
    SUPABASE_URL: `http://localhost:${FAKE_PORT}`,
    SUPABASE_ANON_KEY: 'cle-anon-test',
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    ANTHROPIC_API_KEY: 'sk-ant-test',
    ANTHROPIC_API_URL: `http://localhost:${FAKE_PORT}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
proc.stdout.on('data', (d) => (logs += d));
proc.stderr.on('data', (d) => (logs += d));

const url = `http://localhost:${FN_PORT}`;
for (let i = 0; i < 200; i++) {
  try {
    await fetch(url, { method: 'GET' });
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 300));
  }
}

const results = [];
const check = (name, ok) => {
  results.push(`${ok ? '✔' : '✘'} ${name}`);
  if (!ok) process.exitCode = 1;
};
const ask = (messages, token = USER_TOKEN) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ messages, language: 'fr' }),
  });
const question = [{ role: 'user', text: 'Combien ai-je dépensé cette semaine ?' }];
const codeOf = async (res) => (await res.json()).code;

try {
  check('sans connexion : refusé (401)', (await ask(question, null)).status === 401);
  check('jeton invalide : refusé (401)', (await ask(question, 'faux')).status === 401);
  check('méthode GET : refusée (405)', (await fetch(url)).status === 405);

  const bad = await ask([{ role: 'assistant', text: 'x' }]);
  check('requête invalide : refusée (400)', bad.status === 400);

  state.premium = false;
  const r402 = await ask(question);
  check('sans abonnement : refusé (402 premium_required)', r402.status === 402 && (await codeOf(r402)) === 'premium_required');
  state.premium = true;

  state.consent = null;
  const r403 = await ask(question);
  check('sans accord de l’utilisateur : refusé (403 consent_required)', r403.status === 403 && (await codeOf(r403)) === 'consent_required');
  state.consent = '2026-11-01T10:00:00Z';

  state.quota = 'daily_limit';
  const r429 = await ask(question);
  check('quota atteint : refusé (429 daily_limit)', r429.status === 429 && (await codeOf(r429)) === 'daily_limit');
  check('quota réservé avec la clé serveur, limites par défaut', seen.consume.at(-1)?.auth === `Bearer ${SERVICE_KEY}` && seen.consume.at(-1)?.args.p_daily === 20 && seen.consume.at(-1)?.args.p_user === USER);
  state.quota = 'ok';
  check('aucun appel à l’IA avant ces contrôles', seen.anthropic.length === 0);

  // ---------- Parcours normal : un outil, puis la réponse ----------
  state.anthropic.push(
    { stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'tu_1', name: 'get_summary', input: { period: 'this_week' } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Cette semaine : 120,50 DH de dépenses.' }] },
  );
  const ok = await ask(question);
  const okBody = await ok.json();
  check('réponse renvoyée (200)', ok.status === 200 && okBody.reply === 'Cette semaine : 120,50 DH de dépenses.');
  const [first, second] = seen.anthropic;
  check('clé API ajoutée par le serveur (secret Supabase)', first?.auth === 'Bearer sk-ant-test');
  check('modèle claude-opus-5-5, effort bas, relais de secours activé', first?.body.model === 'claude-opus-5-5' && first.body.output_config?.effort === 'low' && first.body.fallbacks === 'default' && String(first.beta).includes('server-side-fallback-2026-07-01'));
  check('consignes mises en cache, contexte du jour séparé', first?.body.system[0].cache_control?.type === 'ephemeral' && first.body.system[1].text.includes(`Today's date: ${today}`));
  check('9 outils en lecture seule proposés, sans appel forcé', first?.body.tools.length === 9 && first.body.tool_choice === undefined);
  const toolResult = second?.body.messages.at(-1).content[0];
  const summary = toolResult && JSON.parse(toolResult.content);
  check('résultat d’outil calculé sur les données (transfert exclu)', toolResult?.tool_use_id === 'tu_1' && summary.expenses === '120,50 DH' && summary.transfers_excluded === 1);
  check('réponse du modèle renvoyée sans modification', JSON.stringify(second?.body.messages[1].content) === JSON.stringify([{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'tu_1', name: 'get_summary', input: { period: 'this_week' } }]));
  check('données lues avec le jeton de l’utilisateur (jamais la clé serveur)', seen.dataAuth.size === 1 && seen.dataAuth.has(`Bearer ${USER_TOKEN}`));
  const used = seen.usage.at(-1);
  check('consommation enregistrée (jetons) avec la clé serveur', used?.auth === `Bearer ${SERVICE_KEY}` && used.args.p_input === 4600 && used.args.p_output === 100);

  // ---------- Refus du modèle ----------
  state.anthropic.push({ stop_reason: 'refusal', content: [] });
  const refused = await ask(question);
  check('refus du modèle : message prévu (code refused)', refused.status === 200 && (await codeOf(refused)) === 'refused');

  // ---------- API Claude saturée ----------
  state.anthropicStatus = 429;
  const busy = await ask(question);
  check('API Claude saturée : 503 busy après nouvelles tentatives', busy.status === 503 && (await codeOf(busy)) === 'busy');
  state.anthropicStatus = 200;
} finally {
  proc.kill();
  fake.close();
}
console.log(results.join('\n'));
if (process.exitCode) console.log(logs);
