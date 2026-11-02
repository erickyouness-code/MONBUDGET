// Lancer avec : npm run test:e2e
// Étape 9 : assistant financier (accord, questions, erreurs, retrait de l'accord).
// Le serveur de l'assistant est simulé : on vérifie ici l'application (ce qui est
// envoyé, l'affichage, les messages d'erreur). Le serveur a ses propres tests.
const { chromium } = require('playwright');
const { EMAIL, createDb, installMock, checker } = require('./mock-supabase');

const out = process.argv[2];
const { check, report } = checker();

const db = createDb({ onboarded: true });
db.today = '2026-11-12';
db.addAccount({ name: 'Espèces', type: 'cash', initial_balance_minor: 100000 });

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
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
  const bubbles = (who) => page.getByTestId(`bubble-${who}`).locator('visible=true');

  await page.goto('http://localhost:8765/');
  await wait(2000);
  await page.getByRole('button', { name: 'J’ai déjà un compte' }).click();
  await wait();
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe', { exact: true }).fill('budget2026');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await wait(2500);

  await page.getByRole('tab', { name: 'Assistant' }).click();
  await wait(1200);

  // ---------- Accord explicite avant toute question ----------
  check('accord demandé : « Avant de commencer »', await visible('Avant de commencer'));
  check('le fournisseur d’IA est nommé (Anthropic)', await visible(/fournisseur d’intelligence artificielle \(Anthropic\)/));
  check('rappel : ne jamais partager mot de passe / PIN / code SMS', await visible(/Ne partagez jamais de mot de passe, de code PIN/));
  check('avertissement : pas un conseiller professionnel', await visible('Assistant informatif. Il ne remplace pas un conseiller financier professionnel.'));
  check('pas de zone de saisie sans accord', !(await page.getByLabel('Posez votre question…').isVisible().catch(() => false)));
  await shot('s9-1-accord');
  await page.getByRole('button', { name: 'J’accepte et je commence' }).click();
  await wait(1500);
  check('accord enregistré dans le profil', !!db.profile.assistant_consent_at);

  // ---------- Questions d'exemple ----------
  check('exemples de questions proposés', (await visible('Combien ai-je dépensé cette semaine ?')) && (await visible('Comment réduire mes dépenses ?')));
  check('exemple de prix dans la devise : 3 000 DH', await visible(/Puis-je acheter un téléphone à 3\s?000\s?DH ce mois-ci \?/));
  await shot('s9-2-exemples');

  // ---------- Première question (exemple) ----------
  db.assistantReplies.push({ status: 200, delay: 1200, body: { reply: 'Cette semaine, vous avez dépensé 245 DH, surtout en alimentation (150 DH).' } });
  await vt('Combien ai-je dépensé cette semaine ?').click();
  await wait(400);
  check('question affichée et indicateur « analyse en cours »', (await bubbles('user').count()) === 1 && (await visible('L’assistant analyse vos données…')));
  await wait(1600);
  check('réponse affichée', await visible('Cette semaine, vous avez dépensé 245 DH, surtout en alimentation (150 DH).'));
  const first = db.assistantCalls[0];
  check(
    'envoyé au serveur : la question, la langue, le jeton de l’utilisateur',
    first &&
      JSON.stringify(first.body) === JSON.stringify({ messages: [{ role: 'user', text: 'Combien ai-je dépensé cette semaine ?' }], language: 'fr' }) &&
      /^Bearer ey/.test(first.authorization ?? ''),
  );

  // ---------- Question tapée : l'historique suit ----------
  db.assistantReplies.push({ status: 200, body: { reply: 'Le mois dernier, vous avez dépensé 2 100 DH.' } });
  await page.getByLabel('Posez votre question…').fill('Et le mois dernier ?');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await wait(1500);
  const second = db.assistantCalls[1];
  check('historique envoyé (question, réponse, nouvelle question)', second && second.body.messages.length === 3 && second.body.messages[1].role === 'assistant' && second.body.messages[2].text === 'Et le mois dernier ?');
  check('champ vidé après envoi', (await page.getByLabel('Posez votre question…').inputValue()) === '');
  check('bouton Envoyer désactivé quand le champ est vide', (await page.getByRole('button', { name: 'Envoyer' }).getAttribute('aria-disabled')) === 'true');
  await shot('s9-3-conversation');

  // ---------- Assistant saturé : nouvelle tentative sans doublon ----------
  db.assistantReplies.push({ status: 503, body: { code: 'busy' } }, { status: 200, body: { reply: 'Vos plus grosses dépenses sont le loyer et les courses.' } });
  await page.getByLabel('Posez votre question…').fill('Quelles sont mes plus grosses dépenses ?');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await wait(1500);
  check('erreur claire si le service est saturé', await visible('L’assistant est très sollicité. Réessayez dans un instant.'));
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await wait(1500);
  const retry = db.assistantCalls.at(-1);
  check('nouvelle tentative : même question, pas de doublon', retry.body.messages.length === 5 && retry.body.messages.filter((m) => m.text === 'Quelles sont mes plus grosses dépenses ?').length === 1);
  check('réponse après nouvelle tentative, erreur effacée', (await visible('Vos plus grosses dépenses sont le loyer et les courses.')) && !(await visible('L’assistant est très sollicité. Réessayez dans un instant.')));

  // ---------- Limite du jour : pas de « Réessayer » ----------
  db.assistantReplies.push({ status: 429, body: { code: 'daily_limit' } });
  await page.getByLabel('Posez votre question…').fill('Encore une question');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await wait(1500);
  check('limite du jour expliquée', await visible('Vous avez atteint la limite de questions pour aujourd’hui. Réessayez demain.'));
  check('pas de bouton « Réessayer » pour la limite du jour', !(await page.getByRole('button', { name: 'Réessayer' }).isVisible().catch(() => false)));

  // ---------- Demande refusée par l'IA ----------
  db.assistantReplies.push({ status: 200, body: { code: 'refused' } });
  await page.getByLabel('Posez votre question…').fill('Question hors sujet');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await wait(1500);
  check('refus : message neutre', await visible('Je ne peux pas répondre à cette demande. Essayez de la reformuler autour de votre budget.'));
  await shot('s9-4-erreurs');

  // ---------- Nouvelle conversation ----------
  await page.getByRole('button', { name: 'Nouvelle conversation' }).click();
  await wait(800);
  check('nouvelle conversation : historique effacé, exemples revenus', (await bubbles('user').count()) === 0 && (await visible('Combien ai-je dépensé cette semaine ?')));

  // ---------- Retrait de l'accord dans les Réglages ----------
  await page.getByRole('tab', { name: 'Accueil' }).click();
  await wait(1000);
  await page.getByRole('button', { name: 'Réglages' }).click();
  await wait(1500);
  const toggle = page.getByRole('switch', { name: 'Autoriser l’assistant à consulter mes données' });
  check('réglage de l’accord présent et activé', (await toggle.isChecked()) === true);
  await toggle.click();
  await wait(1200);
  check('accord retiré dans le profil', db.profile.assistant_consent_at === null);
  await page.goBack();
  await wait(1000);
  await page.getByRole('tab', { name: 'Assistant' }).click();
  await wait(1000);
  check('assistant : l’accord est redemandé', await visible('Avant de commencer'));

  // ---------- Arabe : interface de droite à gauche ----------
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('monbudget.preferences'));
    raw.state.language = 'ar';
    localStorage.setItem('monbudget.preferences', JSON.stringify(raw));
  });
  db.profile.language = 'ar';
  db.profile.assistant_consent_at = '2026-11-12T10:00:00Z';
  await page.goto('http://localhost:8765/');
  await wait(3000);
  await page.getByRole('tab', { name: 'المساعد' }).click();
  await wait(1200);
  check('arabe : exemples traduits', await visible('كم صرفت هذا الأسبوع؟'));
  db.assistantReplies.push({ status: 200, body: { reply: 'صرفت هذا الأسبوع 245 د.م.' } });
  await vt('كم صرفت هذا الأسبوع؟').click();
  await wait(1500);
  check('arabe : langue envoyée au serveur', db.assistantCalls.at(-1).body.language === 'ar');
  const box = await bubbles('user').first().boundingBox();
  check('arabe : la question est alignée à gauche (sens de lecture inversé)', box && box.x < 60);
  await shot('s9-5-arabe');

  check('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  report();
  await browser.close();
})().catch((e) => {
  report();
  console.error('ARRÊT :', e.message.split('\n')[0]);
  process.exit(1);
});
