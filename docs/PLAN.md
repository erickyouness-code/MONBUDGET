# Architecture et plan de développement

Document de référence validé avant l'implémentation. À mettre à jour à chaque décision importante.

## Décisions validées

| Sujet | Décision |
|---|---|
| Nom | MonBudget |
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
| 2 | Comptes + transactions (CRUD, recherche, transferts, catégories) | ✅ Code terminé — à brancher sur votre projet Supabase |
| 3 | Tableau de bord + graphiques | ✅ Code terminé — à brancher sur votre projet Supabase |
| 4 | Budgets + alertes | ✅ Code terminé — à brancher sur votre projet Supabase |
| 5 | Objectifs d'épargne | ✅ Code terminé — à brancher sur votre projet Supabase |
| 6 | Calendrier financier + récurrences + rappels | ✅ Code terminé — à brancher sur votre projet Supabase |
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

## Étape 2 — détails

- Comptes : espèces, banque, Mobile Money, épargne, autre ; solde initial ; archivage.
  Un compte qui contient des transactions ne peut pas être supprimé (il s'archive).
- Soldes calculés par la base (vue `account_balances`), jamais stockés.
- Transactions : dépense, revenu, transfert ; montant, date, catégorie, compte, moyen de paiement,
  description. Un transfert n'est jamais compté comme revenu ou dépense (règle en base + tests).
- La base refuse : montant nul ou négatif, transfert vers le même compte, dépense sans catégorie,
  catégorie de revenu utilisée pour une dépense, compte ou catégorie d'un autre utilisateur.
- 19 catégories par défaut adaptées au Maroc et au Gabon (dont Mobile Money, recharges, famille),
  et création de catégories personnelles.
- Historique groupé par jour, recherche (description et catégorie), filtres par type, pagination.
- Tableau de bord branché sur les vraies données du mois (revenus, dépenses, catégories, récentes).
- Une seule devise en V1 : elle est figée dès qu'un compte existe.

## Étape 3 — détails

- Solde disponible (total des comptes actifs), revenus, dépenses, « revenus − dépenses » et taux d'épargne.
- Comparaison honnête : mois en cours comparé à la **même période** du mois précédent
  (ex. 1er–12 novembre vs 1er–12 octobre) ; mois passé comparé au mois complet précédent.
  Aucun pourcentage affiché si le mois de référence est vide.
- Navigation entre les mois (impossible d'aller au-delà du mois en cours).
- Courbe du solde de fin de mois et barres revenus/dépenses sur 6 mois, calculées par la base
  (fonction `monthly_overview`, protégée par RLS).
- Les transactions ne peuvent plus être datées dans le futur (les paiements à venir auront leur
  espace à l'étape 6).
- Enregistrement plus rapide : les chiffres se mettent à jour en arrière-plan.

## Étape 4 — détails

- Budget du mois (global) et plafonds par catégorie de dépense, avec seuil d'alerte réglable (70–100 %).
- Un budget s'applique chaque mois jusqu'à modification ; changer un plafond ne réécrit pas les mois passés.
- Aide à la fin de mois : reste à dépenser, montant possible **par jour**, et **estimation** (présentée
  comme telle) des dépenses de fin de mois au rythme actuel.
- Alertes dans l'application juste après une dépense qui franchit le seuil ou dépasse un plafond,
  et bandeau « Budgets à surveiller » sur le tableau de bord.
- Calculs faits par la base (`budget_status`, `set_budget`), protégés par RLS.

## Étape 5 — détails

- Objectifs : nom, icône, montant cible, date limite (facultative), montant déjà épargné.
- Versements et retraits ; un objectif ne peut jamais passer en négatif (règle en base).
- Plan d'épargne : montant **par mois** et **par semaine** pour tenir l'échéance (arrondi vers le haut).
- Estimation de la date d'atteinte au rythme des 90 derniers jours, montant de départ exclu ;
  aucune estimation avec moins de 14 jours d'historique. Badges : en bonne voie, en retard,
  échéance dépassée, atteint (avec félicitations).
- Les versements suivent l'épargne sans modifier le solde des comptes (choix à confirmer).
- Les dates hors de l'année en cours affichent l'année.

## Étape 6 — détails

- Échéances : factures, abonnements, paiements prévus, revenus attendus, rappels ; une fois,
  chaque semaine, chaque mois (ou tous les 2/3/6 mois), chaque année. Le 31 devient le 30 ou
  le 28 selon le mois ; le 29 février devient le 28 hors années bissextiles.
- Calendrier du mois (points de couleur, retards entourés), reste à payer / à recevoir,
  sections « En retard / Aujourd'hui / 7 jours / Plus tard ».
- « Marquer comme payé / reçu » crée la transaction dans la même opération (fonction
  `complete_occurrence`) ; « Ignorer cette fois » ; « Annuler » supprime aussi la transaction créée.
- Notifications locales (fonctionnent dans Expo Go) : rappel à 9 h, X jours avant ; autorisation
  demandée seulement lors du premier rappel ; réglage pour les désactiver ; rappels effacés à la
  déconnexion.
- Accueil : carte « Prochaines échéances » ; un revenu en retard s'affiche « Pas encore reçu ».
- Accessibilité : les choix (pastilles, sélecteurs) sont annoncés « coché » aux lecteurs d'écran.

## Limites connues

- Le changement de sens d'écriture (arabe ↔ français/anglais) nécessite un redémarrage de
  l'application sur iOS et Android. L'application prévient l'utilisateur et redémarre seule.
- Le solde initial d'un compte ne peut pas encore être négatif depuis l'écran (la base l'accepte).
- Les versements d'épargne ne sont pas liés automatiquement à un transfert entre comptes.
- Les alertes de budget s'affichent dans l'application (pas de notification du téléphone pour elles).
- Les notifications n'ont pas encore été testées sur un vrai téléphone (impossible depuis cet environnement).
- Les achats intégrés ne fonctionnent pas dans Expo Go : une « development build » (EAS)
  sera nécessaire à partir de l'étape 8.
