#!/usr/bin/env bash
# Teste les migrations et les règles de sécurité (RLS) sur un PostgreSQL local
# temporaire. Nécessite les binaires PostgreSQL (initdb, pg_ctl, psql).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PG_TEST_PORT:-54329}"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# PostgreSQL refuse de tourner en root : on utilise l'utilisateur "postgres" si besoin.
RUN=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$WORK"
  RUN=(runuser -u postgres --)
fi

"${RUN[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"${RUN[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -w start >/dev/null

PSQL=("${RUN[@]}" psql -h "$WORK" -p "$PORT" -U postgres -d postgres -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" < "$ROOT/supabase/tests/_supabase_stub.sql" >/dev/null
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ migration $(basename "$migration")"
  "${PSQL[@]}" < "$migration" >/dev/null
done
for test in "$ROOT"/supabase/tests/*.test.sql; do
  echo "→ test $(basename "$test")"
  "${PSQL[@]}" < "$test"
done
