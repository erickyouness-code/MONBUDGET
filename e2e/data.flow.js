// Lancer avec : npm run test:e2e
// Étape 10 : mode hors connexion, export des données (CSV / JSON), suppression du compte.
const { chromium } = require('playwright');
const fs = require('node:fs');
const { EMAIL, createDb, installMock, checker } = require('./mock-supabase');

const out = process.argv[2];
const { check, report } = checker();

const db = createDb({ onboarded: true });
const cash = db.addAccount({ name: 'Espèces', type: 'cash', initial_balance_minor: 100000 });
const bank = db.addAccount({ name: 'Banque', type: 'bank', initial_balance_minor: 500000 });
db.addTx({ type: 'expense', amount_minor: 4550, occurred_on: '2026-11-02', account_id: cash.id, category_id: db.category('food'), payment_method: 'card', description: 'Marjane; courses' });
db.addTx({ type: 'income', amount_minor: 800000, occurred_on: '2026-11-01', account_id: bank.id, category_id: db.category('salary'), description: '=HYPERLINK("x")' });
db.addTx({ type: 'transfer', amount_minor: 20000, occurred_on: '2026-11-03', account_id: bank.id, to_account_id: cash.id });
db.categories.push({ id: db.uid(), user_id: '11111111-2222-3333-4444-555555555555', kind: 'expense', key: null, name: 'Café', icon: 'other', color: '#A3A1B8', sort_order: 100, is_archived: false });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('monbudget.preferences'))
      localStorage.setItem('monbudget.preferences', JSON.stringify({ state: { theme: 'light', language: 'fr', currency: 'MAD', demoMode: false, notifications: true }, version: 1 }));
  });
  const page = await ctx.newPage();
  // Horloge réelle ici : la sauvegarde du cache (hors connexion) attend que le temps avance.
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  await installMock(page, db);

  const wait = (ms = 900) => page.waitForTimeout(ms);
  const vt = (text) => page.getByText(text).locator('visible=true').first();
  const visible = (text) => vt(text).isVisible();
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
  const download = async (label) => {
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label }).click()]);
    return { name: file.suggestedFilename(), text: fs.readFileSync(await file.path(), 'utf8') };
  };

  await page.goto('http://localhost:8765/');
  await wait(2000);
  await page.getByRole('button', { name: 'J’ai déjà un compte' }).click();
  await wait();
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill('budget2026');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await wait(3000);

  // ---------- Hors connexion ----------
  const cached = await page.evaluate(() => localStorage.getItem('monbudget.cache') ?? '');
  check('données gardées sur l’appareil pour le mode hors connexion', cached.includes('Marjane'));
  await ctx.setOffline(true);
  await wait(800);
  check('hors connexion : bandeau affiché', await visible(/Hors ligne : vous voyez les dernières données enregistrées/));
  check('hors connexion : le tableau de bord reste affiché', await visible('Tableau de bord'));
  await shot('s10-1-hors-ligne');
  await ctx.setOffline(false);
  await wait(800);
  check('connexion revenue : bandeau masqué', !(await visible(/Hors ligne :/)));

  // ---------- Réglages : sécurité et accès à « Mes données » ----------
  await page.getByRole('button', { name: 'Réglages' }).click();
  await wait(1500);
  check('verrouillage biométrique : indisponible sur le web (expliqué)', (await visible('Disponible uniquement sur téléphone.')) && (await page.getByRole('switch', { name: 'Verrouiller avec Face ID / empreinte' }).isDisabled()));
  await vt('Mes données').click();
  await wait(1500);
  check('écran « Mes données »', (await visible('Transactions (CSV, pour Excel)')) && (await visible('Supprimer définitivement mon compte')));

  // ---------- Export CSV ----------
  const csv = await download('Transactions (CSV, pour Excel)');
  const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
  check('CSV : nom du fichier daté', csv.name === `monbudget-transactions-${today}.csv`);
  check('CSV : BOM UTF-8 et en-têtes français séparés par « ; »', csv.text.startsWith('﻿') && lines[0] === 'Date;Type;Montant;Devise;Catégorie;Compte;Vers le compte;Moyen de paiement;Description');
  check('CSV : revenu, formule neutralisée', lines[1] === "2026-11-01;Revenu;8000,00;MAD;Salaire;Banque;;;\"'=HYPERLINK(\"\"x\"\")\"");
  check('CSV : dépense négative, texte avec « ; » protégé', lines[2] === '2026-11-02;Dépense;-45,50;MAD;Alimentation;Espèces;;Carte;"Marjane; courses"');
  check('CSV : transfert sans catégorie, comptes de départ et d’arrivée', lines[3] === '2026-11-03;Transfert;200,00;MAD;;Banque;Espèces;;');
  check('export confirmé à l’écran', await visible('Export terminé.'));

  // ---------- Export JSON ----------
  const json = await download('Toutes mes données (JSON)');
  const data = JSON.parse(json.text);
  check('JSON : nom du fichier daté', json.name === `monbudget-data-${today}.json`);
  check('JSON : en-tête et devise', data.app === 'MonBudget' && data.format_version === 1 && data.currency === 'MAD');
  check('JSON : toutes les tables du compte', ['profiles', 'accounts', 'transactions', 'budgets', 'savings_goals', 'goal_contributions', 'scheduled_items', 'scheduled_completions', 'entitlements'].every((k) => Array.isArray(data[k])));
  check('JSON : 3 transactions, 2 comptes, montants en centimes', data.transactions.length === 3 && data.accounts.length === 2 && data.transactions.some((t) => t.amount_minor === 4550));
  check('JSON : seulement les catégories personnelles', data.categories.length === 1 && data.categories[0].name === 'Café');
  await shot('s10-2-mes-donnees');

  // ---------- Suppression du compte ----------
  const del = page.getByRole('button', { name: 'Supprimer définitivement mon compte' });
  check('bouton de suppression désactivé sans mot de passe ni confirmation', (await del.getAttribute('aria-disabled')) === 'true');
  await page.getByLabel('Mot de passe actuel').fill('mauvais');
  await page.getByLabel('Pour confirmer, tapez SUPPRIMER').fill('supprimer');
  check('bouton activé après saisie du mot de passe et du mot SUPPRIMER', (await del.getAttribute('aria-disabled')) !== 'true');
  await del.click();
  await wait(1500);
  check('mauvais mot de passe : refusé, compte conservé', (await visible('Mot de passe incorrect.')) && !db.deleted);
  check('confirmation explicite envoyée au serveur', db.deleteCalls[0]?.confirm === 'DELETE');
  await page.getByLabel('Mot de passe actuel').fill('budget2026');
  await shot('s10-3-suppression');
  await del.click();
  await wait(2500);
  check('compte supprimé par le serveur', db.deleted === true);
  check('retour à l’accueil (déconnecté) avec un message', (await visible('Créer un compte')) && (await visible('Votre compte et toutes vos données ont été effacés.')));
  const left = await page.evaluate(() => [localStorage.getItem('monbudget.cache') ?? '', localStorage.getItem('monbudget.auth') ?? ''].join(''));
  check('plus aucune donnée ni session sur l’appareil', !left.includes('Marjane') && !left.includes('access_token'));

  check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  report();
  await browser.close();
})().catch((e) => {
  report();
  console.error('ARRÊT :', e.message.split('\n')[0]);
  process.exit(1);
});
