#!/usr/bin/env bash
# Loads the Cleanup Service tables and login into the Compose Postgres (contract 2.1).
#
#   backend/scripts/cleanup/load-db.sh          # shared database "ecocollect", nothing dropped
#   backend/scripts/cleanup/load-db.sh --test   # rebuilds "ecocollect_cleanup_test" from db/init
#
# A new volume already runs db/init/020_cleanup.sql; on an older volume this adds it.
# Running it again changes nothing (IF NOT EXISTS). Then sets the ecocollect_cleanup
# password with set-password.sql.
# Reads CLEANUP_DB_PASSWORD from the environment, else from .env.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

TEST=false
DB=ecocollect
if [[ "${1:-}" == "--test" ]]; then
  TEST=true
  DB="${2:-ecocollect_cleanup_test}"
elif [[ $# -gt 0 ]]; then
  echo "load-db: unknown argument '$1' (use --test [name])" >&2
  exit 1
fi

# The name goes into SQL text, so allow plain lowercase names only.
if [[ ! "$DB" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "load-db: invalid database name '$DB'" >&2
  exit 1
fi
# A test database is dropped first: never the Compose database the services use.
if [[ "$TEST" == true && ( "$DB" == "ecocollect" || "$DB" == "postgres" ) ]]; then
  echo "load-db: refusing to drop '$DB'" >&2
  exit 1
fi

PW="${CLEANUP_DB_PASSWORD:-}"
if [[ -z "$PW" && -f "$ROOT/.env" ]]; then
  PW="$(grep '^CLEANUP_DB_PASSWORD=' "$ROOT/.env" | cut -d= -f2- || true)"
fi
if [[ -z "$PW" ]]; then
  echo "load-db: CLEANUP_DB_PASSWORD is not set (see .env.example)" >&2
  exit 1
fi

# psql inside the container as the Compose admin. set-password.sql reads the
# password from CLEANUP_DB_PASSWORD in the container's environment.
psql_in() {
  docker compose -f "$ROOT/docker-compose.yml" exec -T -e CLEANUP_DB_PASSWORD="$PW" postgres \
    sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$@"' psql "$@"
}

# Loads each file given, in order, and stops at the first error.
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
  load "$ROOT"/db/init/*.sql
else
  load "$ROOT/db/init/020_cleanup.sql"
fi

echo "load-db: setting the ecocollect_cleanup password"
psql_in -d "$DB" < "$ROOT/backend/scripts/cleanup/set-password.sql"

echo "load-db: done"
