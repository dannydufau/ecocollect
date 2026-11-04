SET search_path TO ecocollect608;

-- All devices for one account (Notification Worker). Expected: 2 rows.
SELECT endpoint, p256dh, auth
FROM push_subscription
WHERE account_id = 'volunteer1';

-- Cleanup records with derived status and expiry.
SELECT c.request_id, c.cleaned_up_at,
       (SELECT s.status FROM status_change s
        WHERE s.request_id = c.request_id
        ORDER BY s.changed_at DESC LIMIT 1)   AS status,
       p.created_at + INTERVAL '30 days'      AS expires_at
FROM cleanup_record c
JOIN pickup_request p USING (request_id);

-- Events waiting to be published by the relay.
SELECT event_type, aggregate_id, created_at
FROM outbox
WHERE published_at IS NULL
ORDER BY created_at;