#!/usr/bin/env bash
# Loads the Notification Service's tables (db/init/040_notification_tables.sql), then its
# procedures and login (every db/notification/*.sql file, in name order) into the Compose
# database "ecocollect", then sets the login's password.
# Nothing is dropped except the procedures themselves, so it is safe to run again after every pull.
# Needs the users, requests and rewards tables. Load the base schema first.
#
# Usage (from any directory), with `docker compose up -d postgres` running:
#   backend/scripts/notification/load-db.sh
# Reads NOTIFICATION_DB_PASSWORD from the environment, else from .env.
# --test-database loads SQL via host psql using DATABASE_URL and leaves service passwords alone.
set -euo pipefail

# The repo root, from this script's own place (backend/scripts/notification/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

test_database=false
case "${1:-}" in
  '') ;;
  --test-database)
    test_database=true
    : "${DATABASE_URL:?Set DATABASE_URL to an initialized test database}"
    ;;
  *) echo "Usage: $0 [--test-database]" >&2; exit 2 ;;
esac

if ! "$test_database"; then
  PW="${NOTIFICATION_DB_PASSWORD:-}"
  if [[ -z "$PW" && -f "$ROOT/.env" ]]; then
    PW="$(grep '^NOTIFICATION_DB_PASSWORD=' "$ROOT/.env" | cut -d= -f2- || true)"
  fi
  if [[ -z "$PW" ]]; then
    echo "load-db: NOTIFICATION_DB_PASSWORD is not set (see .env.example)" >&2
    exit 1
  fi
fi

# psql inside the postgres container, as the Compose superuser.
#   -X: ignore ~/.psqlrc   ON_ERROR_STOP: exit non-zero on the first error   -q: quiet
psql_in() {
  if "$test_database"; then
    psql -X -q -v ON_ERROR_STOP=1 --dbname="$DATABASE_URL" "$@"
    return
  fi
  docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
    sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"
}

# Postgres runs db/init only on a new volume, so the tables are loaded here too (IF NOT EXISTS).
shopt -s nullglob
for f in "$ROOT"/db/init/040_notification_tables.sql "$ROOT"/db/notification/*.sql; do
  echo "load-db: ${f#"$ROOT"/}"
  psql_in < "$f"
done

if ! "$test_database"; then
  echo "load-db: setting the ecocollect_notification password"
  printf '%s\n' "SELECT format('ALTER ROLE ecocollect_notification LOGIN PASSWORD %L', :'pw') \\gexec" \
    | psql_in -v pw="$PW"
fi

echo "load-db: done"
