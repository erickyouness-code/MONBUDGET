// Lancer avec : npm run test:e2e
// Étape 3 : chiffres du tableau de bord, comparaison, navigation entre les mois.
// L'horloge du navigateur est figée au 12 novembre 2026 pour des résultats reproductibles.
const { chromium } = require('playwright');
const { EMAIL, createDb, installMock, checker } = require('./mock-supabase');

const out = process.argv[2];
const { check, report } = checker();

// ---------- Données ----------
const db = createDb({ onboarded: true });
const cash = db.addAccount({ name: 'Espèces', type: 'cash', initial_balance_minor: 100000 }); // 1 000 DH
const bank = db.addAccount({ name: 'CIH', type: 'bank', initial_balance_minor: 2000000 }); // 20 000 DH
// Octobre
db.addTx({ type: 'expense', amount_minor: 50000, occurred_on: '2026-10-03', account_id: cash.id, category_id: db.category('food') });
db.addTx({ type: 'income', amount_minor: 1000000, occurred_on: '2026-10-05', account_id: bank.id, category_id: db.category('salary') });
db.addTx({ type: 'expense', amount_minor: 300000, occurred_on: '2026-10-20', account_id: bank.id, category_id: db.category('housing'), description: 'Loyer octobre' });
// Novembre (jusqu'au 12)
db.addTx({ type: 'income', amount_minor: 1200000, occurred_on: '2026-11-02', account_id: bank.id, category_id: db.category('salary') });
db.addTx({ type: 'expense', amount_minor: 60000, occurred_on: '2026-11-03', account_id: cash.id, category_id: db.category('food'), description: 'Marché' });
db.addTx({ type: 'expense', amount_minor: 15000, occurred_on: '2026-11-10', account_id: cash.id, category_id: db.category('transport') });
db.addTx({ type: 'transfer', amount_minor: 100000, occurred_on: '2026-11-11', account_id: bank.id, to_account_id: cash.id });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('monbudget.preferences'))
      localStorage.setItem('monbudget.preferences', JSON.stringify({ state: { theme: 'light', language: 'fr', currency: 'MAD', demoMode: false }, version: 1 }));
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
    await page.setViewportSize({ width: 390, height: Math.min(h + 90, 3600) });
    await wait(700);
    await page.screenshot({ path: `${out}/${name}.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(300);
  };

  // Connexion
  await page.goto('http://localhost:8765/');
  await wait(2000);
  await page.getByRole('button', { name: 'J’ai déjà un compte' }).click();
  await wait();
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill('budget2026');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await wait(2500);

  // ---------- Mois en cours (1–12 novembre) ----------
  check('salutation personnalisée', await visible('Bonjour Amina'));
  // Espèces : 1 000 − 500 − 600 − 150 + 1 000 = 750 ; CIH : 20 000 + 10 000 − 3 000 + 12 000 − 1 000 = 38 000
  check('solde disponible : 38 750 DH (transfert neutre)', await visible(/^38\s?750\s?DH$/));
  check('mois affiché : Novembre 2026', await visible('Novembre 2026'));
  check('comparaison avec la même période (1er – 12 oct.)', await visible(/Comparé à la même période du mois dernier \(1 oct\.? – 12 oct\.?\)/));
  check('revenus du mois : 12 000 DH', await visible(/^12\s?000\s?DH$/));
  check('dépenses du mois : 750 DH (transfert exclu)', await visible(/^750\s?DH$/));
  check('revenus +20 % (12 000 vs 10 000)', await visible('+20 %'));
  check('dépenses +50 % (750 vs 500, loyer du 20 oct. exclu)', await visible('+50 %'));
  check('revenus − dépenses : 11 250 DH', await visible(/^11\s?250\s?DH$/));
  check('taux d’épargne : 94 %', await visible('Taux d’épargne : 94 %'));
  check('répartition : Alimentation 80 %', (await visible('Alimentation')) && (await visible('80%')));
  check('répartition : Transport 20 %', (await visible('Transport')) && (await visible('20%')));
  check('graphique revenus/dépenses affiché', await visible('Revenus et dépenses'));
  check('courbe du solde affichée avec les mois', (await visible('Évolution du solde')) && (await page.locator('svg text', { hasText: 'Nov' }).count()) > 0);
  check('bouton « mois suivant » désactivé sur le mois en cours', await page.getByRole('button', { name: 'Mois suivant' }).isDisabled());
  await fullShot('s3-1-novembre');

  // ---------- Mois précédent (octobre complet) ----------
  await page.getByRole('button', { name: 'Mois précédent' }).click();
  await wait(1800);
  check('octobre affiché', await visible('Octobre 2026'));
  check('octobre comparé à septembre complet', await visible('Comparé à Septembre 2026'));
  check('revenus d’octobre : 10 000 DH', await visible(/^10\s?000\s?DH$/));
  check('dépenses d’octobre : 3 500 DH', await visible(/^3\s?500\s?DH$/));
  check('septembre vide : aucun pourcentage inventé', await visible('Mois précédent vide'));
  check('le solde disponible reste celui d’aujourd’hui', await visible(/^38\s?750\s?DH$/));
  check('transactions récentes masquées pour un mois passé', !(await visible('Transactions récentes')));
  await fullShot('s3-2-octobre');
  await page.getByRole('button', { name: 'Mois suivant' }).click();
  await wait(1500);
  check('retour à novembre', await visible('Novembre 2026'));

  // ---------- Mise à jour après une nouvelle dépense ----------
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await wait(1500);
  await page.getByLabel('Montant').fill('250');
  await page.getByRole('radio', { name: 'Alimentation' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(2200);
  check('dépenses mises à jour : 1 000 DH', await visible(/^1\s?000\s?DH$/));
  check('solde disponible mis à jour : 38 500 DH', await visible(/^38\s?500\s?DH$/));

  // ---------- Thème sombre + arabe ----------
  await page.evaluate(() => localStorage.setItem('monbudget.preferences', JSON.stringify({ state: { theme: 'dark', language: 'ar', currency: 'MAD', demoMode: false }, version: 1 })));
  await page.reload();
  await wait(2500);
  check('arabe : titre du tableau de bord', await visible('لوحة التحكم'));
  await fullShot('s3-3-ar-sombre');

  check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  report();
  await browser.close();
})().catch((e) => {
  report();
  console.error('ARRÊT :', e.message.split('\n')[0]);
  process.exit(1);
});
