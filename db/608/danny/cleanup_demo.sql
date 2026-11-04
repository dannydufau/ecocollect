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

-- Step 1: lock overdue requests whose latest status is still 'Open'.
SELECT p.request_id
FROM pickup_request p
WHERE p.created_at <= now() - INTERVAL '30 days'
  AND (SELECT s.status FROM status_change s
       WHERE s.request_id = p.request_id
       ORDER BY s.changed_at DESC LIMIT 1) = 'Open'
FOR UPDATE;

-- Step 2: create the cleanup record for each one.
INSERT INTO cleanup_record (request_id)
SELECT p.request_id
FROM pickup_request p
WHERE p.created_at <= now() - INTERVAL '30 days'
  AND (SELECT s.status FROM status_change s
       WHERE s.request_id = p.request_id
       ORDER BY s.changed_at DESC LIMIT 1) = 'Open';

-- Step 3: queue a RequestExpired event for each one.
INSERT INTO outbox (event_id, event_type, event_version, routing_key, aggregate_id, payload)
SELECT e.event_id, 'RequestExpired', 1, 'request.expired', e.request_id,
       jsonb_build_object('eventId', e.event_id, 'type', 'RequestExpired', 'version', 1,
                          'occurredAt', now(), 'data', jsonb_build_object('requestId', e.request_id))
FROM (SELECT gen_random_uuid() AS event_id, p.request_id
      FROM pickup_request p
      WHERE p.created_at <= now() - INTERVAL '30 days'
        AND (SELECT s.status FROM status_change s
             WHERE s.request_id = p.request_id
             ORDER BY s.changed_at DESC LIMIT 1) = 'Open') e;

-- Step 4: record 'Expired' as the newest status change.
INSERT INTO status_change (request_id, changed_at, status, reason)
SELECT p.request_id, now(), 'Expired', 'Open for 30 days'
FROM pickup_request p
WHERE p.created_at <= now() - INTERVAL '30 days'
  AND (SELECT s.status FROM status_change s
       WHERE s.request_id = p.request_id
       ORDER BY s.changed_at DESC LIMIT 1) = 'Open';

-- Show the result: a cleanup record, latest status 'Expired', and a queued event.
SELECT c.request_id, c.cleaned_up_at,
       (SELECT s.status FROM status_change s
        WHERE s.request_id = c.request_id
        ORDER BY s.changed_at DESC LIMIT 1) AS status
FROM cleanup_record c;

SELECT event_type, routing_key, aggregate_id FROM outbox WHERE event_type = 'RequestExpired';

ROLLBACK;
