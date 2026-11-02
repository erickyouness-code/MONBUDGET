# Mettre en service l'assistant (étape 9)

Le code est prêt. Il reste à créer **votre** compte chez Anthropic (le fournisseur de l'IA Claude)
et à enregistrer la clé dans Supabase. Comptez 15 minutes.

> ⚠️ Ne m'envoyez jamais la clé API Anthropic (`sk-ant-…`). Elle s'enregistre directement dans
> Supabase avec la commande ci-dessous et n'est **jamais** dans l'application.

## Comment ça marche

```
Téléphone ── question (+ échanges précédents, texte seul) ──► fonction « assistant » (Supabase)
                                                                  │ 1. connecté ?  2. Premium ?
                                                                  │ 3. accord donné ?  4. quota ?
                                                                  ▼
                                   API Claude ◄── choisit un outil ── ┐
                                        │                             │ outils de calcul EXACTS,
                                        └── formule la réponse ◄──────┘ lecture seule, avec le
                                                                        jeton de l'utilisateur (RLS)
```

- **L'IA ne fait aucun calcul.** Elle choisit l'un des 9 outils (résumé d'une période, répartition
  par catégorie, recherche de transactions, comptes, budgets, objectifs, échéances, « puis-je
  acheter… », plan d'épargne). Les chiffres sont calculés par le serveur, déjà formatés, puis l'IA
  rédige la réponse en reprenant ces chiffres.
- **Lecture seule** : aucun outil ne peut créer, modifier, supprimer ou payer quoi que ce soit.
- **Seulement les données de l'utilisateur** : les outils lisent la base avec le jeton de
  l'utilisateur connecté, donc les règles RLS s'appliquent comme dans l'application.
- **Accord explicite** : tant que l'utilisateur n'a pas accepté (écran « Avant de commencer »),
  le serveur refuse de répondre. L'accord se retire dans les Réglages.
- **Aucune conversation enregistrée** chez nous : elle reste en mémoire sur le téléphone.
  Seuls le nombre de questions et de jetons consommés sont comptés (table `assistant_usage`).
- **Limites** : 20 questions par jour et 5 par minute et par utilisateur (réglables).
- **Estimations signalées** : les projections (achat possible, plan d'épargne, date estimée
  d'un objectif) sont présentées comme des estimations.
- L'assistant rappelle qu'il n'est pas un conseiller financier professionnel et ne recommande
  aucun produit financier.

## 1. Créer la clé API

1. Créez un compte sur https://console.anthropic.com et ajoutez un moyen de paiement
   (facturation à l'usage).
2. **Settings → Limits** : fixez une **limite de dépense mensuelle** (ex. 20 $) pour éviter toute
   surprise.
3. **API Keys → Create Key** : nommez-la « MonBudget production » et copiez-la (elle n'est
   affichée qu'une fois).

## 2. Supabase

1. Exécutez le fichier SQL n° 8 (`20261109000000_assistant.sql`) comme les précédents.
2. Sur votre ordinateur, dans le dossier du projet (déjà relié au projet à l'étape 8) :
   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```
   ```bash
   npx supabase functions deploy assistant
   ```
3. Dans l'application : onglet **Assistant** → « J'accepte et je commence » → posez une question.

## Réglages facultatifs (secrets Supabase)

| Secret | Par défaut | Rôle |
|---|---|---|
| `ASSISTANT_MODEL` | `claude-opus-5-5` | Modèle utilisé. `claude-sonnet-5-5` ou `claude-haiku-5-5` coûtent moins cher (voir ci-dessous). |
| `ASSISTANT_DAILY_LIMIT` | `20` | Questions par jour et par utilisateur (jour compté en heure UTC). |
| `ASSISTANT_PER_MINUTE_LIMIT` | `5` | Questions par minute et par utilisateur. |

Exemple : `npx supabase secrets set ASSISTANT_DAILY_LIMIT=10` (pas besoin de redéployer).

## Coût (estimation à vérifier avec vos vrais chiffres)

Une question demande en général 2 ou 3 échanges avec l'IA (choix de l'outil, puis réponse).
Les consignes fixes sont mises en cache, ce qui réduit le coût des échanges suivants.

| Modèle | Prix (par million de jetons, entrée / sortie) | Coût estimé par question |
|---|---|---|
| `claude-opus-5-5` (par défaut, le plus fiable) | 4 $ / 20 $ | environ 0,02 à 0,08 $ |
| `claude-sonnet-5-5` | 2 $ / 10 $ | environ 0,01 à 0,04 $ |
| `claude-haiku-5-5` | 0,10 $ / 0,50 $ | moins de 0,002 $ |

Ordre de grandeur avec Opus : un utilisateur qui pose 30 questions par mois coûte environ 0,6 à
2,4 $ ; un utilisateur au maximum (20 par jour) jusqu'à 12 à 48 $. **À comparer avec le prix de
l'abonnement** : surveillez la consommation réelle, puis ajustez le modèle ou la limite.

Consommation réelle (éditeur SQL de Supabase) :
```sql
select day, count(*) as utilisateurs, sum(requests) as questions,
       sum(input_tokens) as jetons_entree, sum(output_tokens) as jetons_sortie
from public.assistant_usage group by day order by day desc limit 30;
```

## Confidentialité : à faire de votre côté

- Mentionnez l'assistant dans votre **politique de confidentialité** : les informations utiles à
  chaque question sont transmises à Anthropic (sous-traitant, hors Maroc / Gabon) uniquement pour
  produire la réponse, et seulement après accord de l'utilisateur.
- Vérifiez les conditions commerciales d'Anthropic (conservation des données, usage) et, si
  nécessaire, les obligations de déclaration auprès de la CNDP (Maroc) ou de l'APDPVP (Gabon).

## Vérifications automatiques

```bash
npm run test:db          # accord et quota protégés côté serveur (RLS)
npm run test:functions   # la fonction est exécutée face à une fausse API Claude
npm test                 # calculs des 9 outils, périodes, montants, boucle de conversation
npm run test:e2e         # parcours de l'écran Assistant (FR et AR)
```

Si vous modifiez `src/features/schedule/logic.ts` ou `src/features/goals/logic.ts`, lancez
`npm run sync:functions` : le serveur en utilise une copie (un test vérifie qu'elles sont identiques).
