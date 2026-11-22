#!/usr/bin/env bash
# Loads the Request Service's database objects inside the compose "postgres" container.
#
# Development (no argument): your local Compose database "ecocollect", the one
# database every service uses (contract 2.1). Nothing is dropped, so it is safe to
# run again after every pull:
#   1. db/init/010_request_tables.sql and 011_request_seed.sql: the course tables in
#      "requests" and their reference data. Postgres already ran them on a new
#      volume; running them again changes nothing (IF NOT EXISTS, ON CONFLICT), and
#      on an older volume it adds them.
#   2. every db/request/*.sql file, in name order: operational tables, functions and
#      the ecocollect_request login (099_request_login.sql last). A new SQL file is
#      loaded just by adding it.
#   3. sets the ecocollect_request password from REQUEST_DB_PASSWORD
# Needs the User Service's tables in "users" (db/init/005_user_tables.sql).
#
# Tests (--test): drops and rebuilds a test database, like a new volume:
#   1. every db/init/*.sql file, in name order (all services' tables)
#   2. every db/request/*.sql file
#   3. backend/test/request/seed.sql: the accounts and requests the tests expect
#   4. sets the ecocollect_request password
#
# Usage (from any directory):
#   backend/scripts/request/load-db.sh                      # local Compose database: ecocollect
#   backend/scripts/request/load-db.sh --test               # test database: ecocollect_request_test
#   backend/scripts/request/load-db.sh --test other_name    # another test database
#
# Needs: `docker compose up -d postgres`, and REQUEST_DB_PASSWORD in .env (or exported).
set -euo pipefail

# The repo root, from this script's own place (backend/scripts/request/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

TEST=false
DB=ecocollect
if [[ "${1:-}" == "--test" ]]; then
  TEST=true
  DB="${2:-ecocollect_request_test}"
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

# The ecocollect_request password: REQUEST_DB_PASSWORD from the environment, else
# from the repo's .env. Checked before anything is changed.
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

# Loads each file given, in order, and stops at the first error.
load() {
  local f
  for f in "$@"; do
    echo "load-db: ${f#"$ROOT"/}"
    psql_in -d "$DB" < "$f"
  done
}

# The globs come back sorted by name, and every name starts with its number.
# nullglob: no match gives an empty list, not the pattern itself.
shopt -s nullglob
request_files=("$ROOT"/db/request/*.sql)
if (( ${#request_files[@]} == 0 )); then
  echo "load-db: no db/request/*.sql files found" >&2
  exit 1
fi

if [[ "$TEST" == true ]]; then
  echo "load-db: recreating database $DB"
  # Two -c's run as separate statements: DROP/CREATE DATABASE can't run inside a transaction.
  # WITH (FORCE) closes leftover connections (e.g. a test run that didn't finish).
  psql_in -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB"
  load "$ROOT"/db/init/*.sql "${request_files[@]}" "$ROOT/backend/test/request/seed.sql"
else
  # Stop with a clear message when the User tables are missing: 010 references them.
  has_users="$(psql_in -d "$DB" -t -A -c "SELECT to_regclass('users.terms_acceptance') IS NOT NULL")"
  if [[ "$has_users" != "t" ]]; then
    echo "load-db: users.terms_acceptance is missing in $DB. Load the User Service's" >&2
    echo "load-db: tables first (db/init/005_user_tables.sql, run on a new volume)." >&2
    exit 1
  fi
  load "$ROOT/db/init/010_request_tables.sql" "$ROOT/db/init/011_request_seed.sql" "${request_files[@]}"
fi

# Turn on the ecocollect_request login (created by 099_request_login.sql).
# The role belongs to the whole server, so every load sets the same password.
echo "load-db: setting the ecocollect_request password"
printf '%s\n' "SELECT format('ALTER ROLE ecocollect_request LOGIN PASSWORD %L', :'pw') \\gexec" \
  | psql_in -d "$DB" -v pw="$PW"

echo "load-db: done. The service connects with postgres://ecocollect_request:<REQUEST_DB_PASSWORD>@localhost:\${POSTGRES_PORT:-5432}/$DB"
