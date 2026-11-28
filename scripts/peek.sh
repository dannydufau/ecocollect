#!/usr/bin/env bash
# Read-only snapshot of one pickup request across the services' tables.
# Usage: bash scripts/peek.sh [requestId]    (no id: the newest request)
#        bash scripts/peek.sh --accounts     (accounts, roles and postal codes)
# Runs psql in the Compose postgres container; set PEEK_DB_URL to use a local psql instead.
set -euo pipefail

id="${1:-}"

if [ -n "${PEEK_DB_URL:-}" ]; then
  run_psql() { psql "$PEEK_DB_URL" "$@"; }
else
  run_psql() { docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"; }
fi

if [ "$id" = "--accounts" ]; then
  run_psql -X -q -v ON_ERROR_STOP=1 -P pager=off -P null='-' <<'SQL'
\echo '== Accounts (a Volunteer is notified only for requests in a saved code)'
SELECT a.public_name, a.account_id,
       r.account_id IS NOT NULL AS resident,
       v.account_id IS NOT NULL AS volunteer,
       r.postal_code AS home_postal,
       (SELECT string_agg(p.postal_code, ', ' ORDER BY p.postal_code)
        FROM users.volunteer_preferred_postal_code p
        WHERE p.account_id = a.account_id) AS saved_codes
FROM users.account a
LEFT JOIN users.resident r ON r.account_id = a.account_id
LEFT JOIN users.volunteer v ON v.account_id = a.account_id
ORDER BY a.created_at;
SQL
  exit
fi

run_psql -X -q -v ON_ERROR_STOP=1 -v id="$id" -P pager=off -P null='-' <<'SQL'
-- An empty id means the newest request.
SELECT COALESCE(NULLIF(:'id', ''),
                (SELECT pickup_request_id::text FROM requests.pickup_request
                 ORDER BY created_at DESC LIMIT 1)) AS id \gset
\if :{?id}
\else
  \echo 'No requests yet.'
  \quit
\endif

\echo
\echo '== Request' :id
SELECT r.request_seq AS seq,
       (SELECT s.status FROM requests.status_change s
        WHERE s.pickup_request_id = r.pickup_request_id
        ORDER BY s.changed_at DESC LIMIT 1) AS status,
       c.name AS category, r.quantity AS qty, r.estimated_weight_kg AS kg,
       r.pickup_postal_code AS postal, t.account_id AS resident,
       to_char(r.created_at, 'HH24:MI:SS') AS created
FROM requests.pickup_request r
JOIN requests.item_category c ON c.category_id = r.category_id
JOIN users.terms_acceptance t ON t.terms_acceptance_id = r.terms_acceptance_id
WHERE r.pickup_request_id = :'id';

\echo '== Assignments'
SELECT t.account_id AS volunteer,
       to_char(a.accepted_at, 'HH24:MI:SS') AS accepted,
       to_char(a.collected_at, 'HH24:MI:SS') AS collected,
       to_char(a.ended_at, 'HH24:MI:SS') AS ended, a.end_reason
FROM requests.assignment a
JOIN requests.pickup_window w ON w.pickup_window_id = a.pickup_window_id
JOIN users.terms_acceptance t ON t.terms_acceptance_id = a.terms_acceptance_id
WHERE w.pickup_request_id = :'id'
ORDER BY a.accepted_at;

\echo '== Request Service outbox (published_at empty = not yet sent to RabbitMQ)'
SELECT request_seq AS seq, event_type,
       to_char(enqueued_at, 'HH24:MI:SS.MS') AS enqueued,
       to_char(published_at, 'HH24:MI:SS.MS') AS published_at
FROM requests.outbox
WHERE pickup_request_id = :'id'
ORDER BY request_seq, enqueued_at;

-- Across all requests: what the relay still has to send.
SELECT 'Unsent events in the Request Service outbox: ' || count(*)
       || COALESCE(' (oldest waiting since ' || to_char(min(enqueued_at), 'HH24:MI:SS') || ')', '')
       AS backlog
FROM requests.outbox
WHERE published_at IS NULL \gset
\echo :backlog
\echo

\echo '== Notifications (Notification Service)'
SELECT rn.request_seq AS seq, n.type, rn.account_id AS recipient,
       to_char(n.created_at, 'HH24:MI:SS') AS created,
       to_char(n.pushed_at, 'HH24:MI:SS') AS pushed,
       n.is_read AS read, n.is_expired AS expired
FROM notifications.request_notification rn
JOIN notifications.notification n ON n.notification_id = rn.notification_id
WHERE rn.pickup_request_id = :'id'
ORDER BY n.created_at, n.type;

\echo '== EcoPoints awards (Reward Service)'
SELECT CASE WHEN ra.ecopoints_award_id IS NOT NULL THEN 'resident' ELSE 'volunteer' END AS earned_as,
       e.points, e.formula
FROM rewards.ecopoints_award e
JOIN requests.assignment a ON a.assignment_id = e.assignment_id
JOIN requests.pickup_window w ON w.pickup_window_id = a.pickup_window_id
LEFT JOIN rewards.resident_award ra ON ra.ecopoints_award_id = e.ecopoints_award_id
WHERE w.pickup_request_id = :'id'
ORDER BY earned_as DESC;

\echo '== Reward Service outbox'
SELECT event_type,
       to_char(created_at, 'HH24:MI:SS.MS') AS created,
       to_char(published_at, 'HH24:MI:SS.MS') AS published_at
FROM rewards.outbox
WHERE payload ->> 'requestId' = :'id'
ORDER BY created_at, insertion_order;
SQL
