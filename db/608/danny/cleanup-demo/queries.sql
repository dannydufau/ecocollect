-- Queries for the cleanup demo. Run before and after cleanup.sql to compare.
SET search_path TO cleanup_demo;

-- 1. Show the tables.
SELECT * FROM pickup_request;
SELECT * FROM status_change ORDER BY request_id, changed_at;
SELECT * FROM cleanup_record;


-- 2. Requests due to expire: Open (newest status) and 30+ days old.
SELECT p.request_id,
       p.created_at + INTERVAL '30 days' AS expires_at
FROM pickup_request p
WHERE p.created_at <= now() - INTERVAL '30 days' -- oct 6
  AND (SELECT s.status
       FROM status_change s
       WHERE s.request_id = p.request_id
       ORDER BY s.changed_at DESC
       LIMIT 1) = 'Open';   -- newest open, there might be older records ;)

-- 3. Cleanup records, with derived Expires_At and Request_Status.
SELECT c.request_id,
       c.cleaned_up_at,
       p.created_at + INTERVAL '30 days' AS expires_at,
       (SELECT s.status
        FROM status_change s
        WHERE s.request_id = c.request_id
        ORDER BY s.changed_at DESC
        LIMIT 1) AS request_status
FROM cleanup_record c
JOIN pickup_request p ON p.request_id = c.request_id;
-- join creates c.request_id | c.cleaned_up_at | p.request_id | p.created_at

-- Expected output: 1 row (001, Expired).
