# MonBudget — gestion du budget personnel

Application mobile (iOS / Android) de gestion du budget, pensée d'abord pour le Maroc et le Gabon.
Stack : React Native · Expo SDK 58 · TypeScript · Expo Router · (Supabase à partir de l'étape 1).

## Lancer l'application sur votre téléphone

Prérequis sur votre ordinateur : [Node.js](https://nodejs.org) (version 20 ou plus) et Git.
Sur votre téléphone : l'application **Expo Go** (App Store / Google Play), à jour.

```bash
git clone https://github.com/erickyouness-code/MONBUDGET monbudget
cd monbudget
npm install
npx expo start
```

Scannez ensuite le QR code affiché :
- **iPhone** : avec l'appareil photo.
- **Android** : depuis l'application Expo Go.

Le téléphone et l'ordinateur doivent être sur le même réseau Wi-Fi.
Sinon, lancez `npx expo start --tunnel`.

## Brancher le serveur (Supabase)

Suivez le guide pas à pas : [docs/SUPABASE.md](docs/SUPABASE.md).
Sans configuration, l'application s'ouvre en « mode développement » (connexion impossible).

## Commandes utiles

| Commande | Rôle |
|---|---|
| `npm start` | Démarre le serveur de développement |
| `npm run web` | Ouvre l'application dans le navigateur |
| `npm test` | Lance les tests automatiques |
| `npm run typecheck` | Vérifie les types TypeScript |
| `npm run lint` | Vérifie la qualité du code |
| `npm run test:db` | Teste la base et les règles de sécurité (PostgreSQL requis) |
| `npm run test:e2e` | Parcours complets dans un navigateur, avec un serveur simulé |
| `npm run test:functions` | Exécute les fonctions serveur (webhook d'abonnement, assistant) face à de faux services (Deno requis, sinon téléchargé) |
| `npm run sync:functions` | Recopie la logique partagée (échéances, objectifs) vers les fonctions serveur |

## Organisation du code

```
src/
  app/                 Écrans (1 fichier = 1 écran, géré par Expo Router)
    (auth)/            Bienvenue, inscription, connexion, code, mot de passe oublié
    (onboarding)/      Premier paramétrage (pays, devise, prénom)
    (tabs)/            Les 5 onglets : Accueil, Historique, +, Planifier, Assistant
    add.tsx            Ajout d'une transaction
    transaction/[id]   Modification d'une transaction
    accounts.tsx       Liste des comptes et soldes
    account/[id]       Création / modification d'un compte
    settings.tsx       Réglages (compte, langue, thème, devise)
  shared/
    config/            Pays et devises pris en charge
    i18n/              Traductions FR / AR / EN et gestion du sens d'écriture (RTL)
    lib/money.ts       Calculs et formatage des montants (en entiers, jamais en décimaux)
    store/             Préférences mémorisées sur l'appareil
    theme/             Couleurs, typographie, espacements (clair / sombre)
    ui/                Composants réutilisables (Card, Button, AmountText…)
  features/            Logique par fonctionnalité (auth, profile, dashboard…)
supabase/migrations/   Structure de la base de données (SQL)
supabase/functions/    Fonctions serveur (abonnement, assistant)
supabase/tests/        Tests des règles de sécurité
e2e/                   Parcours complets testés dans le navigateur
docs/PLAN.md           Architecture et plan de développement
docs/SUPABASE.md       Guide de configuration du serveur
docs/ABONNEMENT.md     Mise en service de l'abonnement
docs/ASSISTANT.md      Mise en service de l'assistant
```

## Règles du projet

- Les montants sont toujours des **entiers** dans la plus petite unité (centimes, francs).
- Aucune couleur ni aucun texte en dur dans les écrans : on passe par le thème et les traductions.
- Toute nouvelle phrase doit être ajoutée en français, en arabe **et** en anglais (un test le vérifie).
- Les clés secrètes ne sont jamais écrites dans le code.
