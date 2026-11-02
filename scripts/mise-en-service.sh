#!/usr/bin/env bash
# =============================================================================
# Mise en service du serveur MonBudget (Supabase), en une seule commande.
# À lancer sur VOTRE ordinateur, dans le dossier du projet :
#
#     bash scripts/mise-en-service.sh
#
# Le script :
#   1. vous connecte à Supabase (fenêtre du navigateur) et relie votre projet ;
#   2. crée toutes les tables et règles de sécurité (les 8 fichiers SQL, dans l'ordre) ;
#   3. enregistre vos clés secrètes DANS SUPABASE (saisie masquée, jamais affichées,
#      jamais écrites dans le projet) ;
#   4. déploie les 4 fonctions serveur ;
#   5. prépare le fichier .env.local de l'application (clés publiques uniquement).
#
# Chaque clé secrète est facultative : appuyez sur Entrée pour la passer et la
# renseigner plus tard (relancez simplement le script).
# Option : --essai  → affiche les commandes sans rien exécuter.
# =============================================================================
set -euo pipefail

DRY_RUN=0
[ "${1:-}" = "--essai" ] && DRY_RUN=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
run() {
  if [ "$DRY_RUN" = 1 ]; then printf '  [essai] %s\n' "$*"; else "$@"; fi
}
ask() { # ask "Question" variable [défaut]
  local answer
  read -r -p "  $1${3:+ [$3]} : " answer
  printf -v "$2" '%s' "${answer:-${3:-}}"
}
ask_secret() { # saisie masquée
  local answer
  read -r -s -p "  $1 (Entrée pour passer) : " answer
  echo
  printf -v "$2" '%s' "$answer"
}
yes_no() {
  local answer
  read -r -p "  $1 [o/N] : " answer
  [[ "$answer" =~ ^[oOyY] ]]
}

command -v npx >/dev/null || { echo "Node.js est requis : https://nodejs.org (version LTS)."; exit 1; }

bold "MonBudget — mise en service du serveur"
info "Prérequis : un projet créé sur https://supabase.com (gratuit pour commencer)."
info "Référence du projet : Project Settings → General → « Project ID » (ex. abcdefghijklmnop)."

# ---------------------------------------------------------------------------
bold "1/5 · Connexion à Supabase"
run npx --yes supabase@latest login
ask "Référence de votre projet Supabase" PROJECT_REF
[[ "$PROJECT_REF" =~ ^[a-z0-9]{20}$ ]] || { [ "$DRY_RUN" = 1 ] || { echo "  Référence invalide (20 lettres minuscules et chiffres)."; exit 1; }; }
info "Le mot de passe de la base (choisi à la création du projet) va être demandé."
run npx --yes supabase@latest link --project-ref "$PROJECT_REF"

# ---------------------------------------------------------------------------
bold "2/5 · Tables et règles de sécurité"
info "Si vous avez déjà exécuté les fichiers SQL à la main dans l'éditeur Supabase, répondez non."
if yes_no "Créer les tables maintenant (8 fichiers SQL, dans l'ordre) ?"; then
  run npx --yes supabase@latest db push
fi

# ---------------------------------------------------------------------------
bold "3/5 · Clés secrètes (enregistrées dans Supabase uniquement)"
info "RevenueCat → Project settings → API keys → clé secrète (sk_...)."
ask_secret "Clé secrète RevenueCat" RC_SECRET
WEBHOOK_SECRET=""
if [ -n "$RC_SECRET" ] || yes_no "Générer le secret du webhook RevenueCat ?"; then
  WEBHOOK_SECRET="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48 || true)"
fi
info "Anthropic → https://console.anthropic.com → API Keys (sk-ant-...)."
ask_secret "Clé API Anthropic (assistant)" ANTHROPIC_KEY

SECRETS=()
[ -n "$RC_SECRET" ] && SECRETS+=("REVENUECAT_SECRET_API_KEY=$RC_SECRET")
[ -n "$WEBHOOK_SECRET" ] && SECRETS+=("REVENUECAT_WEBHOOK_AUTH=$WEBHOOK_SECRET")
[ -n "$ANTHROPIC_KEY" ] && SECRETS+=("ANTHROPIC_API_KEY=$ANTHROPIC_KEY")
if [ "${#SECRETS[@]}" -gt 0 ]; then
  if [ "$DRY_RUN" = 1 ]; then
    printf '  [essai] npx supabase secrets set (%s clé(s), valeurs masquées)\n' "${#SECRETS[@]}"
  else
    npx --yes supabase@latest secrets set "${SECRETS[@]}" >/dev/null
    info "✔ ${#SECRETS[@]} clé(s) enregistrée(s) dans Supabase."
  fi
else
  info "Aucune clé saisie : à faire plus tard (relancez le script)."
fi
unset RC_SECRET ANTHROPIC_KEY SECRETS

# ---------------------------------------------------------------------------
bold "4/5 · Fonctions serveur"
run npx --yes supabase@latest functions deploy revenuecat-webhook --no-verify-jwt
run npx --yes supabase@latest functions deploy sync-entitlement
run npx --yes supabase@latest functions deploy assistant
run npx --yes supabase@latest functions deploy delete-account

# ---------------------------------------------------------------------------
bold "5/5 · Configuration de l'application (.env.local, clés PUBLIQUES)"
info "Supabase → Project Settings → API Keys → clé « anon » / « publishable » (jamais la clé service_role)."
ask "Clé publique (anon) Supabase" ANON_KEY
if [[ "$ANON_KEY" == *service_role* ]] || [[ "$ANON_KEY" == sb_secret_* ]]; then
  echo "  ✘ Ceci est une clé SECRÈTE : elle ne doit jamais aller dans l'application. Arrêt."
  exit 1
fi
ask "Clé publique RevenueCat iOS (appl_..., facultatif)" RC_IOS
ask "Clé publique RevenueCat Android (goog_..., facultatif)" RC_ANDROID
ask "Adresse de la page Conditions d'utilisation (facultatif)" TERMS_URL
ask "Adresse de la page Confidentialité (facultatif)" PRIVACY_URL

ENV_CONTENT="EXPO_PUBLIC_SUPABASE_URL=https://${PROJECT_REF}.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
EXPO_PUBLIC_REVENUECAT_IOS_KEY=${RC_IOS}
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=${RC_ANDROID}
EXPO_PUBLIC_TERMS_URL=${TERMS_URL}
EXPO_PUBLIC_PRIVACY_URL=${PRIVACY_URL}"

if [ "$DRY_RUN" = 1 ]; then
  info "[essai] .env.local serait créé."
elif [ -e .env.local ]; then
  # On ne remplace jamais un fichier existant : nouvelle version à côté.
  printf '%s\n' "$ENV_CONTENT" > .env.local.nouveau
  info "Un fichier .env.local existe déjà : il n'a pas été modifié."
  info "La nouvelle configuration est dans .env.local.nouveau (comparez puis renommez-le)."
else
  printf '%s\n' "$ENV_CONTENT" > .env.local
  info "✔ .env.local créé (il n'est jamais envoyé sur GitHub)."
fi

# ---------------------------------------------------------------------------
bold "Terminé ✔ — il reste à faire dans les tableaux de bord :"
info "• Supabase → Authentication → Email Templates : codes à 6 chiffres (voir docs/SUPABASE.md)."
if [ -n "$WEBHOOK_SECRET" ]; then
  info "• RevenueCat → Integrations → Webhooks :"
  info "    URL : https://${PROJECT_REF}.supabase.co/functions/v1/revenuecat-webhook"
  info "    En-tête d'autorisation (à copier dans RevenueCat, puis gardez-le secret) :"
  info "    Bearer ${WEBHOOK_SECRET}"
fi
info "• Lancer l'application : npx expo start"
