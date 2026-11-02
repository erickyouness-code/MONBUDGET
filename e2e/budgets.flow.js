// Lancer avec : npm run test:e2e
// Étape 4 : budget du mois, plafonds par catégorie, alertes.
// Horloge du navigateur figée au 12 novembre 2026 (19 jours restants, 12 jours écoulés).
const { chromium } = require('playwright');
const { EMAIL, createDb, installMock, checker } = require('./mock-supabase');

const out = process.argv[2];
const { check, report } = checker();

const db = createDb({ onboarded: true });
db.today = '2026-11-12';
const cash = db.addAccount({ name: 'Espèces', type: 'cash', initial_balance_minor: 500000 });
db.addTx({ type: 'income', amount_minor: 900000, occurred_on: '2026-11-01', account_id: cash.id, category_id: db.category('salary') });
db.addTx({ type: 'expense', amount_minor: 50000, occurred_on: '2026-11-03', account_id: cash.id, category_id: db.category('food') });
db.addTx({ type: 'expense', amount_minor: 25000, occurred_on: '2026-11-05', account_id: cash.id, category_id: db.category('transport') });
db.addTx({ type: 'expense', amount_minor: 99900, occurred_on: '2026-10-20', account_id: cash.id, category_id: db.category('food') });

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
  page.on('dialog', (d) => d.accept());
  await installMock(page, db);

  const wait = (ms = 900) => page.waitForTimeout(ms);
  const vt = (text) => page.getByText(text).locator('visible=true').first();
  const visible = (text) => vt(text).isVisible();
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
  const addExpense = async (amount, category) => {
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await wait(1500);
    await page.getByLabel('Montant').fill(amount);
    await page.getByRole('radio', { name: category }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await wait(2500);
  };

  await page.goto('http://localhost:8765/');
  await wait(2000);
  await page.getByRole('button', { name: 'J’ai déjà un compte' }).click();
  await wait();
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill('budget2026');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await wait(2500);

  // ---------- Budget du mois ----------
  check('tableau de bord : invitation à définir un budget', await visible('Définir mon budget du mois'));
  await page.getByRole('button', { name: 'Définir mon budget du mois' }).click();
  await wait(1500);
  check('aide au choix : déjà dépensé 750 DH ce mois-ci', await visible(/Déjà dépensé ce mois-ci : 750\s?DH/));
  await page.getByLabel('Plafond mensuel').fill('3000');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(2200);
  const global = db.budgets.find((b) => b.category_id === null);
  check('budget global enregistré pour novembre (3 000 DH, alerte à 80 %)', global && global.limit_minor === 300000 && global.alert_threshold_pct === 80 && global.effective_month === '2026-11-01');
  check('reste : 2 250 DH', await visible(/^2\s?250\s?DH$/));
  check('25 % utilisé', await visible('25 % utilisé'));
  // 2 250 DH / 19 jours = 118,42 → arrondi prudent à 118 DH
  check('118 DH par jour pendant 19 jours', await visible(/Vous pouvez dépenser 118\s?DH par jour pendant 19 jours/));
  // 750 DH en 12 jours → 30 jours ≈ 1 875 DH
  check('estimation de fin de mois : environ 1 875 DH', await visible(/environ 1\s?875\s?DH en fin de mois/));
  await shot('s4-1-budget-global');

  // ---------- Plafond par catégorie ----------
  await page.getByRole('tab', { name: 'Planifier' }).click();
  await wait(1200);
  check('onglet Planifier : 1 budget actif', await visible('Budgets actifs : 1'));
  await page.getByRole('button', { name: /Budgets/ }).first().click();
  await wait(1500);
  await page.getByRole('button', { name: 'Ajouter un plafond par catégorie' }).click();
  await wait(1500);
  check('catégories triées par dépenses du mois (Alimentation en tête)', (await page.getByRole('radio').first().getAttribute('aria-label')) === 'Alimentation');
  await page.getByRole('radio', { name: 'Alimentation' }).click();
  await wait(600);
  await page.getByLabel('Plafond mensuel').fill('700');
  await page.getByRole('radio', { name: '90 %' }).click();
  await page.getByRole('radio', { name: '80 %' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(2000);
  const food = db.budgets.find((b) => b.category_id === db.category('food'));
  check('plafond Alimentation enregistré (700 DH)', food && food.limit_minor === 70000);
  check('ligne Alimentation : 500 DH sur 700 DH, reste 200 DH', (await visible(/500\s?DH sur 700\s?DH/)) && (await visible(/Reste 200\s?DH/)));
  await shot('s4-2-budgets');
  await page.goBack();
  await wait(800);

  // ---------- Alertes ----------
  await page.getByRole('tab', { name: 'Accueil' }).click();
  await wait(1200);
  await addExpense('100', 'Alimentation'); // 600 / 700 = 86 %
  check('alerte « bientôt atteint » à 86 %', (await visible('Budget bientôt atteint')) && (await visible('Alimentation : 86 % du plafond utilisé.')));
  await shot('s4-3-alerte');
  await page.getByRole('button', { name: 'Fermer' }).first().click();
  await wait(500);
  await addExpense('50', 'Transport'); // aucun budget franchi
  check('pas d’alerte quand aucun seuil n’est franchi', !(await visible('Budget bientôt atteint')) && !(await visible('Budget dépassé')));
  await addExpense('150', 'Alimentation'); // 750 / 700 = 107 %
  check('alerte « dépassé » à 107 %', (await visible('Budget dépassé')) && (await visible(/Alimentation : 107 %/)));
  await wait(6500); // le message disparaît seul
  check('le message disparaît après quelques secondes', !(await visible('Budget dépassé')));
  check('tableau de bord : bandeau « Budgets à surveiller : Alimentation »', await visible('Budgets à surveiller : Alimentation'));
  await shot('s4-4-accueil-alerte');

  // ---------- Mois passé : pas de budget défini à l'époque ----------
  await page.getByRole('button', { name: 'Mois précédent' }).click();
  await wait(1500);
  check('octobre : pas de carte budget (aucun budget à l’époque)', !(await visible('Budget du mois')));
  await page.getByRole('button', { name: 'Mois suivant' }).click();
  await wait(1200);

  // ---------- Retirer un budget ----------
  await page.getByRole('button', { name: /Budgets à surveiller/ }).click();
  await wait(1500);
  await page.getByText('Alimentation').locator('visible=true').first().click();
  await wait(1500);
  await page.getByRole('button', { name: 'Retirer ce budget' }).click();
  await wait(1800);
  check('budget Alimentation retiré (plafond vide à partir de novembre)', db.budgets.find((b) => b.category_id === db.category('food'))?.limit_minor === null);
  check('écran Budgets : plus de plafond par catégorie', await visible('Aucun plafond par catégorie pour l’instant.'));

  check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  report();
  await browser.close();
})().catch((e) => {
  report();
  console.error('ARRÊT :', e.message.split('\n')[0]);
  process.exit(1);
});
