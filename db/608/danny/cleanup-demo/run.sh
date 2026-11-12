#!/usr/bin/env bash
# Step-through cleanup demo. Press Enter to run each step.
set -e
cd "$(git rev-parse --show-toplevel)"     # run from the repo root, wherever you start
DIR=db/608/danny/cleanup-demo
PSQL="docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U ecocollect -d ecocollect"
SHOW=(-c 'SELECT * FROM cleanup_demo.pickup_request'
      -c 'SELECT * FROM cleanup_demo.status_change ORDER BY request_id, changed_at'
      -c 'SELECT * FROM cleanup_demo.cleanup_record')

step() { echo; echo "=== $1"; read -rp "Press Enter to run..."; }

step "1. Start Postgres and RabbitMQ"
docker compose up -d --wait postgres rabbitmq

step "2. Create the tables"
$PSQL < $DIR/tables.sql

step "3. Seed"
$PSQL < $DIR/seed.sql

step "4. Show the tables (before)"
$PSQL "${SHOW[@]}"

step "5. Run the cleanup"
$PSQL < $DIR/cleanup.sql

step "6. Show the tables (after)"
$PSQL "${SHOW[@]}"

echo; echo "Done."