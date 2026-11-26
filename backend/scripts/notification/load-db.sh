#!/usr/bin/env bash
# Loads the Notification Service's procedures and login (every db/notification/*.sql file,
# in name order) into the Compose database "ecocollect", then sets the login's password.
# Nothing is dropped except the procedures themselves, so it is safe to run again after every pull.
# Needs the notification tables (db/init/040_notification_tables.sql, run on a new volume).
#
# Usage (from any directory), with `docker compose up -d postgres` running:
#   backend/scripts/notification/load-db.sh
# Reads NOTIFICATION_DB_PASSWORD from the environment, else from .env.
set -euo pipefail

# The repo root, from this script's own place (backend/scripts/notification/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

PW="${NOTIFICATION_DB_PASSWORD:-}"
if [[ -z "$PW" && -f "$ROOT/.env" ]]; then
  PW="$(grep '^NOTIFICATION_DB_PASSWORD=' "$ROOT/.env" | cut -d= -f2- || true)"
fi
if [[ -z "$PW" ]]; then
  echo "load-db: NOTIFICATION_DB_PASSWORD is not set (see .env.example)" >&2
  exit 1
fi

# psql inside the postgres container, as the Compose superuser.
#   -X: ignore ~/.psqlrc   ON_ERROR_STOP: exit non-zero on the first error   -q: quiet
psql_in() {
  docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
    sh -c 'exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"
}

# Stop with a clear message when the tables the procedures change are missing.
has_tables="$(psql_in -t -A -c "SELECT to_regclass('notifications.request_notification') IS NOT NULL")"
if [[ "$has_tables" != "t" ]]; then
  echo "load-db: notifications.request_notification is missing. Create the tables first" >&2
  echo "load-db: (db/init/040_notification_tables.sql runs on a new volume)." >&2
  exit 1
fi

shopt -s nullglob
for f in "$ROOT"/db/notification/*.sql; do
  echo "load-db: ${f#"$ROOT"/}"
  psql_in < "$f"
done

echo "load-db: setting the ecocollect_notification password"
printf '%s\n' "SELECT format('ALTER ROLE ecocollect_notification LOGIN PASSWORD %L', :'pw') \\gexec" \
  | psql_in -v pw="$PW"

echo "load-db: done"
