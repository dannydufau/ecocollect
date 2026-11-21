#!/usr/bin/env bash
# Builds the Reward Service database inside the Compose "postgres" container:
#   1. drops and recreates the database
#   2. loads the 608 physical model with its seed (schema ecocollect608)
#   3. loads every db/reward/*.sql file in name order
#   4. sets the ecocollect_reward password from REWARD_DB_PASSWORD
#
# Usage, from any folder, with Postgres running (docker compose up -d postgres):
#   REWARD_DB_PASSWORD=... backend/scripts/reward/load-db.sh                    # ecocollect_reward
#   REWARD_DB_PASSWORD=... backend/scripts/reward/load-db.sh ecocollect_reward_test
set -euo pipefail

DB="${1:-ecocollect_reward}"
: "${REWARD_DB_PASSWORD:?set REWARD_DB_PASSWORD, see .env.example}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MODEL_DIR="$ROOT/docs/Final Submission/ENSF608/4. Physical model"

if [[ ! "$DB" =~ ^[a-z_][a-z0-9_]*$ ]] || [[ "$DB" == "ecocollect" || "$DB" == "postgres" ]]; then
  echo "load-db: refusing database name '$DB'" >&2
  exit 1
fi

psql_in() {
  docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
    sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$@"' psql "$@"
}

echo "load-db: recreating database $DB"
psql_in -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB"

for f in "$MODEL_DIR/tables.sql" "$MODEL_DIR/transactions.sql" "$MODEL_DIR/seed.sql" "$ROOT"/db/reward/*.sql; do
  echo "load-db: ${f##*/}"
  psql_in -d "$DB" < "$f"
done

echo "load-db: setting the ecocollect_reward password"
printf '%s\n' "SELECT format('ALTER ROLE ecocollect_reward LOGIN PASSWORD %L', :'pw') \\gexec" \
  | psql_in -d "$DB" -v pw="$REWARD_DB_PASSWORD"

echo "load-db: done"