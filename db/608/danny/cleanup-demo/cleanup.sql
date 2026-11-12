-- Cleanup: expire Open requests older than 30 days.
-- In the app, the backend's scheduler runs this; here you run it by hand.
-- Safe to rerun: the second run finds nothing, because 001 is no longer Open.
SET search_path TO cleanup_demo;
BEGIN;

-- Step 1: find pickup requests that are 30+ days old and whose newest status is Open,
-- and lock them (FOR UPDATE) until COMMIT so nothing else changes them mid-cleanup.
SELECT p.request_id
FROM pickup_request p
WHERE p.created_at <= now() - INTERVAL '30 days'  -- on or before Oct 6 (request 001)
  AND (SELECT s.status FROM status_change s
       WHERE s.request_id = p.request_id
       ORDER BY s.changed_at DESC LIMIT 1) = 'Open'
FOR UPDATE;

-- Step 2: insert a cleanup record for each request found in step 1
INSERT INTO cleanup_record (request_id)
SELECT p.request_id
FROM pickup_request p
WHERE p.created_at <= now() - INTERVAL '30 days'
  AND (SELECT s.status FROM status_change s
       WHERE s.request_id = p.request_id
       ORDER BY s.changed_at DESC LIMIT 1) = 'Open';

-- Step 3: expire them by adding an Expired status change.
INSERT INTO status_change (request_id, status)
SELECT p.request_id, 'Expired'
FROM pickup_request p
WHERE p.created_at <= now() - INTERVAL '30 days'
  AND (SELECT s.status FROM status_change s
       WHERE s.request_id = p.request_id
       ORDER BY s.changed_at DESC LIMIT 1) = 'Open';

COMMIT;