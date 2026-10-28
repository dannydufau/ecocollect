#!/usr/bin/env bash
# Run the integration tests against the Compose RabbitMQ.
#
#   npm run test:integration                      (from backend/)
#   bash backend/scripts/test-integration.sh      (from anywhere)
#
# Starts the broker if it isn't running, waits until it is healthy, sets the
# connection URLs, then runs test/integration/*.test.js.
#
# Env vars: RABBITMQ_URL and RABBITMQ_MGMT_URL are exported below, with dev
# defaults if you haven't set them. These could move to an .env.test file
# loaded with `node --env-file=.env.test --test ...` (Node 20.6+), which would
# replace the exports.
#
# Readiness: `docker compose up --wait` waits for the rabbitmq healthcheck in
# docker-compose.yml, so the broker accepts connections before tests start.

set -euo pipefail
cd "$(dirname "$0")/../.."                  # repo root, where docker-compose.yml lives

docker compose up -d --wait rabbitmq

export RABBITMQ_URL="${RABBITMQ_URL:-amqp://ecocollect:change_me@localhost:5672}"
export RABBITMQ_MGMT_URL="${RABBITMQ_MGMT_URL:-http://ecocollect:change_me@localhost:15672}"

cd backend
node --test --test-concurrency=1 test/integration/*.test.js
