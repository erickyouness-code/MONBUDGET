# Publier MonBudget sur l'App Store et Google Play (étape 10)

Le code est prêt pour la publication. Ce guide liste ce qui reste à faire **avec vos comptes**.
Faites d'abord la mise en service de Supabase (`docs/SUPABASE.md`), de l'abonnement
(`docs/ABONNEMENT.md`) et de l'assistant (`docs/ASSISTANT.md`).

## 1. Fonctions serveur à déployer

```bash
npx supabase functions deploy delete-account
```
(Les autres : `revenuecat-webhook`, `sync-entitlement`, `assistant` — voir les guides ci-dessus.)

## 2. Pages légales (obligatoires)

Deux brouillons sont prêts dans `docs/legal/` : politique de confidentialité et conditions
d'utilisation. **Faites-les relire par un juriste**, complétez les champs entre crochets, puis
publiez-les sur une adresse web publique (votre site, ou GitHub Pages gratuitement). Indiquez les
adresses dans `.env.local` et dans EAS :

```
EXPO_PUBLIC_TERMS_URL=https://...
EXPO_PUBLIC_PRIVACY_URL=https://...
```

Ces liens apparaissent sur la page Premium (exigé par Apple pour les abonnements) et doivent aussi
être renseignés dans les fiches des stores.

## 3. Variables de production dans EAS

Les clés publiques ne sont pas dans le code : enregistrez-les pour les builds de production
(« plain text » ou « sensitive », jamais de clé secrète ici) :

```bash
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://VOTRE-PROJET.supabase.co --visibility plaintext
```
Même chose pour `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY`,
`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `EXPO_PUBLIC_TERMS_URL` et `EXPO_PUBLIC_PRIVACY_URL`.

## 4. Construire et envoyer

```bash
npx eas-cli@latest build --profile production --platform all
```
```bash
npx eas-cli@latest submit --profile production --platform ios
```
```bash
npx eas-cli@latest submit --profile production --platform android
```

Le numéro de build est augmenté automatiquement (`autoIncrement` dans `eas.json`). Pour une
nouvelle version visible des utilisateurs, changez `version` dans `app.json` (ex. `1.0.1`).

## 5. Fiches des stores

| Élément | Contenu proposé |
|---|---|
| Nom | MonBudget |
| Sous-titre (iOS, 30 caractères) | Budget, dépenses et épargne |
| Catégorie | Finance |
| Langues de la fiche | Français, arabe, anglais |
| Pays | Maroc et Gabon d'abord (vous pourrez en ajouter) |
| Âge | 4+ / Tout public (aucun contenu sensible) |
| Captures d'écran | Tableau de bord, budgets, objectifs, calendrier, assistant (iPhone 6,7" et 6,5", Android) |

Description courte : « Suivez vos dépenses, fixez des budgets et atteignez vos objectifs d'épargne,
en dirhams ou en francs CFA. »

## 6. Questionnaires de confidentialité

Réponses à donner (à vérifier avec votre politique de confidentialité) :

| Donnée | Collectée | Usage | Liée à l'identité | Partagée |
|---|---|---|---|---|
| Adresse e-mail | Oui | Compte | Oui | Non |
| Données financières saisies (transactions, budgets…) | Oui | Fonctionnement de l'application | Oui | Seulement avec l'IA (Anthropic) si l'utilisateur active l'assistant, pour produire la réponse |
| Historique d'achats (abonnement) | Oui | Abonnement (RevenueCat, Apple, Google) | Oui | Non (prestataires) |
| Localisation, contacts, photos, publicité | Non | — | — | — |

- Aucun suivi publicitaire (« tracking ») : répondre **Non** à App Tracking Transparency.
- Données chiffrées en transit (HTTPS) : **Oui**.
- Suppression du compte possible dans l'application : **Oui** (Réglages → Mes données). Google
  demande aussi une adresse web expliquant comment supprimer son compte : une page simple
  reprenant ces étapes suffit.
- Chiffrement : l'application n'utilise que le chiffrement standard (déjà déclaré dans `app.json`,
  `ITSAppUsesNonExemptEncryption = false`).

## 7. Pour l'équipe de vérification d'Apple et de Google

- Créez un **compte de démonstration** (e-mail + mot de passe) avec quelques données, et donnez-le
  dans « App Review Information » / « Accès à l'application ».
- Donnez-lui un accès Premium (voir « Accès gratuit » dans `docs/ABONNEMENT.md`) pour que la
  vérification puisse voir toute l'application.
- Note à ajouter : « L'assistant est informatif et ne fournit pas de conseil financier
  professionnel. Aucune connexion bancaire : toutes les données sont saisies par l'utilisateur. »

## 8. Avant d'envoyer : vérifications sur un vrai téléphone

- [ ] Inscription, code reçu par e-mail, connexion, mot de passe oublié
- [ ] Achat de test (compte sandbox / testeur de licence), restauration, annulation
- [ ] Rappels du calendrier reçus à l'heure prévue
- [ ] Verrouillage Face ID / empreinte (Réglages → Sécurité), au lancement et après 1 minute
- [ ] Mode avion : bandeau « Hors ligne », données consultables
- [ ] Export CSV ouvert dans Excel / Google Sheets ; export JSON
- [ ] Suppression du compte avec un compte de test
- [ ] Arabe : affichage de droite à gauche partout
- [ ] Mode sombre
