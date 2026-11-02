// Test d'intégration de la fonction revenuecat-webhook : elle est réellement
// exécutée (Deno) face à un faux RevenueCat et une fausse base Supabase.
// Lancer avec : npm run test:functions
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const DENO = process.env.DENO_BIN || 'deno';
const USER = '11111111-2222-3333-4444-555555555555';
const FAKE_PORT = 54400;
const FN_PORT = 8000; // port par défaut de Deno.serve
const received = { entitlements: [], events: [], rcCalls: [] };

// ---------- Faux RevenueCat + fausse API Supabase ----------
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url.startsWith('/v1/subscribers/')) {
      received.rcCalls.push({ url: req.url, auth: req.headers.authorization });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        subscriber: {
          entitlements: { premium: { expires_date: '2026-11-15T10:00:00Z', product_identifier: 'monbudget_monthly' } },
          subscriptions: { monbudget_monthly: { period_type: 'trial', store: 'app_store' } },
        },
      }));
    }
    if (req.url.startsWith('/rest/v1/billing_events')) received.events.push(JSON.parse(body));
    if (req.url.startsWith('/rest/v1/entitlements')) received.entitlements.push({ body: JSON.parse(body), auth: req.headers.authorization });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end('[]');
  });
});
await new Promise((r) => fake.listen(FAKE_PORT, r));

// ---------- La vraie fonction, exécutée par Deno ----------
const fnPath = fileURLToPath(new URL('../revenuecat-webhook/index.ts', import.meta.url));
const proc = spawn(DENO, ['run', '--allow-net', '--allow-env', fnPath], {
  env: {
    ...process.env,
    SUPABASE_URL: `http://localhost:${FAKE_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: 'cle-service-test',
    REVENUECAT_SECRET_API_KEY: 'sk_test_revenuecat',
    REVENUECAT_WEBHOOK_AUTH: 'secret-webhook-test',
    REVENUECAT_API_URL: `http://localhost:${FAKE_PORT}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
proc.stdout.on('data', (d) => (logs += d));
proc.stderr.on('data', (d) => (logs += d));

const url = `http://localhost:${FN_PORT}`;
for (let i = 0; i < 100; i++) {
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
const post = (auth, event) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify({ event }) });

try {
  check('sans secret : refusé (401)', (await post(null, { id: 'e0', type: 'INITIAL_PURCHASE', app_user_id: USER })).status === 401);
  check('mauvais secret : refusé (401)', (await post('Bearer faux', { id: 'e0', type: 'INITIAL_PURCHASE', app_user_id: USER })).status === 401);
  check('méthode GET : refusée (405)', (await fetch(url)).status === 405);
  check('aucune écriture après une requête refusée', received.entitlements.length === 0 && received.rcCalls.length === 0);

  const ok = await post('Bearer secret-webhook-test', { id: 'evt_1', type: 'INITIAL_PURCHASE', app_user_id: USER, original_app_user_id: '$RCAnonymousID:x' });
  check('achat valide : accepté (200)', ok.status === 200);
  check('état redemandé à RevenueCat avec la clé secrète', received.rcCalls.length === 1 && received.rcCalls[0].auth === 'Bearer sk_test_revenuecat' && received.rcCalls[0].url.endsWith(USER));
  const ent = received.entitlements[0];
  check(
    'droit d’accès enregistré : essai jusqu’au 15/11, avec la clé service',
    ent && ent.body.user_id === USER && ent.body.period_type === 'trial' && ent.body.expires_at === '2026-11-15T10:00:00.000Z' && ent.auth === 'Bearer cle-service-test',
  );
  check('événement journalisé', received.events.some((e) => e.id === 'evt_1' && e.type === 'INITIAL_PURCHASE'));

  const anon = await post('Bearer secret-webhook-test', { id: 'evt_2', type: 'RENEWAL', app_user_id: '$RCAnonymousID:y' });
  check('utilisateur anonyme : ignoré sans erreur', anon.status === 200 && received.entitlements.length === 1);
  check('événement TEST de RevenueCat : accepté', (await post('Bearer secret-webhook-test', { id: 'evt_t', type: 'TEST' })).status === 200);
  check('événement incomplet : refusé (400)', (await post('Bearer secret-webhook-test', { type: 'RENEWAL' })).status === 400);
} finally {
  proc.kill();
  fake.close();
}
console.log(results.join('\n'));
if (process.exitCode) console.log(logs);
