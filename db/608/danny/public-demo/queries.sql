-- FALLBACK DEMO: runs against the app's public schema (Oct 28 tables), not ecocollect608.
-- =========================================
-- PUSH_SUBSCRIPTION
-- =========================================
-- All devices for one account: what the Notification Worker uses to send a push.
-- Expected with the seed: 2 rows (Vera's phone and laptop).
SELECT endpoint, p256dh, auth
FROM push_subscription
WHERE account_uid = 'demo-volunteer-1';

-- =========================================
-- CLEANUP_RECORD
-- =========================================
-- Cleanup records with their derived values (status and expiry come from pickup_request).
SELECT c.request_id, c.cleaned_up_at, p.status, p.expires_at
FROM cleanup_record c
JOIN pickup_request p USING (request_id);
