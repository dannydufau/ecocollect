#!/usr/bin/env bash
# Loads the Reward Service tables and login into the Compose Postgres (contract 2.1).
#
#   backend/scripts/reward/load-db.sh          # shared database "ecocollect", nothing dropped
#   backend/scripts/reward/load-db.sh --test   # rebuilds "ecocollect_reward_test" with test/reward-seed.sql
#
# Reads REWARD_DB_PASSWORD from the environment, else from .env.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

TEST=false
DB=ecocollect
if [[ "${1:-}" == "--test" ]]; then
  TEST=true
  DB="${2:-ecocollect_reward_test}"
elif [[ $# -gt 0 ]]; then
  echo "load-db: unknown argument '$1' (use --test [name])" >&2
  exit 1
fi

if [[ ! "$DB" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "load-db: invalid database name '$DB'" >&2
  exit 1
fi
if [[ "$TEST" == true && ( "$DB" == "ecocollect" || "$DB" == "postgres" ) ]]; then
  echo "load-db: refusing to drop '$DB'" >&2
  exit 1
fi

PW="${REWARD_DB_PASSWORD:-}"
if [[ -z "$PW" && -f "$ROOT/.env" ]]; then
  PW="$(grep '^REWARD_DB_PASSWORD=' "$ROOT/.env" | cut -d= -f2- || true)"
fi
if [[ -z "$PW" ]]; then
  echo "load-db: REWARD_DB_PASSWORD is not set (see .env.example)" >&2
  exit 1
fi

psql_in() {
  docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
    sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$@"' psql "$@"
}

load() {
  local f
  for f in "$@"; do
    echo "load-db: ${f#"$ROOT"/}"
    psql_in -d "$DB" < "$f"
  done
}

if [[ "$TEST" == true ]]; then
  echo "load-db: recreating database $DB"
  psql_in -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB"
  load "$ROOT"/db/init/*.sql "$ROOT"/db/reward/*.sql "$ROOT/backend/test/reward-seed.sql"
else
  load "$ROOT/db/init/010_request_tables.sql" "$ROOT/db/init/011_request_seed.sql" \
    "$ROOT/db/init/012_reward_tables.sql" "$ROOT"/db/reward/*.sql
fi

echo "load-db: setting the ecocollect_reward password"
printf '%s\n' "SELECT format('ALTER ROLE ecocollect_reward LOGIN PASSWORD %L', :'pw') \\gexec" \
  | psql_in -d "$DB" -v pw="$PW"

echo "load-db: done"