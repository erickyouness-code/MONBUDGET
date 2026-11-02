# Configurer Supabase (étape 1)

Durée : environ 15 minutes. Aucune connaissance technique particulière n'est nécessaire.

## 1. Créer le projet

1. Créez un compte sur [supabase.com](https://supabase.com) puis cliquez sur **New project**.
2. **Name** : `monbudget`.
3. **Database password** : générez un mot de passe fort et gardez-le dans un gestionnaire de mots de passe.
   Il ne doit jamais être partagé, ni avec moi ni dans le code.
4. **Region** : choisissez une région en Europe (par exemple *Central EU (Frankfurt)* ou *West EU (Paris)*),
   la plus proche du Maroc et du Gabon.
5. Cliquez sur **Create new project** et attendez une à deux minutes.

## 2. Créer les tables

Les fichiers du dossier `supabase/migrations/` s'exécutent **un par un, dans l'ordre de leur nom** :

| Ordre | Fichier | Contenu |
|---|---|---|
| 1 | `20261102000000_profiles.sql` | Profils (étape 1) |
| 2 | `20261103000000_accounts_transactions.sql` | Comptes, catégories, transactions (étape 2) |

Pour chaque fichier :

1. Menu de gauche : **SQL Editor** → **New query**.
2. Copiez tout le contenu du fichier et collez-le.
3. Cliquez sur **Run**. Le message « Success. No rows returned » doit s'afficher.

> N'exécutez jamais deux fois le même fichier. À chaque nouvelle étape, je vous indiquerai le
> nouveau fichier à exécuter.

## 3. Réglages de connexion

Menu **Authentication** :

- **Sign In / Providers → Email** :
  - *Enable Email provider* : activé.
  - *Confirm email* : activé (l'utilisateur doit confirmer son adresse).
  - *Minimum password length* : `8`.
- **Emails → Templates** : l'application demande un **code à 6 chiffres** plutôt qu'un lien,
  pour fonctionner sur tous les téléphones. Dans les modèles suivants, remplacez le contenu par un
  texte qui contient `{{ .Token }}` :
  - **Confirm signup** — par exemple :
    ```html
    <h2>Bienvenue sur MonBudget</h2>
    <p>Votre code de confirmation : <strong>{{ .Token }}</strong></p>
    <p>Il expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
    ```
  - **Reset password** — par exemple :
    ```html
    <h2>Réinitialisation du mot de passe</h2>
    <p>Votre code : <strong>{{ .Token }}</strong></p>
    <p>Si vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.</p>
    ```

> Le service d'e-mail intégré de Supabase est limité (quelques e-mails par heure). C'est suffisant
> pour les tests ; avant le lancement, il faudra brancher un service d'envoi (SMTP) dédié.

## 4. Récupérer les deux valeurs publiques

Menu **Project Settings → API** (ou **API Keys**) :

- **Project URL** : `https://xxxx.supabase.co`
- **Clé publique** : appelée `anon` / `public` ou `publishable` selon les projets.

⚠️ Ne copiez **jamais** la clé `service_role` / `secret` dans l'application : elle donne un accès
total à la base. L'application refuse d'ailleurs de démarrer si elle la détecte.

## 5. Brancher l'application

À la racine du projet, copiez `.env.example` en `.env.local` et remplacez les deux valeurs.
Ce fichier est ignoré par Git : il ne sera jamais publié.

```bash
cp .env.example .env.local
```

Puis relancez l'application :

```bash
npx expo start --clear
```

## Vérifier la sécurité en local

Les règles d'accès (RLS) sont testées automatiquement sur une base PostgreSQL temporaire :

```bash
npm run test:db
```
