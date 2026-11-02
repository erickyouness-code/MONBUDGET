// Lancer avec : npm run test:e2e
// Étape 7 : analyse des dépenses. Horloge figée au 12 novembre 2026.
const { chromium } = require('playwright');
const { EMAIL, createDb, installMock, checker } = require('./mock-supabase');

const out = process.argv[2];
const { check, report } = checker();

const db = createDb({ onboarded: true });
db.today = '2026-11-12';
const bank = db.addAccount({ name: 'CIH', type: 'bank', initial_balance_minor: 300000 });
const tx = (occurred_on, amount, key, description = null, type = 'expense') =>
  db.addTx({ type, amount_minor: amount * 100, occurred_on, account_id: bank.id, category_id: db.category(key), description });

// Août → octobre : habitudes « normales ».
for (const m of ['08', '09', '10']) {
  tx(`2026-${m}-01`, 9000, 'salary', null, 'income');
  tx(`2026-${m}-03`, 300, 'food');
  tx(`2026-${m}-08`, 300, 'food');
  tx(`2026-${m}-05`, 100, 'transport');
  tx(`2026-${m}-10`, 100, 'transport');
  tx(`2026-${m}-06`, 120, 'other', 'Streaming');
  tx(`2026-${m}-20`, 349, 'bills', 'Internet');
}
// Novembre (jusqu'au 12) : alimentation en hausse, transport en baisse, 12 cafés.
tx('2026-11-01', 9000, 'salary', null, 'income');
tx('2026-11-03', 600, 'food');
tx('2026-11-09', 600, 'food');
tx('2026-11-05', 60, 'transport');
tx('2026-11-06', 120, 'other', 'Streaming');
for (let d = 1; d <= 12; d++) tx(`2026-11-${String(d).padStart(2, '0')}`, 25, 'other', 'Café');
// Budget alimentation 1 000 DH ; calendrier : internet (déjà connu) et loyer à venir.
db.setBudget(db.category('food'), 100000, 80, '2026-11-01');
db.addScheduled({ kind: 'bill', title: 'Internet', amount_minor: 34900, start_date: '2026-11-20', account_id: bank.id });
db.addScheduled({ kind: 'payment', title: 'Loyer', amount_minor: 400000, start_date: '2026-11-25', account_id: bank.id });

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
    await page.setViewportSize({ width: 390, height: Math.min(h + 90, 4200) });
    await wait(700);
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
  await wait(3000);

  // ---------- Aperçu sur l'accueil ----------
  check('accueil : « Analyse du mois » commence par le budget dépassé', (await visible('Analyse du mois')) && (await visible('Alimentation : budget dépassé')));
  await page.getByText('Tout voir').locator('visible=true').first().click().catch(() => undefined);
  await wait(500);
  if (!(await visible('Analyse de Novembre 2026'))) {
    await page.getByRole('tab', { name: 'Planifier' }).click();
    await wait(1000);
    await page.getByRole('button', { name: /Analyse des dépenses/ }).click();
  }
  await wait(2000);

  // ---------- Écran d'analyse ----------
  check('titre : Analyse de Novembre 2026', await visible('Analyse de Novembre 2026'));
  check('à surveiller : alimentation dépassée de 200 DH (120 %)', await visible(/Plafond dépassé de 200\s?DH \(120 % utilisé\)/));
  check('habitudes : alimentation +100 % (1 200 DH contre 600 DH)', (await visible('Alimentation : +100 % par rapport à d’habitude')) && (await visible(/1\s?200\s?DH depuis le début du mois, contre 600\s?DH en moyenne/)));
  check('bonne nouvelle : transport −70 %', await visible('Transport : −70 % par rapport à d’habitude'));
  check('hausse aussi détectée sur « Autres » (cafés + streaming)', await visible('Autres : +250 % par rapport à d’habitude'));
  // Revenus 9 000, dépenses 1 200 + 60 + 120 + 300 = 1 680 → 81 %
  check('taux d’épargne : 81 %', await visible('Vous mettez 81 % de vos revenus de côté'));
  check('top catégories : Alimentation 1 200 DH (71 %)', await visible(/Alimentation : 1\s?200\s?DH \(71 %\)/));
  check('petites dépenses : 12 achats, 300 DH', await visible(/12 achats de 50\s?DH ou moins ce mois-ci, pour un total de 300\s?DH/));
  check('récurrent : Streaming ≈ 120 DH/mois sur 4 mois', await visible(/Environ 120\s?DH par mois · vue sur 4 mois/));
  check('récurrent : Internet déjà au calendrier', await visible('Déjà au calendrier'));
  // Fin de mois : solde actuel − internet − loyer (aucun revenu prévu au calendrier)
  const balance = db.balance('CIH');
  const estimate = balance - 34900 - 400000;
  const fmt = (minor) => `${Math.round(minor / 100).toLocaleString('fr-FR').replace(/\s/g, '\\s?')}\\s?DH`;
  check(`fin de mois (estimation) ≈ ${estimate / 100} DH`, await visible(new RegExp(`il resterait environ ${fmt(estimate)}`)));
  check('mention « estimation » sur la fin de mois', await visible(/\(estimation\)/));
  await page.getByText('Comment est-ce calculé ?').locator('visible=true').nth(1).click();
  await wait(400);
  check('« Comment est-ce calculé ? » : comparaison du 1er au 12', await visible(/Comparaison du 1er au 12 du mois/));
  check('avertissement : pas un conseil professionnel', await visible(/ne constituent pas un conseil financier professionnel/));
  await fullShot('s7-1-analyse');

  // ---------- Ajouter l'abonnement détecté au calendrier ----------
  await page.getByRole('button', { name: 'Ajouter au calendrier' }).click();
  await wait(1500);
  check('formulaire prérempli : Streaming, 120 DH', (await page.getByLabel('Nom').inputValue()) === 'Streaming' && (await page.getByLabel('Montant').inputValue()) === '120');
  check('prochaine date : 6 déc.', await visible(/6 déc/));
  await page.getByRole('button', { name: 'Ajouter une échéance' }).click();
  await wait(2000);
  const st = db.scheduled.find((i) => i.title === 'Streaming');
  check('échéance créée (120 DH, le 6 décembre, catégorie Autres)', st && st.amount_minor === 12000 && st.start_date === '2026-12-06' && st.category_id === db.category('other'));
  check('Streaming désormais « Déjà au calendrier »', !(await page.getByRole('button', { name: 'Ajouter au calendrier' }).isVisible()));

  // ---------- Voir les dépenses d'une catégorie ----------
  await page.getByRole('button', { name: 'Voir les dépenses' }).first().click(); // alimentation (plus forte hausse) avant « Autres »
  await wait(2000);
  const list = page.getByTestId('history-list');
  check('historique filtré sur « Alimentation »', (await page.getByLabel('Rechercher').inputValue()) === 'Alimentation' && (await list.getByText('Alimentation').count()) > 0 && (await list.getByText('Café').count()) === 0);

  check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  report();
  await browser.close();
})().catch((e) => {
  report();
  console.error('ARRÊT :', e.message.split('\n')[0]);
  process.exit(1);
});
