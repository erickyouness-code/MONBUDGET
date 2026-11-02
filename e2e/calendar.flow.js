// Lancer avec : npm run test:e2e
// Étape 6 : calendrier financier. Horloge figée au 12 novembre 2026.
const { chromium } = require('playwright');
const { EMAIL, createDb, installMock, checker } = require('./mock-supabase');

const out = process.argv[2];
const { check, report } = checker();

const db = createDb({ onboarded: true });
db.today = '2026-11-12';
const cash = db.addAccount({ name: 'Espèces', type: 'cash', initial_balance_minor: 200000 });
const bank = db.addAccount({ name: 'CIH', type: 'bank', initial_balance_minor: 1000000 });
// Loyer le 5 (non payé en novembre → en retard), internet le 20, salaire le 25.
const rent = db.addScheduled({ kind: 'payment', title: 'Loyer', amount_minor: 300000, account_id: bank.id, category_id: db.category('housing'), start_date: '2026-10-05' });
const internet = db.addScheduled({ kind: 'bill', title: 'Internet', amount_minor: 34900, start_date: '2026-10-20' });
const salary = db.addScheduled({ kind: 'income', title: 'Salaire', amount_minor: 900000, account_id: bank.id, category_id: db.category('salary'), start_date: '2026-10-25' });
// Octobre déjà réglé, pour qu'il n'apparaisse pas en retard.
db.completions.push({ id: 'c-oct-rent', item_id: rent.id, due_on: '2026-10-05', status: 'paid', transaction_id: null });
db.completions.push({ id: 'c-oct-net', item_id: internet.id, due_on: '2026-10-20', status: 'paid', transaction_id: null });
db.completions.push({ id: 'c-oct-sal', item_id: salary.id, due_on: '2026-10-25', status: 'paid', transaction_id: null });

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
  page.on('dialog', (d) => d.accept());
  await installMock(page, db);

  const wait = (ms = 900) => page.waitForTimeout(ms);
  const vt = (text) => page.getByText(text).locator('visible=true').first();
  const visible = (text) => vt(text).isVisible();
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
  const fullShot = async (name) => {
    const h = await page.evaluate(() => Math.max(...[...document.querySelectorAll('div')].map((d) => d.scrollHeight)));
    await page.setViewportSize({ width: 390, height: Math.min(h + 90, 3200) });
    await wait(600);
    await shot(name);
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(300);
  };
  const balance = (account) => db.balance(account.name);

  await page.goto('http://localhost:8765/');
  await wait(2000);
  await page.getByRole('button', { name: 'J’ai déjà un compte' }).click();
  await wait();
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill('budget2026');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await wait(2500);

  // ---------- Accueil et Planifier ----------
  check('accueil : « Prochaines échéances » avec le loyer en retard', (await visible('Prochaines échéances')) && (await visible(/5 nov\.? · En retard/)));
  await page.getByRole('tab', { name: 'Planifier' }).click();
  await wait(1200);
  check('Planifier : prochaine échéance = Loyer, 5 nov.', await visible(/Prochaine : Loyer, 5 nov/));
  await page.getByRole('button', { name: /Calendrier financier/ }).click();
  await wait(1800);

  // ---------- Calendrier ----------
  check('reste à payer ce mois : 3 349 DH (loyer + internet)', await visible(/^3\s?349\s?DH$/));
  check('reste à recevoir ce mois : 9 000 DH', await visible(/^9\s?000\s?DH$/));
  check('section « En retard » : Loyer', (await page.getByText('EN RETARD', { exact: true }).isVisible()) && (await visible('Loyer')));
  check('section « Plus tard » : Internet et Salaire', (await visible('PLUS TARD')) && (await visible('Internet')) && (await visible('Salaire')));
  await fullShot('s6-1-calendrier');

  // ---------- Payer le loyer ----------
  await vt('Loyer').click();
  await wait(1500);
  check('fiche : compte CIH présélectionné (annoncé « coché »)', (await page.getByRole('radio', { name: 'CIH' }).getAttribute('aria-checked')) === 'true');
  await shot('s6-2-echeance');
  await page.getByRole('button', { name: 'Marquer comme payé' }).click();
  await wait(2000);
  const rentTx = db.transactions.find((t) => t.description === 'Loyer');
  check('dépense « Loyer » créée (3 000 DH, CIH, catégorie Loyer)', rentTx && rentTx.amount_minor === 300000 && rentTx.account_id === bank.id && rentTx.category_id === db.category('housing'));
  check('solde CIH : 7 000 DH', balance(bank) === 700000);
  check('reste à payer : 349 DH', await visible(/^349\s?DH$/));
  check('plus de retard affiché', !(await page.getByText('EN RETARD', { exact: true }).isVisible()));

  // ---------- Annuler le paiement (via le jour du calendrier) ----------
  await page.getByRole('button', { name: /^5 nov/ }).click();
  await wait(800);
  await vt('Loyer').click();
  await wait(1500);
  check('fiche réglée : « Enregistré dans votre historique »', await visible('Enregistré dans votre historique.'));
  await page.getByRole('button', { name: 'Annuler' }).click();
  await wait(2000);
  check('annulation : dépense supprimée, solde CIH rétabli', !db.transactions.some((t) => t.description === 'Loyer') && balance(bank) === 1000000);

  // ---------- Nouvelle échéance (abonnement sans compte) ----------
  await page.getByRole('button', { name: /^5 nov/ }).click(); // désélectionner le jour
  await wait(600);
  await page.getByRole('button', { name: 'Ajouter une échéance' }).click();
  await wait(1500);
  await page.getByRole('button', { name: 'Ajouter une échéance' }).click();
  await wait(500);
  check('nom obligatoire', await visible('Donnez un nom à cette échéance.'));
  await page.getByRole('radio', { name: 'Abonnement' }).click();
  await page.getByLabel('Nom').fill('Streaming');
  await page.getByLabel('Montant').fill('120');
  await page.getByRole('radio', { name: 'J−3' }).click();
  await shot('s6-3-nouvelle');
  await page.getByRole('button', { name: 'Ajouter une échéance' }).click();
  await wait(2000);
  const streaming = db.scheduled.find((i) => i.title === 'Streaming');
  check('abonnement enregistré (mensuel, aujourd’hui, rappel J−3)', streaming && streaming.kind === 'subscription' && streaming.amount_minor === 12000 && streaming.frequency === 'monthly' && streaming.start_date === '2026-11-12' && streaming.remind_days_before === 3);
  check('section « Aujourd’hui » : Streaming', (await visible('AUJOURD’HUI')) && (await visible('Streaming')));

  // Payer sans compte enregistré : le premier compte est proposé ; catégorie « Autres ».
  await vt('Streaming').click();
  await wait(1500);
  await page.getByRole('button', { name: 'Marquer comme payé' }).click();
  await wait(2000);
  const st = db.transactions.find((t) => t.description === 'Streaming');
  check('abonnement payé depuis Espèces, catégorie « Autres »', st && st.account_id === cash.id && st.category_id === db.category('other'));

  // ---------- Ignorer une échéance ----------
  await vt('Internet').click();
  await wait(1500);
  await page.getByRole('button', { name: 'Ignorer cette fois' }).click();
  await wait(1800);
  check('internet ignoré : aucune dépense créée', db.completions.some((c) => c.item_id === internet.id && c.due_on === '2026-11-20' && c.status === 'skipped') && !db.transactions.some((t) => t.description === 'Internet'));
  check('reste à payer : 3 000 DH (loyer seul)', await visible(/^3\s?000\s?DH$/));

  // ---------- Mois suivant ----------
  await page.getByRole('button', { name: 'Mois suivant' }).click();
  await wait(1200);
  check('décembre : loyer, internet, abonnement et salaire prévus', (await visible('CE MOIS-CI')) && (await visible('Internet')) && (await visible('Streaming')));
  await fullShot('s6-4-decembre');

  // ---------- Accueil ----------
  await page.goBack();
  await wait(800);
  await page.getByRole('tab', { name: 'Accueil' }).click();
  await wait(1500);
  check('accueil : le loyer reste en retard (paiement annulé)', await visible(/5 nov\.? · En retard/));

  check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  report();
  await browser.close();
})().catch((e) => {
  report();
  console.error('ARRÊT :', e.message.split('\n')[0]);
  process.exit(1);
});
