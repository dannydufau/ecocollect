-- FALLBACK DEMO: runs against the app's public schema (Oct 28 tables), not ecocollect608.
-- =========================================
-- scheduled_cleanup.sql: CLEANUP / EXPIRY TRANSACTION (real version)
-- Run by the backend's expiration scheduler every few minutes; not part of setup or testing.
-- Changes data: expires overdue Open requests, writes status changes, cleanup records
-- and outbox events. If nothing is overdue, it changes nothing.
-- To see it work on test data, run cleanup_demo.sql instead.
-- =========================================
BEGIN;

-- Step 1: lock the overdue Open requests so nothing else changes them during these steps.
SELECT request_id
FROM pickup_request
WHERE status = 'Open' AND expires_at <= now()
FOR UPDATE;

-- Step 2: record the status change ('Expired') for each one.
-- Every request already has an 'Open' change (change_no 1), so MAX + 1 is the next number.
INSERT INTO status_change (request_id, change_no, status)
SELECT p.request_id,
       (SELECT MAX(s.change_no) FROM status_change s WHERE s.request_id = p.request_id) + 1,
       'Expired'
FROM pickup_request p
WHERE p.status = 'Open' AND p.expires_at <= now();

-- Step 3: create the cleanup record for each one.
INSERT INTO cleanup_record (request_id)
SELECT request_id
FROM pickup_request
WHERE status = 'Open' AND expires_at <= now();

-- Step 4: queue a RequestExpired event for each one (picked up by the Notification Worker).
INSERT INTO outbox (event_type, routing_key, aggregate_id, payload)
SELECT 'RequestExpired', 'request.expired', request_id,
       jsonb_build_object('requestId', request_id)
FROM pickup_request
WHERE status = 'Open' AND expires_at <= now();

-- Step 5: finally, mark them Expired. This comes last because steps 2–4 find the
-- requests by status = 'Open'.
UPDATE pickup_request
SET status = 'Expired'
WHERE status = 'Open' AND expires_at <= now();

COMMIT;
