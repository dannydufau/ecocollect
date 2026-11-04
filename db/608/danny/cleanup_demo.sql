-- =========================================
-- cleanup_demo.sql: demonstrates scheduled_cleanup.sql on one seeded request.
-- Backdates Krunali's request …005 by 31 days, runs the cleanup steps, shows the
-- result, then ROLLBACKs so nothing is kept. Safe to run any time.
-- Needs the request's latest status_change to be 'Open' in the seed.
-- =========================================
SET search_path TO ecocollect608;
BEGIN;

UPDATE pickup_request
SET created_at = now() - INTERVAL '31 days'
WHERE request_id = '10000000-0000-4000-8000-000000000005';

-- (paste steps 1–4 from scheduled_cleanup.sql here, without BEGIN/COMMIT)

-- Show the result: a cleanup record, latest status 'Expired', and a queued event.
SELECT c.request_id, c.cleaned_up_at,
       (SELECT s.status FROM status_change s
        WHERE s.request_id = c.request_id
        ORDER BY s.changed_at DESC LIMIT 1) AS status
FROM cleanup_record c;

SELECT event_type, routing_key, aggregate_id FROM outbox WHERE event_type = 'RequestExpired';

ROLLBACK;