#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
: "${DATABASE_URL:?Set DATABASE_URL to the target database using an admin login}"
: "${USER_DB_PASSWORD:?Set USER_DB_PASSWORD for the ecocollect_user login}"
psql -X -v ON_ERROR_STOP=1 --dbname="$DATABASE_URL" --single-transaction \
  -f "$root/db/init/029_user_tables.sql" \
  -f "$root/db/init/030_user_ops.sql" \
  -f "$root/db/init/031_user_seed.sql" \
  -f "$root/backend/scripts/user/set-password.sql"
