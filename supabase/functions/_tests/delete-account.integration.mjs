// Test d'intégration de la fonction « delete-account » : exécutée par Deno face
// à une fausse API Supabase (authentification) et un faux RevenueCat.
// Lancer avec : npm run test:functions
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const DENO = process.env.DENO_BIN || 'deno';
const USER = '11111111-2222-3333-4444-555555555555';
const EMAIL = 'amina@example.com';
const PASSWORD = 'budget2026';
const USER_TOKEN = 'jeton-utilisateur';
const SERVICE_KEY = 'cle-service-test';
const FAKE_PORT = 54402;
const FN_PORT = 8000;
const seen = { deleted: [], rcDeleted: [], signIns: [] };

const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    const url = new URL(req.url, 'http://x');
    const user = { id: USER, email: EMAIL, aud: 'authenticated', role: 'authenticated' };
    if (url.pathname === '/auth/v1/user') {
      return req.headers.authorization === `Bearer ${USER_TOKEN}` ? send(200, user) : send(401, { message: 'invalid' });
    }
    if (url.pathname === '/auth/v1/token') {
      const { email, password } = JSON.parse(body);
      seen.signIns.push(email);
      if (email === EMAIL && password === PASSWORD) {
        return send(200, { access_token: 'tmp', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user });
      }
      return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
    }
    if (url.pathname === '/auth/v1/logout') return send(204, {});
    if (url.pathname.startsWith('/auth/v1/admin/users/') && req.method === 'DELETE') {
      seen.deleted.push({ id: url.pathname.split('/').pop(), auth: req.headers.authorization });
      return send(200, user);
    }
    if (url.pathname.startsWith('/v1/subscribers/') && req.method === 'DELETE') {
      seen.rcDeleted.push({ id: decodeURIComponent(url.pathname.split('/').pop()), auth: req.headers.authorization });
      return send(200, { app_user_id: USER });
    }
    send(404, {});
  });
});
await new Promise((r) => fake.listen(FAKE_PORT, r));

const functionsDir = fileURLToPath(new URL('..', import.meta.url));
const proc = spawn(DENO, ['run', '--allow-net', '--allow-env', 'delete-account/index.ts'], {
  cwd: functionsDir,
  env: {
    ...process.env,
    SUPABASE_URL: `http://localhost:${FAKE_PORT}`,
    SUPABASE_ANON_KEY: 'cle-anon-test',
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    REVENUECAT_SECRET_API_KEY: 'sk_test_revenuecat',
    REVENUECAT_API_URL: `http://localhost:${FAKE_PORT}`,
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
const del = (body, token = USER_TOKEN) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

try {
  check('sans connexion : refusé (401)', (await del({ confirm: 'DELETE', password: PASSWORD }, null)).status === 401);
  check('jeton invalide : refusé (401)', (await del({ confirm: 'DELETE', password: PASSWORD }, 'faux')).status === 401);
  check('sans confirmation explicite : refusé (400)', (await del({ password: PASSWORD })).status === 400);
  check('sans mot de passe : refusé (400)', (await del({ confirm: 'DELETE' })).status === 400);
  const wrong = await del({ confirm: 'DELETE', password: 'mauvais' });
  check('mauvais mot de passe : refusé (403 wrong_password)', wrong.status === 403 && (await wrong.json()).code === 'wrong_password');
  check('rien n’est supprimé après un refus', seen.deleted.length === 0 && seen.rcDeleted.length === 0);
  check('le mot de passe est vérifié pour l’e-mail du compte connecté', seen.signIns.every((e) => e === EMAIL));

  const ok = await del({ confirm: 'DELETE', password: PASSWORD });
  check('suppression acceptée (200)', ok.status === 200 && (await ok.json()).deleted === true);
  check('compte supprimé avec la clé serveur', seen.deleted.length === 1 && seen.deleted[0].id === USER && seen.deleted[0].auth === `Bearer ${SERVICE_KEY}`);
  check('historique RevenueCat effacé avec la clé secrète', seen.rcDeleted.length === 1 && seen.rcDeleted[0].id === USER && seen.rcDeleted[0].auth === 'Bearer sk_test_revenuecat');
} finally {
  proc.kill();
  fake.close();
}
console.log(results.join('\n'));
if (process.exitCode) console.log(logs);
