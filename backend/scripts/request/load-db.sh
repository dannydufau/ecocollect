#!/usr/bin/env bash
# Builds a fresh Request Service database inside the compose "postgres" container:
#   1. drops and recreates the database
#   2. the course database (the 608 physical model in MODEL_DIR): tables.sql,
#      transactions.sql, seed.sql (schema ecocollect608)
#   3. every db/init/0[2-9]*.sql file, in name order: the Request Service's own
#      files (020_request_ops.sql first, then helpers, checks, reads and writes).
#      001_schema.sql belongs to the shared compose database and is skipped.
#      A new SQL file is loaded just by adding it; this script doesn't change.
#
# Usage (from anywhere in the repo):
#   backend/scripts/request/load-db.sh                          # dev database: ecocollect_request
#   backend/scripts/request/load-db.sh ecocollect_request_test  # test database
#
# Needs: `docker compose up -d postgres`.
set -euo pipefail

DB="${1:-ecocollect_request}"
MODEL_DIR="docs/Final Submission/ENSF608/4. Physical model"
ROOT="$(git rev-parse --show-toplevel)"

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
files=("$ROOT"/db/init/0[2-9]*.sql)
if (( ${#files[@]} == 0 )); then
  echo "load-db: no db/init/0[2-9]*.sql files found" >&2
  exit 1
fi
for f in "${files[@]}"; do
  echo "load-db: ${f##*/}"
  psql_in -d "$DB" < "$f"
done

echo "load-db: done. Connect with postgres://<POSTGRES_USER>:<POSTGRES_PASSWORD>@localhost:\${POSTGRES_PORT:-5432}/$DB"
