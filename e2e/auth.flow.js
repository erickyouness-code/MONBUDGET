// Lancer avec : npm run test:e2e
// Parcours complet dans le navigateur, avec un faux serveur Supabase.
const { Buffer } = require('node:buffer');
const { chromium } = require('playwright');
const out = process.argv[2];
const API = 'https://test-project.supabase.co';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const EMAIL = 'amina@example.com';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = () =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, email: EMAIL, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const user = { id: USER_ID, email: EMAIL, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { language: 'fr' }, identities: [{ id: '1' }], created_at: new Date().toISOString() };
const session = () => ({ access_token: jwt(), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh-123', user });

const server = { profile: { id: USER_ID, display_name: null, country_code: null, currency_code: null, language: 'fr', onboarding_completed_at: null }, calls: [] };

const checks = [];
const check = (name, ok) => { checks.push(`${ok ? '✔' : '✘'} ${name}`); if (!ok) process.exitCode = 1; };

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

  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    server.calls.push(`${req.method()} ${url.pathname}`);
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (req.method() === 'OPTIONS') return json(200, {});

    if (url.pathname === '/auth/v1/signup') { server.signupBody = body; return json(200, user); }
    if (url.pathname === '/auth/v1/verify') { server.verifyBody = body; return body.token === '123456' ? json(200, session()) : json(403, { code: 'otp_expired', error_code: 'otp_expired', msg: 'Token has expired or is invalid' }); }
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') return body.password === 'budget2026' ? json(200, session()) : json(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return json(200, session());
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (url.pathname === '/auth/v1/user') return json(200, user);
    if (url.pathname === '/rest/v1/profiles') {
      server.lastAuth = req.headers()['authorization'];
      if (req.method() === 'PATCH') { server.patchBody = body; Object.assign(server.profile, body); }
      return json(200, server.profile);
    }
    return json(404, { msg: 'not mocked' });
  });

  const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
  const wait = (ms = 900) => page.waitForTimeout(ms);

  // 1. Accueil
  await page.goto('http://localhost:8765/');
  await wait(2000);
  check('écran de bienvenue affiché sans session', await page.getByText('Prenez le contrôle de votre argent').isVisible());
  await shot('f1-welcome');

  // 2. Inscription : validation
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await wait();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await wait(500);
  check('erreur e-mail vide affichée', await page.getByText('Indiquez votre adresse e-mail.').isVisible());
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill('abcdefgh');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await wait(500);
  check('mot de passe sans chiffre refusé', await page.getByText('Ajoutez au moins un chiffre.').isVisible());
  await shot('f2-signup-errors');
  check('aucun appel serveur avec un formulaire invalide', !server.calls.includes('POST /auth/v1/signup'));

  // 3. Inscription valide → code
  await page.getByLabel('Mot de passe', { exact: true }).fill('budget2026');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await wait(1200);
  check('la langue est transmise à l’inscription', server.signupBody?.data?.language === 'fr');
  check('écran du code affiché', await page.getByText('Vérifiez votre e-mail').isVisible());
  await page.getByLabel('Code reçu par e-mail').fill('999999');
  await page.getByRole('button', { name: 'Valider' }).click();
  await wait(1000);
  check('code erroné : message clair', await page.getByText('Ce code est incorrect ou a expiré').isVisible());
  await page.getByLabel('Code reçu par e-mail').fill('123456');
  await shot('f3-verify');
  await page.getByRole('button', { name: 'Valider' }).click();
  await wait(1800);

  // 4. Paramétrage
  check('écran de paramétrage après confirmation', await page.getByText('Configurons votre espace').isVisible());
  check('le profil est lu avec le jeton de l’utilisateur', (server.lastAuth || '').startsWith('Bearer ey'));
  await page.getByRole('button', { name: 'Commencer' }).click();
  await wait(500);
  check('pays obligatoire', await page.getByText('Choisissez votre pays.').isVisible());
  await page.getByRole('radio', { name: /Gabon/ }).click();
  await wait(400);
  await page.getByLabel('Votre prénom (facultatif)').fill('Amina');
  await shot('f4-onboarding');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await wait(2000);
  check('profil enregistré : Gabon / FCFA / prénom / langue', server.patchBody?.country_code === 'GA' && server.patchBody?.currency_code === 'XAF' && server.patchBody?.display_name === 'Amina' && server.patchBody?.language === 'fr' && !!server.patchBody?.onboarding_completed_at);
  check('tableau de bord affiché', await page.getByText('Tableau de bord').isVisible());
  check('montants en FCFA', await page.getByText(/0\s?FCFA/).first().isVisible());
  await shot('f5-dashboard');

  // 5. Rechargement : la session est conservée
  await page.reload();
  await wait(2500);
  check('session conservée après redémarrage', await page.getByText('Tableau de bord').isVisible());

  // 6. Déconnexion
  await page.getByLabel('Ouvrir les réglages').click();
  await wait(1200);
  check('e-mail visible dans les réglages', await page.getByText(EMAIL).isVisible());
  await shot('f6-settings');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await wait(1800);
  check('retour à l’accueil après déconnexion', await page.getByText('Prenez le contrôle de votre argent').isVisible());
  check('session effacée du stockage', await page.evaluate(() => !localStorage.getItem('monbudget.auth')));

  // 7. Connexion
  await page.getByRole('button', { name: 'J’ai déjà un compte' }).click();
  await wait();
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill('mauvais123');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await wait(1200);
  check('mauvais mot de passe : message clair', await page.getByText('E-mail ou mot de passe incorrect.').isVisible());
  await shot('f7-signin-error');
  await page.getByLabel('Mot de passe', { exact: true }).fill('budget2026');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await wait(2000);
  check('connexion → tableau de bord (profil déjà paramétré)', await page.getByText('Tableau de bord').isVisible());

  // 8. Bienvenue en arabe
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('monbudget.preferences', JSON.stringify({ state: { theme: 'light', language: 'ar', currency: 'MAD', demoMode: false }, version: 1 })); });
  await page.goto('http://localhost:8765/');
  await wait(2000);
  await shot('f8-welcome-ar');

  check('aucune erreur JavaScript', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  console.log(checks.join('\n'));
  await browser.close();
})();
