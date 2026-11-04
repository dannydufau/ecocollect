-- FALLBACK DEMO: runs against the app's public schema (Oct 28 tables), not ecocollect608.
-- =========================================
-- cleanup_demo.sql: demonstrates scheduled_cleanup.sql on one test request.
-- Creates an overdue Open request, runs the cleanup steps, shows the result,
-- then ROLLBACKs so nothing is kept. Safe to run any time.
-- =========================================
BEGIN;

-- Demo data: one request created 31 days ago, still Open (past its 30-day expiry).
INSERT INTO pickup_request (request_id, resident_uid, category_id, quantity,
                            pickup_street, pickup_postal_code, safety_acknowledged, created_at)
VALUES ('10000000-0000-4000-8000-0000000000aa', 'demo-resident-1', 'monitors', 1,
        '101 8 Ave SW', 'T2P1J9', true, now() - INTERVAL '31 days');
INSERT INTO status_change (request_id, change_no, status, changed_at)
VALUES ('10000000-0000-4000-8000-0000000000aa', 1, 'Open', now() - INTERVAL '31 days');

-- Steps 1–5: the same as scheduled_cleanup.sql.
SELECT request_id
FROM pickup_request
WHERE status = 'Open' AND expires_at <= now()
FOR UPDATE;

INSERT INTO status_change (request_id, change_no, status)
SELECT p.request_id,
       (SELECT MAX(s.change_no) FROM status_change s WHERE s.request_id = p.request_id) + 1,
       'Expired'
FROM pickup_request p
WHERE p.status = 'Open' AND p.expires_at <= now();

INSERT INTO cleanup_record (request_id)
SELECT request_id
FROM pickup_request
WHERE status = 'Open' AND expires_at <= now();

INSERT INTO outbox (event_type, routing_key, aggregate_id, payload)
SELECT 'RequestExpired', 'request.expired', request_id,
       jsonb_build_object('requestId', request_id)
FROM pickup_request
WHERE status = 'Open' AND expires_at <= now();

UPDATE pickup_request
SET status = 'Expired'
WHERE status = 'Open' AND expires_at <= now();

-- Show the result: the demo request is Expired and has a cleanup record.
SELECT c.request_id, c.cleaned_up_at, p.status, p.expires_at
FROM cleanup_record c
JOIN pickup_request p USING (request_id);

ROLLBACK;   -- undo everything