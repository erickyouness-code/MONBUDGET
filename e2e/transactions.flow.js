// Lancer avec : npm run test:e2e
// Étape 2 : parcours complet avec un faux serveur Supabase (auth + base de données).
const { Buffer } = require('node:buffer');
const { chromium } = require('playwright');
const out = process.argv[2];
const API = 'https://test-project.supabase.co';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const EMAIL = 'amina@example.com';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = () => `${b64({ alg: 'HS256' })}.${b64({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const user = { id: USER_ID, email: EMAIL, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, identities: [{ id: '1' }], created_at: new Date().toISOString() };
const session = () => ({ access_token: jwt(), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user });

// ---------- Faux serveur ----------
let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const db = {
  profile: { id: USER_ID, display_name: null, country_code: null, currency_code: null, language: 'fr', onboarding_completed_at: null },
  accounts: [],
  transactions: [],
  categories: [
    ['expense', 'food', 10, '#5B4FE0'], ['expense', 'transport', 20, '#4C8DF6'], ['expense', 'housing', 30, '#B072E8'],
    ['expense', 'bills', 40, '#F5A524'], ['expense', 'phone', 50, '#2BB3C0'], ['expense', 'mobile_money', 60, '#3CC386'],
    ['expense', 'health', 80, '#E5566B'], ['expense', 'other', 990, '#A3A1B8'],
    ['income', 'salary', 10, '#1E9E62'], ['income', 'freelance', 20, '#3CC386'], ['income', 'other_income', 990, '#A3A1B8'],
  ].map(([kind, key, sort_order, color]) => ({ id: uid(), user_id: null, kind, key, name: null, icon: key, color, sort_order, is_archived: false })),
};
const balances = () =>
  db.accounts.map((a) => ({
    account_id: a.id,
    balance_minor: db.transactions.reduce((sum, t) => {
      if (t.type === 'income' && t.account_id === a.id) return sum + t.amount_minor;
      if (t.type === 'expense' && t.account_id === a.id) return sum - t.amount_minor;
      if (t.type === 'transfer' && t.account_id === a.id) return sum - t.amount_minor;
      if (t.type === 'transfer' && t.to_account_id === a.id) return sum + t.amount_minor;
      return sum;
    }, a.initial_balance_minor),
  }));

function applyFilters(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (['select', 'order', 'offset', 'limit', 'or'].includes(k)) continue;
    const [op, ...rest] = v.split('.');
    const val = rest.join('.');
    if (op === 'eq') out = out.filter((r) => String(r[k]) === val);
    if (op === 'gte') out = out.filter((r) => r[k] >= val);
    if (op === 'lte') out = out.filter((r) => r[k] <= val);
    if (op === 'in') { const set = val.replace(/[()]/g, '').split(','); out = out.filter((r) => set.includes(String(r[k]))); }
  }
  const or = params.get('or');
  if (or) {
    const text = (or.match(/description\.ilike\."%(.*?)%"/) || [])[1];
    const ids = ((or.match(/category_id\.in\.\(([^)]*)\)/) || [])[1] || '').split(',').filter(Boolean);
    out = out.filter((r) => (text && (r.description || '').toLowerCase().includes(text.toLowerCase())) || ids.includes(r.category_id));
  }
  const offset = Number(params.get('offset') || 0);
  const limit = params.get('limit') ? Number(params.get('limit')) : undefined;
  return limit ? out.slice(offset, offset + limit) : out.slice(offset);
}

const checks = [];
const check = (name, ok, extra = '') => { checks.push(`${ok ? '✔' : '✘'} ${name}${ok ? '' : ' ' + extra}`); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('monbudget.preferences'))
      localStorage.setItem('monbudget.preferences', JSON.stringify({ state: { theme: 'light', language: 'fr', currency: 'MAD', demoMode: false }, version: 1 }));
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept()); // confirmations de suppression

  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: cors });
    const empty = (status) => route.fulfill({ status, headers: cors, body: '' });
    if (method === 'OPTIONS') return json(200, {});
    const p = url.pathname;
    const params = url.searchParams;

    if (p === '/auth/v1/token') return json(200, session());
    if (p === '/auth/v1/logout') return empty(204);
    if (p === '/auth/v1/user') return json(200, user);

    if (p === '/rest/v1/profiles') {
      if (method === 'PATCH') Object.assign(db.profile, body);
      return json(200, db.profile);
    }
    if (p === '/rest/v1/account_balances') return json(200, balances());
    if (p === '/rest/v1/categories') {
      if (method === 'POST') {
        const row = { id: uid(), user_id: USER_ID, key: null, color: null, is_archived: false, ...body };
        db.categories.push(row);
        return single ? json(201, row) : empty(201);
      }
      return json(200, [...db.categories].sort((a, b) => a.sort_order - b.sort_order));
    }
    if (p === '/rest/v1/accounts') {
      if (method === 'POST') {
        for (const r of [].concat(body)) db.accounts.push({ id: uid(), is_archived: false, created_at: new Date(Date.now() + seq).toISOString(), ...r });
        return empty(201);
      }
      const target = applyFilters(db.accounts, params);
      if (method === 'PATCH') { target.forEach((a) => Object.assign(a, body)); return empty(204); }
      if (method === 'DELETE') {
        if (target.some((a) => db.transactions.some((t) => t.account_id === a.id || t.to_account_id === a.id)))
          return json(409, { code: '23503', message: 'violates foreign key constraint' });
        db.accounts = db.accounts.filter((a) => !target.includes(a));
        return empty(204);
      }
      return json(200, target);
    }
    if (p === '/rest/v1/transactions') {
      if (method === 'POST') {
        for (const r of [].concat(body)) db.transactions.push({ id: uid(), created_at: new Date(Date.now() + seq).toISOString(), ...r });
        return empty(201);
      }
      const sorted = [...db.transactions].sort((a, b) => (b.occurred_on + b.created_at).localeCompare(a.occurred_on + a.created_at));
      const target = applyFilters(sorted, params);
      if (method === 'PATCH') { target.forEach((t) => Object.assign(t, body)); return empty(204); }
      if (method === 'DELETE') { db.transactions = db.transactions.filter((t) => !target.includes(t)); return empty(204); }
      return single ? json(200, target[0]) : json(200, target);
    }
    return json(404, { message: 'non simulé' });
  });

  const vt = (text) => page.getByText(text).locator('visible=true').first();
  const inHistory = (text) => page.getByTestId('history-list').getByText(text).first().isVisible();
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, fullPage: false });
  const wait = (ms = 900) => page.waitForTimeout(ms);
  const balance = (name) => { const a = db.accounts.find((x) => x.name === name); return balances().find((b) => b.account_id === a?.id)?.balance_minor; };
  const visible = (text) => vt(text).isVisible();

  // --- Connexion + paramétrage ---
  await page.goto('http://localhost:8765/');
  await wait(2000);
  await page.getByRole('button', { name: 'J’ai déjà un compte' }).click();
  await wait();
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill('budget2026');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await wait(1800);
  await page.getByRole('radio', { name: /Maroc/ }).click();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await wait(2200);
  check('compte « Espèces » créé automatiquement au paramétrage', db.accounts.length === 1 && db.accounts[0].name === 'Espèces' && db.accounts[0].type === 'cash' && db.accounts[0].currency_code === 'MAD');
  check('tableau de bord affiché', await visible('Tableau de bord'));

  // --- Dépense ---
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await wait(1500);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(500);
  check('montant obligatoire', await visible('Indiquez un montant valide, supérieur à zéro.'));
  check('catégorie obligatoire', await visible('Choisissez une catégorie.'));
  check('aucune écriture avec un formulaire invalide', db.transactions.length === 0);
  await page.getByLabel('Montant').fill('125,505');
  check('pas plus de 2 décimales en dirham', (await page.getByLabel('Montant').inputValue()) === '125,50');
  await page.getByRole('radio', { name: 'Alimentation' }).click();
  await page.getByLabel('Description (facultatif)').fill('Courses marché');
  await shot('s2-1-depense');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(1800);
  const t1 = db.transactions[0];
  check('dépense enregistrée correctement', t1 && t1.type === 'expense' && t1.amount_minor === 12550 && t1.payment_method === 'cash' && t1.description === 'Courses marché' && t1.to_account_id === null);
  check('tableau de bord : dépenses du mois mises à jour', await visible(/125,50\s?DH/));
  check('tableau de bord : transaction récente affichée', await visible('Courses marché'));
  await shot('s2-2-dashboard');

  // --- Nouveau compte bancaire ---
  await page.getByLabel('Ouvrir les réglages').click();
  await wait(1200);
  await page.getByRole('button', { name: /Mes comptes/ }).click();
  await wait(1200);
  await page.getByRole('button', { name: 'Ajouter un compte' }).click();
  await wait(1200);
  await page.getByLabel('Nom du compte').fill('CIH');
  await page.getByRole('radio', { name: 'Banque' }).click();
  await page.getByLabel(/Solde actuel/).fill('10000');
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  await wait(1500);
  check('compte bancaire créé avec son solde initial', db.accounts[1]?.name === 'CIH' && db.accounts[1].type === 'bank' && db.accounts[1].initial_balance_minor === 1000000);
  check('liste des comptes : total juste (10 000 − 125,50)', await visible(/9\s?874,50\s?DH/));
  await shot('s2-3-comptes');
  await page.goBack(); await wait(800);
  await page.goBack(); await wait(1000);

  // --- Revenu ---
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await wait(1500);
  await page.getByRole('radio', { name: 'Revenu' }).click();
  await page.getByLabel('Montant').fill('8000');
  await page.getByRole('radio', { name: 'Salaire' }).click();
  await page.getByRole('radio', { name: /CIH/ }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(1500);

  // --- Transfert ---
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await wait(1500);
  await page.getByRole('radio', { name: 'Transfert' }).click();
  await wait(400);
  check('transfert : pas de catégorie demandée', !(await page.getByRole('radio', { name: 'Alimentation' }).isVisible()));
  await page.getByLabel('Montant').fill('300');
  await page.getByRole('radio', { name: /CIH/ }).first().click();
  await wait(300);
  await page.getByRole('radio', { name: /Espèces/ }).last().click();
  await shot('s2-4-transfert');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(1800);
  const tr = db.transactions.find((t) => t.type === 'transfer');
  check('transfert enregistré entre deux comptes, sans catégorie', tr && tr.category_id === null && tr.account_id === db.accounts[1].id && tr.to_account_id === db.accounts[0].id);
  check('soldes : Espèces 174,50 / CIH 17 700', balance('Espèces') === 17450 && balance('CIH') === 1770000, `${balance('Espèces')} ${balance('CIH')}`);
  check('tableau de bord : le transfert ne change pas revenus/dépenses', (await visible(/8\s?000\s?DH/)) && (await visible(/125,50\s?DH/)));

  // --- Historique, recherche, filtres ---
  await page.getByRole('tab', { name: 'Historique' }).click();
  await wait(1500);
  check('historique : 3 transactions', (await inHistory('Courses marché')) && (await inHistory('CIH → Espèces')) && (await inHistory('Salaire')));
  check('historique : regroupement « Aujourd’hui »', await visible('AUJOURD’HUI'));
  await shot('s2-5-historique');
  await page.getByLabel('Rechercher').fill('marché');
  await wait(1200);
  check('recherche par description', (await inHistory('Courses marché')) && !(await inHistory('CIH → Espèces')));
  await page.getByLabel('Rechercher').fill('salaire');
  await wait(1200);
  check('recherche par nom de catégorie', (await inHistory('Salaire')) && !(await inHistory('Courses marché')));
  await page.getByLabel('Rechercher').fill('zzzz');
  await wait(1200);
  check('recherche sans résultat : message clair', await visible('Aucun résultat'));
  await page.getByLabel('Effacer').click();
  await page.getByRole('radio', { name: 'Transfert' }).locator('visible=true').first().click();
  await wait(1200);
  check('filtre « Transfert »', (await inHistory('CIH → Espèces')) && !(await inHistory('Courses marché')));
  await page.getByRole('radio', { name: 'Tout', exact: true }).locator('visible=true').first().click();
  await wait(1000);

  // --- Modification ---
  await page.getByTestId('history-list').getByText('Courses marché').first().click();
  await wait(1500);
  check('modification : montant prérempli', (await page.getByLabel('Montant').inputValue()) === '125,50');
  await page.getByLabel('Montant').fill('100');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(1500);
  check('modification enregistrée, solde recalculé (Espèces 200)', db.transactions.find((t) => t.description === 'Courses marché')?.amount_minor === 10000 && balance('Espèces') === 20000);

  // --- Suppression ---
  await page.getByTestId('history-list').getByText('Courses marché').first().click();
  await wait(1500);
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await wait(1500);
  check('suppression après confirmation, solde recalculé (Espèces 300)', !db.transactions.some((t) => t.description === 'Courses marché') && balance('Espèces') === 30000);

  // --- Compte utilisé : suppression refusée, archivage proposé ---
  await page.getByRole('button', { name: 'Mes comptes' }).click();
  await wait(1200);
  await vt('CIH').first().click();
  await wait(1200);
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await wait(1200);
  check('compte avec transactions : suppression refusée avec explication', (await visible(/archivez-le plutôt/)) && db.accounts.length === 2);
  await shot('s2-6-compte-utilise');

  // --- Affichage en arabe ---
  await page.evaluate(() => localStorage.setItem('monbudget.preferences', JSON.stringify({ state: { theme: 'light', language: 'ar', currency: 'MAD', demoMode: false }, version: 1 })));
  await page.goto('http://localhost:8765/');
  await wait(2500);
  await page.getByRole('tab', { name: 'السجل' }).click();
  await wait(1500);
  await shot('s2-7-historique-ar');
  await page.getByRole('button', { name: 'إضافة', exact: true }).click();
  await wait(2000);
  await page.getByLabel('المبلغ').fill('75');
  await shot('s2-8-ajout-ar');
  check('arabe : formulaire affiché en arabe', await vt('معاملة جديدة').isVisible());

  check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(checks.join('\n'));
  await browser.close();
})().catch((e) => { console.log(checks.join('\n')); console.error('ARRÊT :', e.message.split('\n')[0]); process.exit(1); });
