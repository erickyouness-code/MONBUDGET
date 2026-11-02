// Lancer avec : npm run test:e2e
// Étape 8 : page Premium (accès expiré), vérification serveur, problème de paiement.
const { chromium } = require('playwright');
const { EMAIL, createDb, installMock, checker } = require('./mock-supabase');

const out = process.argv[2];
const { check, report } = checker();

const db = createDb({ onboarded: true });
db.today = '2026-11-12';
db.addAccount({ name: 'Espèces', type: 'cash', initial_balance_minor: 100000 });
// Essai terminé le 10 novembre.
db.entitlement = { period_type: 'trial', expires_at: '2026-11-10T00:00:00Z', will_renew: false, billing_issue: false, store: 'app_store' };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('monbudget.preferences'))
      localStorage.setItem('monbudget.preferences', JSON.stringify({ state: { theme: 'light', language: 'fr', currency: 'MAD', demoMode: false, notifications: true }, version: 1 }));
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await installMock(page, db);

  const wait = (ms = 900) => page.waitForTimeout(ms);
  const vt = (text) => page.getByText(text).locator('visible=true').first();
  const visible = (text) => vt(text).isVisible();
  const fullShot = async (name) => {
    const h = await page.evaluate(() => Math.max(...[...document.querySelectorAll('div')].map((d) => d.scrollHeight)));
    await page.setViewportSize({ width: 390, height: Math.min(h + 60, 3000) });
    await wait(600);
    await page.screenshot({ path: `${out}/${name}.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(300);
  };

  await page.goto('http://localhost:8765/');
  await wait(2000);
  await page.getByRole('button', { name: 'J’ai déjà un compte' }).click();
  await wait();
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill('budget2026');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await wait(2500);

  // ---------- Accès expiré : page Premium ----------
  check('page Premium : « Votre accès Premium est terminé »', await visible('Votre accès Premium est terminé'));
  check('pas d’accès à l’application (pas d’onglets)', !(await page.getByRole('tab', { name: 'Accueil' }).isVisible().catch(() => false)));
  check('avantages listés', (await visible('Budgets par catégorie et alertes avant de dépasser')) && (await visible('Objectifs d’épargne avec plan mensuel')));
  check('version web : achats indisponibles, expliqué', await visible(/Les achats ne sont pas disponibles dans la version web/));
  check('bouton d’abonnement désactivé sans offre', (await page.getByRole('button', { name: 'S’abonner' }).getAttribute('aria-disabled')) === 'true');
  check('aucun essai annoncé (déjà utilisé, non confirmé par le store)', !(await visible(/jours gratuits/)));
  check('conditions de renouvellement et d’annulation affichées', await visible(/se renouvelle automatiquement, sauf annulation au moins 24 h avant/));
  check('données conservées : message honnête', await visible(/Vos données sont conservées en sécurité/));
  await fullShot('s8-1-premium');

  // ---------- Réglages accessibles sans abonnement ----------
  await page.getByRole('button', { name: 'Réglages' }).click();
  await wait(1500);
  check('réglages : « Abonnement terminé »', await visible('Abonnement terminé'));
  await page.getByRole('button', { name: 'Voir l’offre Premium' }).click();
  await wait(1200);
  check('retour à la page Premium', await visible('Votre accès Premium est terminé'));

  // ---------- Abonnement pris sur le téléphone → vérifié par le serveur ----------
  db.onSync = () => {
    db.entitlement = { period_type: 'normal', expires_at: '2026-12-12T10:00:00Z', will_renew: true, billing_issue: false, store: 'play_store' };
  };
  await page.getByRole('button', { name: 'Vérifier mon abonnement' }).click();
  await wait(3500);
  check('le serveur a été interrogé (sync-entitlement)', db.syncCalls >= 1);
  check('accès ouvert : tableau de bord', await visible('Tableau de bord'));

  await page.getByLabel('Ouvrir les réglages').click();
  await wait(1500);
  check('réglages : « Premium actif · renouvellement le 12 déc. »', await visible(/Premium actif · renouvellement le 12 déc/));
  check('bouton « Gérer ou annuler mon abonnement »', await page.getByRole('button', { name: 'Gérer ou annuler mon abonnement' }).isVisible());
  await page.screenshot({ path: `${out}/s8-2-reglages.png` });

  // ---------- Problème de paiement : bandeau, l'accès continue (délai de grâce) ----------
  db.entitlement = { ...db.entitlement, billing_issue: true, will_renew: false };
  await page.goto('http://localhost:8765/'); // réouverture de l'application
  await wait(3000);
  check('problème de paiement : bandeau sur l’accueil, accès maintenu', (await visible(/Problème de paiement sur votre abonnement/)) && (await visible('Tableau de bord')));
  await page.screenshot({ path: `${out}/s8-3-paiement.png` });

  // ---------- Expiration pendant l'utilisation ----------
  db.entitlement = { ...db.entitlement, expires_at: '2026-11-11T00:00:00Z', billing_issue: false };
  await page.goto('http://localhost:8765/'); // réouverture de l'application
  await wait(3000);
  check('abonnement expiré : retour à la page Premium', await visible('Votre accès Premium est terminé'));

  check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  report();
  await browser.close();
})().catch((e) => {
  report();
  console.error('ARRÊT :', e.message.split('\n')[0]);
  process.exit(1);
});
