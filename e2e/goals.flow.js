// Lancer avec : npm run test:e2e
// Étape 5 : objectifs d'épargne. Horloge figée au 12 novembre 2026.
const { chromium } = require('playwright');
const { EMAIL, createDb, installMock, checker } = require('./mock-supabase');

const out = process.argv[2];
const { check, report } = checker();

const db = createDb({ onboarded: true });
db.today = '2026-11-12';
db.addAccount({ name: 'Espèces', type: 'cash', initial_balance_minor: 500000 });
// Objectif ancien, pour tester l'estimation : créé le 1er août, échéance 1er août 2027.
const old = db.addGoal({ name: 'Voiture', icon: 'car', target_minor: 1000000, target_date: '2027-08-01', created_at: '2026-08-01T10:00:00Z' });
db.addContribution({ goal_id: old.id, amount_minor: 100000, occurred_on: '2026-08-01', is_initial: true }); // exclu du rythme
db.addContribution({ goal_id: old.id, amount_minor: 60000, occurred_on: '2026-09-15' });
db.addContribution({ goal_id: old.id, amount_minor: 60000, occurred_on: '2026-10-15' });

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
  const contribute = async (button, amount) => {
    await page.getByRole('button', { name: button, exact: true }).click();
    await wait(1300);
    await page.getByLabel(/Montant à/).fill(amount);
    await page.getByRole('button', { name: /(Ajouter à|Retirer de) l’objectif/ }).click();
    await wait(1800);
  };

  await page.goto('http://localhost:8765/');
  await wait(2000);
  await page.getByRole('button', { name: 'J’ai déjà un compte' }).click();
  await wait();
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill('budget2026');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await wait(2500);

  // ---------- Objectif existant : estimation ----------
  await page.getByRole('tab', { name: 'Planifier' }).click();
  await wait(1200);
  check('Planifier : 1 objectif actif', await visible('Objectifs actifs : 1 · atteints : 0'));
  await page.getByRole('button', { name: /Objectifs d’épargne/ }).click();
  await wait(1500);
  check('liste : « Voiture » 2 200 DH sur 10 000 DH', await visible(/2\s?200\s?DH sur 10\s?000\s?DH/));
  // Rythme : 1 200 DH sur 90 jours (montant de départ exclu) → reste 7 800 DH ≈ 585 jours → juin 2028 > août 2027
  check('liste : « Voiture » en retard', await visible('En retard'));
  await vt('Voiture').click();
  await wait(1500);
  check('estimation honnête : atteint vers Juin 2028', await visible(/atteint vers Juin 2028/));
  await shot('s5-1-voiture');
  await page.goBack();
  await wait(1000);

  // ---------- Nouvel objectif ----------
  await page.getByRole('button', { name: 'Créer un objectif' }).click();
  await wait(1500);
  await page.getByRole('button', { name: 'Créer un objectif' }).click();
  await wait(500);
  check('nom obligatoire', await visible('Donnez un nom à cet objectif.'));
  await page.getByLabel('Nom de l’objectif').fill('Nouveau téléphone');
  await page.getByRole('radio', { name: 'Téléphone' }).click();
  await page.getByLabel('Montant à atteindre').fill('3000');
  await page.getByLabel(/Déjà épargné/).fill('500');
  await shot('s5-2-creation');
  await page.getByRole('button', { name: 'Créer un objectif' }).click();
  await wait(2200);
  const phone = db.goals.find((g) => g.name === 'Nouveau téléphone');
  check('objectif enregistré (3 000 DH, échéance dans 180 jours, icône téléphone)', phone && phone.target_minor === 300000 && phone.target_date === '2027-05-11' && phone.icon === 'phone');
  check('montant de départ marqué comme tel', db.contributions.some((c) => c.goal_id === phone?.id && c.is_initial && c.amount_minor === 50000));
  check('fiche : 16 % et 500 DH sur 3 000 DH', (await visible('16 %')) && (await visible(/500\s?DH sur 3\s?000\s?DH/)));
  check('échéance avec l’année : 11 mai 2027', await visible('Échéance : 11 mai 2027'));
  // Reste 2 500 DH : 180 jours ≈ 6 mois → 416,67 → 417 DH ; 26 semaines → 96,15 → 97 DH
  check('plan : 417 DH par mois', await visible(/^417\s?DH$/));
  check('plan : 97 DH par semaine', await visible(/^97\s?DH$/));
  check('pas d’estimation sans historique suffisant', await visible('Pas encore assez de versements pour estimer une date.'));
  await shot('s5-3-fiche');

  // ---------- Versements et retraits ----------
  await contribute('Ajouter', '2000');
  check('versement : 2 500 DH sur 3 000 DH', await visible(/2\s?500\s?DH sur 3\s?000\s?DH/));
  await page.getByRole('button', { name: 'Retirer', exact: true }).click();
  await wait(1300);
  await page.getByLabel('Montant à retirer').fill('3000');
  await page.getByRole('button', { name: 'Retirer de l’objectif' }).click();
  await wait(800);
  check('retrait supérieur à l’épargne refusé avec explication', await visible(/pas retirer plus que le montant épargné \(2\s?500\s?DH\)/));
  await page.getByLabel('Montant à retirer').fill('200');
  await page.getByRole('button', { name: 'Retirer de l’objectif' }).click();
  await wait(1800);
  check('retrait : 2 300 DH', db.saved(phone.id) === 230000 && (await visible(/2\s?300\s?DH sur 3\s?000\s?DH/)));
  await contribute('Ajouter', '700');
  check('objectif atteint : message de félicitations', (await visible('Objectif atteint !')) && (await visible('Bravo, vous avez atteint « Nouveau téléphone ».')));
  check('badge « Atteint »', await visible('Atteint'));
  check('historique : « Versement » / « Retrait »', (await visible('Versement')) && (await visible('Retrait')));
  await shot('s5-4-atteint');
  await wait(6000);

  // ---------- Suppression d'un versement (appui long) ----------
  const before = db.contributions.filter((c) => c.goal_id === phone.id).length;
  await page.getByRole('button').filter({ hasText: /^Retrait/ }).locator('visible=true').first().click({ delay: 900 }).catch(() => undefined);
  await wait(1500);
  check('appui long : versement supprimé, total recalculé', db.contributions.filter((c) => c.goal_id === phone.id).length === before - 1 && db.saved(phone.id) === 320000);

  // ---------- Liste et tableau de bord ----------
  await page.goBack();
  await wait(1200);
  check('liste : total mis de côté 5 400 DH', await visible(/^5\s?400\s?DH$/));
  await shot('s5-5-liste');
  await page.goBack();
  await wait(800);
  check('Planifier : 2 objectifs, 1 atteint', await visible('Objectifs actifs : 2 · atteints : 1'));
  await page.getByRole('tab', { name: 'Accueil' }).click();
  await wait(1500);
  check('accueil : carte Épargne sur l’objectif non atteint (Voiture)', await visible('Voiture'));

  // ---------- Suppression d'un objectif ----------
  await page.getByRole('tab', { name: 'Planifier' }).click();
  await wait(1000);
  await page.getByRole('button', { name: /Objectifs d’épargne/ }).click();
  await wait(1500);
  await vt('Nouveau téléphone').click();
  await wait(1500);
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await wait(1500);
  check('objectif supprimé avec ses versements', !db.goals.some((g) => g.name === 'Nouveau téléphone') && !db.contributions.some((c) => c.goal_id === phone.id));

  check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  report();
  await browser.close();
})().catch((e) => {
  report();
  console.error('ARRÊT :', e.message.split('\n')[0]);
  process.exit(1);
});
