#!/usr/bin/env bash
# Parcours complets dans un navigateur (Playwright), avec un faux serveur
# Supabase simulé dans le test : aucune vraie donnée n'est utilisée.
# Usage : npm run test:e2e   (captures d'écran dans e2e/screenshots/)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8765
SHOTS="$ROOT/e2e/screenshots"
mkdir -p "$SHOTS"

# Clé « anon » factice, uniquement pour ce test.
FAKE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.$(printf '{"role":"anon","iss":"supabase"}' | base64 -w0 | tr '+/' '-_' | tr -d '=').test"

cd "$ROOT"
rm -rf dist
EXPO_PUBLIC_SUPABASE_URL=https://test-project.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY="$FAKE_KEY" \
CI=1 npx expo export --platform web --output-dir dist >/dev/null

python3 -m http.server "$PORT" --directory dist >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1

status=0
for flow in "$ROOT"/e2e/*.flow.js; do
  echo "→ $(basename "$flow")"
  node "$flow" "$SHOTS" || status=1
done
exit $status
