#!/usr/bin/env bash
# Builds a fresh Request Service database inside the compose "postgres" container:
#   1. drops and recreates the database
#   2. the course database (the 608 physical model in MODEL_DIR): tables.sql,
#      transactions.sql, seed.sql (schema ecocollect608). A stand-in until
#      integration, for both the User Service's tables (later in "users") and this
#      service's course tables (later in "requests"); see the 020 header.
#   3. every db/request/*.sql file, in name order: the Request Service's own files
#      (020_request_ops.sql first, then helpers, checks, reads and writes, and
#      099_request_login.sql last). A new SQL file is loaded just by adding it.
#   4. sets the ecocollect_request password from REQUEST_DB_PASSWORD
# They are not in db/init: Postgres runs db/init on every new Compose volume, where
# the course schema doesn't exist yet, so these files would stop the database.
#
# Usage (from any directory):
#   backend/scripts/request/load-db.sh                          # dev database: ecocollect_request
#   backend/scripts/request/load-db.sh ecocollect_request_test  # test database
#
# Needs: `docker compose up -d postgres`, and REQUEST_DB_PASSWORD in .env (or exported).
set -euo pipefail

DB="${1:-ecocollect_request}"
MODEL_DIR="docs/Final Submission/ENSF608/4. Physical model"
# The repo root, from this script's own place (backend/scripts/request/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# The name goes into SQL text, so allow plain lowercase names only.
if [[ ! "$DB" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "load-db: invalid database name '$DB'" >&2
  exit 1
fi
# Never drop the shared compose database.
if [[ "$DB" == "ecocollect" || "$DB" == "postgres" ]]; then
  echo "load-db: refusing to drop '$DB'" >&2
  exit 1
fi

# The ecocollect_request password: REQUEST_DB_PASSWORD from the environment, else
# from the repo's .env. Checked before anything is dropped.
PW="${REQUEST_DB_PASSWORD:-}"
if [[ -z "$PW" && -f "$ROOT/.env" ]]; then
  PW="$(grep '^REQUEST_DB_PASSWORD=' "$ROOT/.env" | cut -d= -f2- || true)"
fi
if [[ -z "$PW" ]]; then
  echo "load-db: REQUEST_DB_PASSWORD is not set (see .env.example)" >&2
  exit 1
fi

# psql inside the container (PostgreSQL 16, same as the server), as the compose
# superuser. sh -c lets "$POSTGRES_USER" come from the container's environment.
#   -X: ignore ~/.psqlrc   ON_ERROR_STOP: exit non-zero on the first error   -q: quiet
psql_in() {
  docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
    sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$@"' psql "$@"
}

echo "load-db: recreating database $DB"
# Two -c's run as separate statements: DROP/CREATE DATABASE can't run inside a transaction.
# WITH (FORCE) closes leftover connections (e.g. a test run that didn't finish).
psql_in -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB"

# Each file has its own BEGIN/COMMIT, so a failure leaves nothing half-loaded from that file.
for f in tables.sql transactions.sql seed.sql; do
  echo "load-db: $f"
  psql_in -d "$DB" < "$ROOT/$MODEL_DIR/$f"
done

# The glob comes back sorted by name, and every name starts with its number.
# nullglob: no match gives an empty list, not the pattern itself.
shopt -s nullglob
files=("$ROOT"/db/request/*.sql)
if (( ${#files[@]} == 0 )); then
  echo "load-db: no db/request/*.sql files found" >&2
  exit 1
fi
for f in "${files[@]}"; do
  echo "load-db: ${f##*/}"
  psql_in -d "$DB" < "$f"
done

# Turn on the ecocollect_request login (created by 099_request_login.sql).
# The role belongs to the whole server, so every load sets the same password.
echo "load-db: setting the ecocollect_request password"
printf '%s\n' "SELECT format('ALTER ROLE ecocollect_request LOGIN PASSWORD %L', :'pw') \\gexec" \
  | psql_in -d "$DB" -v pw="$PW"

echo "load-db: done. The service connects with postgres://ecocollect_request:<REQUEST_DB_PASSWORD>@localhost:\${POSTGRES_PORT:-5432}/$DB"
