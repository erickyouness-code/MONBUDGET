# Mettre en service l'abonnement Premium (étape 8)

Le code est prêt. Cette mise en service demande **vos** comptes (Apple, Google, RevenueCat) : je ne
peux pas les créer à votre place. Comptez une demi-journée la première fois. Faites-le dans l'ordre.

> ⚠️ Ne m'envoyez jamais de clé **secrète** (RevenueCat secret key, Supabase service_role,
> clés Apple / Google). Elles s'enregistrent directement dans Supabase avec la commande indiquée.

## Vue d'ensemble

```
Téléphone ── achat (fenêtre Apple / Google, confirmée par l'utilisateur)
   │
   ├─► RevenueCat ── notification ──► fonction « revenuecat-webhook » ─┐
   │                                                                  ├─► table entitlements
   └─► fonction « sync-entitlement » (juste après l'achat) ───────────┘   (droit d'accès)
                     ▲ les deux redemandent l'état OFFICIEL à RevenueCat
```

Sans abonnement actif, la base refuse toute création ou modification de données (règles RLS),
même si quelqu'un modifiait l'application.

## 0. Décisions à prendre

| Sujet | Proposition | À valider |
|---|---|---|
| Prix mensuel | Maroc : **29 DH** ; Gabon : **1 500 FCFA** (à ajuster selon vos tests) | Oui |
| Identifiant de l'application | `com.monbudget.app` (déjà dans `app.json`) | Oui — **définitif** après la 1re publication |
| Identifiant du produit | `monbudget_premium_monthly` | — |
| Droit d'accès RevenueCat | `premium` (utilisé par le serveur) | Ne pas changer |
| Essai gratuit | 3 jours, nouveaux abonnés uniquement | — |

Les stores proposent des grilles de prix par pays : choisissez le palier le plus proche.

## 1. Apple (App Store Connect)

1. Compte **Apple Developer** (99 $/an) : https://developer.apple.com
2. **Agreements, Tax, and Banking** : signez le contrat *Paid Applications* et renseignez
   coordonnées bancaires et fiscales (sinon aucun achat ne fonctionne).
3. **Apps → +** : créez l'application avec l'identifiant `com.monbudget.app`.
4. **Monetization → Subscriptions** : groupe « Premium », abonnement `monbudget_premium_monthly`,
   durée **1 mois**, prix, nom et description dans chaque langue.
5. Dans cet abonnement : **Introductory Offers → Free trial, 3 days**.
6. **Users and Access → Sandbox** : créez un compte de test pour essayer sans payer.

## 2. Google (Play Console)

1. Compte **Google Play Console** (25 $ une fois) : https://play.google.com/console
2. **Profil de paiement** marchand (obligatoire pour vendre).
3. Créez l'application avec le package `com.monbudget.app` et envoyez une première version
   (piste de test interne) — Google l'exige avant de créer des abonnements.
4. **Monétiser → Abonnements** : `monbudget_premium_monthly`, forfait de base mensuel à
   renouvellement automatique, prix par pays.
5. Sur ce forfait : **offre** « essai gratuit 3 jours », éligibilité *nouveaux clients*.
6. **Paramètres → Test de licence** : ajoutez votre adresse Gmail pour tester sans payer.

## 3. RevenueCat (gratuit au démarrage)

1. Compte sur https://www.revenuecat.com, projet « MonBudget ».
2. Ajoutez l'app **iOS** (identifiant `com.monbudget.app` + clé In-App Purchase d'App Store
   Connect) et l'app **Android** (package + compte de service Google, voir leur guide).
3. **Entitlements** : créez `premium` et rattachez-y le produit des deux stores.
4. **Offerings** : offre `default` (marquée *current*) avec un package **Monthly**.
5. **API Keys** : copiez les deux clés **publiques** (iOS `appl_…`, Android `goog_…`) dans
   `.env.local` :
   ```
   EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...
   ```
   Copiez aussi la **clé secrète** (`sk_…`) : elle va dans Supabase (étape 4), nulle part ailleurs.
6. **Integrations → Webhooks** :
   - URL : `https://VOTRE-PROJET.supabase.co/functions/v1/revenuecat-webhook`
   - En-tête d'autorisation : `Bearer ` suivi d'un long secret aléatoire de votre choix
     (ex. généré par un gestionnaire de mots de passe). Gardez ce secret pour l'étape 4.

## 4. Supabase

1. Exécutez le fichier SQL n° 7 (`20261108000000_subscriptions.sql`) comme les précédents.
2. Sur votre ordinateur, dans le dossier du projet :
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref VOTRE_REF_PROJET
   ```
   ```bash
   npx supabase secrets set REVENUECAT_SECRET_API_KEY=sk_... REVENUECAT_WEBHOOK_AUTH=VOTRE_SECRET_WEBHOOK
   ```
   ```bash
   npx supabase functions deploy revenuecat-webhook --no-verify-jwt
   ```
   ```bash
   npx supabase functions deploy sync-entitlement
   ```
3. Dans RevenueCat, bouton **Send test event** du webhook : la réponse doit être `200`.

## 5. Tester un vrai achat (version de développement)

Les achats ne fonctionnent pas dans Expo Go. On fabrique une version de développement avec EAS :

```bash
npx eas-cli@latest login
```
```bash
npx eas-cli@latest build --profile development --platform android
```

Installez le fichier obtenu sur votre téléphone, lancez `npx expo start`, puis abonnez-vous avec
votre compte de test (aucun débit réel). L'accès doit s'ouvrir en quelques secondes.

## Accès gratuit (tests, cas particuliers)

- **Recommandé** : dans RevenueCat, fiche du client → *Grant promotional entitlement* : passe par
  le circuit normal et reste cohérent.
- Pour un test rapide uniquement, dans l'éditeur SQL de Supabase :
  ```sql
  insert into public.entitlements (user_id, store, period_type, expires_at)
  select id, 'manual', 'normal', now() + interval '30 days' from auth.users where email = 'vous@exemple.com'
  on conflict (user_id) do update set store = 'manual', expires_at = excluded.expires_at;
  ```
  (Cet accès manuel est remplacé par l'état RevenueCat dès que l'utilisateur appuie sur
  « Restaurer » ou « Vérifier mon abonnement ».)

## Vérifications automatiques

```bash
npm run test:db          # verrouillage des écritures sans abonnement (RLS)
npm run test:functions   # la fonction webhook est exécutée face à un faux RevenueCat
npm test                 # conversion de l'état RevenueCat, affichage de l'essai et du statut
npm run test:e2e         # parcours de la page Premium
```
