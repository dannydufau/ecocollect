#!/usr/bin/env bash
# Run the integration tests against the Compose RabbitMQ and Postgres.
#
#   npm run test:integration                      (from backend/)
#   bash backend/scripts/test-integration.sh      (from anywhere)
#
# Starts the broker and the database if they aren't running, waits until they are
# healthy, sets the connection URLs, then runs test/integration/*.test.js.
#
# Env vars: RABBITMQ_URL, RABBITMQ_MGMT_URL and DATABASE_URL are built from the repo's
# .env (the same values Compose uses), unless you've already set them.
#
# Readiness: `docker compose up --wait` waits for the rabbitmq healthcheck in
# docker-compose.yml, so the broker accepts connections before tests start.

set -euo pipefail
cd "$(dirname "$0")/../.."                  # repo root, where docker-compose.yml lives

docker compose up -d --wait rabbitmq postgres

# Use the same user, password and database as Compose, from the repo's .env.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

export RABBITMQ_URL="${RABBITMQ_URL:-amqp://${RABBITMQ_USER:-ecocollect}:${RABBITMQ_PASSWORD:-change_me}@localhost:${RABBITMQ_PORT:-5672}}"
export RABBITMQ_MGMT_URL="${RABBITMQ_MGMT_URL:-http://${RABBITMQ_USER:-ecocollect}:${RABBITMQ_PASSWORD:-change_me}@localhost:${RABBITMQ_MGMT_PORT:-15672}}"
export DATABASE_URL="${DATABASE_URL:-postgres://${POSTGRES_USER:-ecocollect}:${POSTGRES_PASSWORD:-change_me}@localhost:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-ecocollect}}"

cd backend
node --test --test-concurrency=1 test/integration/*.test.js
