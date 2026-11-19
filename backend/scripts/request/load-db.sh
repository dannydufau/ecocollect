#!/usr/bin/env bash
# Builds a fresh Request Service database inside the compose "postgres" container:
#   1. drops and recreates the database
#   2. PR #198's course database: tables.sql, transactions.sql, seed.sql (schema ecocollect608)
#   3. db/init/020_request_ops.sql (schema request_ops)
#   4. db/init/021_request_ops_functions.sql (outbox claim / mark published)
#   5. db/init/022_request_helpers.sql (helpers on the course tables)
#   6. db/init/023_request_enqueue_event.sql (stores one event in the outbox)
#   7. db/init/024_request_check.sql (check_request: request-level rules)
#
# Usage (from anywhere in the repo):
#   backend/scripts/request/load-db.sh                          # dev database: ecocollect_request
#   backend/scripts/request/load-db.sh ecocollect_request_test  # test database
#
# Needs: `docker compose up -d postgres`, and the PR branch fetched:
#   git fetch origin docs/final-physical-191
# The SQL files are read from branch MODEL_REF, at path MODEL_DIR inside it, without
# checking that branch out. After PR #198 merges they are in this branch too: then
# replace the `git show` line below with: psql_in -d "$DB" < "$ROOT/$MODEL_DIR/$f"
set -euo pipefail

DB="${1:-ecocollect_request}"
MODEL_REF="${MODEL_REF:-origin/docs/final-physical-191}"
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
if ! git rev-parse --verify --quiet "$MODEL_REF" >/dev/null; then
  if [[ "$MODEL_REF" == origin/* ]]; then
    # ${MODEL_REF#origin/} removes the leading "origin/": the branch name to fetch.
    echo "load-db: $MODEL_REF not found. Run: git fetch origin ${MODEL_REF#origin/}" >&2
  else
    echo "load-db: $MODEL_REF not found (not a branch, tag or commit here)" >&2
  fi
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
  echo "load-db: $f (from $MODEL_REF)"
  git show "$MODEL_REF:$MODEL_DIR/$f" | psql_in -d "$DB"
done

echo "load-db: 020_request_ops.sql"
psql_in -d "$DB" < "$ROOT/db/init/020_request_ops.sql"

echo "load-db: 021_request_ops_functions.sql"
psql_in -d "$DB" < "$ROOT/db/init/021_request_ops_functions.sql"

echo "load-db: 022_request_helpers.sql"
psql_in -d "$DB" < "$ROOT/db/init/022_request_helpers.sql"

echo "load-db: 023_request_enqueue_event.sql"
psql_in -d "$DB" < "$ROOT/db/init/023_request_enqueue_event.sql"

echo "load-db: 024_request_check.sql"
psql_in -d "$DB" < "$ROOT/db/init/024_request_check.sql"

echo "load-db: done. Connect with postgres://<POSTGRES_USER>:<POSTGRES_PASSWORD>@localhost:\${POSTGRES_PORT:-5432}/$DB"
