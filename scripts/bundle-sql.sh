#!/usr/bin/env bash
# Rassemble les fichiers SQL (supabase/migrations) en un seul fichier à coller
# dans l'éditeur SQL de Supabase. À relancer après tout ajout de migration :
#   npm run sql:bundle
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/supabase/setup/tout-en-un.sql"
{
  echo "-- ============================================================================"
  echo "-- MonBudget : création COMPLÈTE de la base, en une seule fois."
  echo "-- À coller dans Supabase → SQL Editor → New query, puis cliquer sur « Run »."
  echo "-- À exécuter UNE SEULE FOIS, sur un projet neuf."
  echo "-- Fichier généré automatiquement (npm run sql:bundle) : ne pas modifier à la main."
  echo "-- ============================================================================"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo
    echo "-- >>>>>>>>>> $(basename "$f")"
    cat "$f"
  done
} > "$OUT"
echo "→ $OUT"
