#!/usr/bin/env bash
# Run the integration tests against RabbitMQ and PostgreSQL.
#
#   npm run test:integration                      (from backend/)
#   bash backend/scripts/test-integration.sh      (from anywhere)
#
# Starts and waits for Compose services when their endpoints are selected.
# A database outside Compose must be initialized. Its setup uses host psql.
# A broker outside Compose must be reserved for the test run.
#
# Env vars: RABBITMQ_URL, RABBITMQ_MGMT_URL and DATABASE_URL come from your shell if set
# there, else from the repo's .env, else they are built from .env's parts (the same values
# Compose uses).
#
set -euo pipefail
cd "$(dirname "$0")/../.."

# Use the same user, password and database as Compose, from the repo's .env.
# Loading .env would overwrite URLs set in the shell, so keep those and put them back after.
shell_rabbitmq_url="${RABBITMQ_URL:-}"
shell_rabbitmq_mgmt_url="${RABBITMQ_MGMT_URL:-}"
shell_database_url="${DATABASE_URL:-}"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
if [ -n "$shell_rabbitmq_url" ]; then RABBITMQ_URL="$shell_rabbitmq_url"; fi
if [ -n "$shell_rabbitmq_mgmt_url" ]; then RABBITMQ_MGMT_URL="$shell_rabbitmq_mgmt_url"; fi
if [ -n "$shell_database_url" ]; then DATABASE_URL="$shell_database_url"; fi

# Each URL: the shell's, else the one in .env, else built from the parts above.
export RABBITMQ_URL="${RABBITMQ_URL:-amqp://${RABBITMQ_USER:-ecocollect}:${RABBITMQ_PASSWORD:-change_me}@localhost:${RABBITMQ_PORT:-5672}}"
export RABBITMQ_MGMT_URL="${RABBITMQ_MGMT_URL:-http://${RABBITMQ_USER:-ecocollect}:${RABBITMQ_PASSWORD:-change_me}@localhost:${RABBITMQ_MGMT_PORT:-15672}}"
export DATABASE_URL="${DATABASE_URL:-postgres://${POSTGRES_USER:-ecocollect}:${POSTGRES_PASSWORD:-change_me}@localhost:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-ecocollect}}"

# The normal .env already specifies localhost URLs for both Compose services.
# Compare endpoints so those URLs still start the stack and stop its consumer.
uses_compose_endpoint() {
  endpoint_url="$1" node -e '
    const [publishedPort, defaultPort, resource] = process.argv.slice(1);
    if (!URL.canParse(process.env.endpoint_url)) process.exit(1);
    const url = new URL(process.env.endpoint_url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const path = decodeURIComponent(url.pathname).replace(/^\//, "");
    const matches = local && (url.port || defaultPort) === publishedPort
      && (resource === undefined || path === resource || (resource === "" && path === "/"));
    process.exitCode = matches ? 0 : 1;
  ' "$2" "$3" "${@:4}"
}

compose_broker=false
compose_database=false
compose_services=()
if uses_compose_endpoint "$RABBITMQ_URL" "${RABBITMQ_PORT:-5672}" 5672 ""; then
  compose_broker=true
  compose_services+=(rabbitmq)
fi
if uses_compose_endpoint "$DATABASE_URL" "${POSTGRES_PORT:-5432}" 5432; then
  compose_services+=(postgres)
  if uses_compose_endpoint "$DATABASE_URL" "${POSTGRES_PORT:-5432}" 5432 "${POSTGRES_DB:-ecocollect}"; then
    compose_database=true
  fi
fi
if [ "${#compose_services[@]}" -gt 0 ]; then
  docker compose up -d --wait "${compose_services[@]}"
fi

# The tests start their own notification service on the notification.events queue. A running
# Compose notification container would share that queue, and RabbitMQ gives each message to
# only one of them, so the tests would miss events. Stop it for the run, and start it again
# on any exit (pass, fail or Ctrl+C), but only if it was running before.
if "$compose_broker" && docker compose ps --status running --services | grep -qx notification; then
  docker compose stop notification
  repo_root="$PWD"                            # the trap runs after the cd into backend below
  trap 'cd "$repo_root" && docker compose start notification' EXIT
fi

# Use the resolved database for setup too. For Compose, psql runs inside the container.
if "$compose_database"; then
  backend/scripts/notification/load-db.sh
else
  backend/scripts/notification/load-db.sh --test-database
fi

cd backend
node --test --test-concurrency=1 test/integration/*.test.js
