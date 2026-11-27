#!/usr/bin/env bash
# Run the integration tests against the Compose RabbitMQ and Postgres.
#
#   npm run test:integration                      (from backend/)
#   bash backend/scripts/test-integration.sh      (from anywhere)
#
# Starts the broker and the database if they aren't running, waits until they are
# healthy, sets the connection URLs, then runs test/integration/*.test.js.
#
# Env vars: RABBITMQ_URL, RABBITMQ_MGMT_URL and DATABASE_URL come from your shell if set
# there, else from the repo's .env, else they are built from .env's parts (the same values
# Compose uses).
#
# Readiness: `docker compose up --wait` waits for the rabbitmq healthcheck in
# docker-compose.yml, so the broker accepts connections before tests start.
#
# A running Compose notification container is stopped for the run and started again after.

set -euo pipefail
cd "$(dirname "$0")/../.."                  # repo root, where docker-compose.yml lives

docker compose up -d --wait rabbitmq postgres
backend/scripts/notification/load-db.sh   # the notification procedures the tests call

# The tests start their own notification service on the notification.events queue. A running
# Compose notification container would share that queue, and RabbitMQ gives each message to
# only one of them, so the tests would miss events. Stop it for the run, and start it again
# on any exit (pass, fail or Ctrl+C), but only if it was running before.
if docker compose ps --status running --services | grep -qx notification; then
  docker compose stop notification
  repo_root="$PWD"                            # the trap runs after the cd into backend below
  trap 'cd "$repo_root" && docker compose start notification' EXIT
fi

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

cd backend
node --test --test-concurrency=1 test/integration/*.test.js