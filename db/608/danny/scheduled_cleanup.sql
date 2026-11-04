-- =========================================
-- scheduled_cleanup.sql: CLEANUP / EXPIRY TRANSACTION (real version)
-- Run by the backend's expiration scheduler every few minutes; not part of setup or testing.
-- Final-ER design: status and expiry are derived, not stored.
--   overdue  = created_at + 30 days has passed
--   Open     = the request's latest status_change is 'Open'
--   expiring = adding an 'Expired' status_change (no UPDATE)
-- Assumes status_change(request_id, changed_at, status, reason): confirm with Saad.
-- =========================================
SET search_path TO ecocollect608;
BEGIN;

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

-- Step 3: queue a RequestExpired event for each one (same envelope as RequestCreated).
-- The inner SELECT makes one event id per request, used in both event_id and the payload.
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

-- Step 4: last, record 'Expired' as the newest status change. After this the requests
-- are no longer "latest = Open", which is why it comes after steps 2–3.
INSERT INTO status_change (request_id, changed_at, status, reason)
SELECT p.request_id, now(), 'Expired', 'Open for 30 days'
FROM pickup_request p
WHERE p.created_at <= now() - INTERVAL '30 days'
  AND (SELECT s.status FROM status_change s
       WHERE s.request_id = p.request_id
       ORDER BY s.changed_at DESC LIMIT 1) = 'Open';

COMMIT;