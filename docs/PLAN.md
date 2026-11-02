# Architecture et plan de développement

Document de référence validé avant l'implémentation. À mettre à jour à chaque décision importante.

## Décisions validées

| Sujet | Décision |
|---|---|
| Nom (provisoire) | Mizane |
| Style visuel | Violet + cartes blanches, tuiles teintées, graphiques (inspiré de la maquette fournie) ; police Inter (système en arabe) |
| Mode démonstration | Données d'exemple désactivées par défaut, signalées par une bannière, jamais enregistrées |
| Essai gratuit | 3 jours, géré par Apple / Google (offre d'introduction de l'abonnement) |
| Devise | Une devise principale par utilisateur en V1 (MAD ou XAF) |
| Assistant | API Claude, appelée uniquement depuis le serveur (Edge Function) |
| Montants | Entiers dans la plus petite unité de la devise |
| Soldes | Calculés à partir des transactions, jamais stockés |
| Transferts | Type de transaction distinct, exclu des revenus et des dépenses |
| Statut d'abonnement | Écrit uniquement par le serveur (webhook RevenueCat) |

## Architecture

- **Application** : Expo (SDK 58), TypeScript strict, Expo Router, TanStack Query (données serveur),
  Zustand (préférences), react-hook-form + zod (formulaires), Reanimated (animations),
  victory-native + Skia (graphiques), i18next (FR / AR / EN, RTL).
- **Serveur** : Supabase (Auth, PostgreSQL avec RLS sur toutes les tables, fonctions SQL pour
  les agrégats, Edge Functions pour le webhook d'abonnement, l'assistant, l'export et la suppression).
- **Abonnements** : RevenueCat (`react-native-purchases`) pour l'App Store et Google Play.

## Modèle de données (prévu)

`profiles`, `accounts`, `categories`, `transactions`, `budgets`, `savings_goals`,
`goal_contributions`, `scheduled_items`, `reminders`, `entitlements`, `billing_events`.
Vues / fonctions : `account_balances`, `monthly_summary`, `category_spending`,
`budget_progress`, `goal_projection`.

## Étapes

| # | Étape | État |
|---|---|---|
| 0 | Fondations : projet, design system, thèmes, i18n + RTL, navigation | ✅ Terminé |
| 1 | Supabase : authentification, onboarding, profils, RLS | ✅ Code terminé — à brancher sur votre projet Supabase |
| 2 | Comptes + transactions (CRUD, recherche, transferts, catégories) | À faire |
| 3 | Tableau de bord + graphiques | À faire |
| 4 | Budgets + alertes | À faire |
| 5 | Objectifs d'épargne | À faire |
| 6 | Calendrier financier + récurrences + rappels | À faire |
| 7 | Analyse intelligente (règles) | À faire |
| 8 | Abonnement (RevenueCat, essai, page Premium, webhook) | À faire |
| 9 | Assistant conversationnel | À faire |
| 10 | Finitions : export, suppression, biométrie, hors-ligne, publication | À faire |

## Étape 1 — détails

- Connexion par e-mail + mot de passe, confirmation et réinitialisation par **code à 6 chiffres**.
- Session stockée chiffrée (Keychain / Keystore via `expo-secure-store`).
- Profil créé automatiquement à l'inscription ; lecture et modification limitées à son propre profil (RLS).
- Aiguillage automatique : connexion → premier paramétrage (pays, devise, prénom) → tableau de bord.
- Connexion Apple / Google : prévue à l'étape 10 (nécessite les comptes développeur).

## Limites connues

- Le changement de sens d'écriture (arabe ↔ français/anglais) nécessite un redémarrage de
  l'application sur iOS et Android. L'application prévient l'utilisateur et redémarre seule.
- Les achats intégrés ne fonctionnent pas dans Expo Go : une « development build » (EAS)
  sera nécessaire à partir de l'étape 8.
