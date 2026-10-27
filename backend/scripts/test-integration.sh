#!/usr/bin/env bash
# Run the integration tests against the Compose RabbitMQ.
#
#   bash backend/scripts/test-integration.sh      (from anywhere)
#   npm run test:integration                      (from backend/, if package.json points here)
#
# Starts the broker if it isn't running, waits for it, sets the connection
# URLs, then runs test/integration/*.test.js.
#
# Env vars: RABBITMQ_URL and RABBITMQ_MGMT_URL are exported below, with dev
# defaults if you haven't set them. Node 20.6+ can load these from a file
# instead (node --env-file=.env.test --test ...), which would replace the
# exports below. We don't rely on that yet because some of us run Node 18
# locally; once everyone is on Node 22 (what the containers use), switch to
# an .env.test file and drop the exports.
#
# Readiness: `docker compose up --wait` only waits for the broker to be
# *ready* if the rabbitmq service has a healthcheck in docker-compose.yml.
# Without one it waits for "running", and the broker may still be booting
# for a few seconds, so the first test can fail to connect.

set -euo pipefail
cd "$(dirname "$0")/../.."                  # repo root, where docker-compose.yml lives

docker compose up -d --wait rabbitmq

export RABBITMQ_URL="${RABBITMQ_URL:-amqp://ecocollect:change_me@localhost:5672}"
export RABBITMQ_MGMT_URL="${RABBITMQ_MGMT_URL:-http://ecocollect:change_me@localhost:15672}"

cd backend
node --test --test-concurrency=1 test/integration/*.test.js