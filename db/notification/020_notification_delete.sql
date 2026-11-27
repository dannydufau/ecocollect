-- Notification Service procedures (schema "notifications"): deleting notifications.
-- The course tables they change are in db/init/040_notification_tables.sql.
-- Safe to rerun: each procedure is dropped and created again.
-- Loaded by backend/scripts/notification/load-db.sh.

-- delete_expired_notifications: deletes every expired notification (E14, daily cleanup).
-- Only request notifications expire (award notifications never do), so only they are deleted.
-- Then it deletes the request events nothing needs any more: an event is kept while a notification
-- still points at it (X1 reads its transition_id), and each request's newest event is always kept
-- (its request_seq tells a late event apart, rule X3). Replays are tracked in processed_events.
-- p_deleted tells the caller how many notifications were deleted.
DROP PROCEDURE IF EXISTS notifications.delete_expired_notifications(INTEGER);

CREATE PROCEDURE notifications.delete_expired_notifications(OUT p_deleted INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete the request_notification rows of expired notifications (they reference the notification).
    DELETE FROM notifications.request_notification rn
    USING notifications.notification n
    WHERE n.notification_id = rn.notification_id
      AND n.is_expired;

    -- Delete the expired notifications themselves.
    DELETE FROM notifications.notification
    WHERE is_expired;

    -- Count the notifications just deleted.
    GET DIAGNOSTICS p_deleted = ROW_COUNT;

    -- The three deletes below remove the same events: each has a newer event for its request and
    -- no notification pointing at it. Children first (foreign keys), request_event last.

    -- Delete the changed fields of those events.
    DELETE FROM notifications.request_changed_field cf
    WHERE EXISTS (SELECT 1 FROM notifications.request_event newer
                  WHERE newer.pickup_request_id = cf.pickup_request_id
                    AND newer.request_seq > cf.request_seq)
      AND NOT EXISTS (SELECT 1 FROM notifications.request_notification rn
                      WHERE rn.pickup_request_id = cf.pickup_request_id
                        AND rn.request_seq = cf.request_seq);

    -- Delete the update reasons of those events.
    DELETE FROM notifications.request_update_event ue
    WHERE EXISTS (SELECT 1 FROM notifications.request_event newer
                  WHERE newer.pickup_request_id = ue.pickup_request_id
                    AND newer.request_seq > ue.request_seq)
      AND NOT EXISTS (SELECT 1 FROM notifications.request_notification rn
                      WHERE rn.pickup_request_id = ue.pickup_request_id
                        AND rn.request_seq = ue.request_seq);

    -- Delete those events themselves.
    DELETE FROM notifications.request_event ev
    WHERE EXISTS (SELECT 1 FROM notifications.request_event newer
                  WHERE newer.pickup_request_id = ev.pickup_request_id
                    AND newer.request_seq > ev.request_seq)
      AND NOT EXISTS (SELECT 1 FROM notifications.request_notification rn
                      WHERE rn.pickup_request_id = ev.pickup_request_id
                        AND rn.request_seq = ev.request_seq);
END;
$$;

-- delete_account_data: deletes everything this service keeps for a deactivated account (E16, FR04):
-- its notifications (request and award) and its push subscriptions.
-- An award notification's recipient isn't stored, so it is found through the award, as in 010:
--   volunteer award: award -> assignment -> the volunteer's terms acceptance -> account
--   resident award:  award -> assignment -> window -> request -> the request's terms acceptance -> account
-- The request events its notifications pointed at are left to the daily cleanup (E14).
-- p_deleted_notifications and p_deleted_subscriptions tell the caller how many were deleted.
DROP PROCEDURE IF EXISTS notifications.delete_account_data(VARCHAR, INTEGER, INTEGER);

CREATE PROCEDURE notifications.delete_account_data(
    IN  p_account_id              VARCHAR(50),
    OUT p_deleted_notifications   INTEGER,
    OUT p_deleted_subscriptions   INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete the account's request_notification rows.
    DELETE FROM notifications.request_notification
    WHERE account_id = p_account_id;

    -- Delete the award_notification rows of the account's volunteer awards.
    DELETE FROM notifications.award_notification
    WHERE ecopoints_award_id IN (
        SELECT va.ecopoints_award_id
        FROM rewards.volunteer_award va
        JOIN rewards.ecopoints_award ea ON ea.ecopoints_award_id = va.ecopoints_award_id
        JOIN requests.assignment a ON a.assignment_id = ea.assignment_id
        JOIN users.terms_acceptance vta ON vta.terms_acceptance_id = a.terms_acceptance_id
        WHERE vta.account_id = p_account_id);

    -- Delete the award_notification rows of the account's resident awards.
    DELETE FROM notifications.award_notification
    WHERE ecopoints_award_id IN (
        SELECT ra.ecopoints_award_id
        FROM rewards.resident_award ra
        JOIN rewards.ecopoints_award ea ON ea.ecopoints_award_id = ra.ecopoints_award_id
        JOIN requests.assignment a ON a.assignment_id = ea.assignment_id
        JOIN requests.pickup_window w ON w.pickup_window_id = a.pickup_window_id
        JOIN requests.pickup_request r ON r.pickup_request_id = w.pickup_request_id
        JOIN users.terms_acceptance rta ON rta.terms_acceptance_id = r.terms_acceptance_id
        WHERE rta.account_id = p_account_id);

    -- Delete the notifications left with neither a request nor an award row: the ones unlinked above.
    -- (Every other notification has one: it is inserted with its row in one transaction.)
    DELETE FROM notifications.notification n
    WHERE NOT EXISTS (SELECT 1 FROM notifications.request_notification rn
                      WHERE rn.notification_id = n.notification_id)
      AND NOT EXISTS (SELECT 1 FROM notifications.award_notification an
                      WHERE an.notification_id = n.notification_id);

    -- Count the notifications just deleted.
    GET DIAGNOSTICS p_deleted_notifications = ROW_COUNT;

    -- Delete the account's push subscriptions.
    DELETE FROM notifications.push_subscription
    WHERE account_id = p_account_id;

    -- Count the subscriptions just deleted.
    GET DIAGNOSTICS p_deleted_subscriptions = ROW_COUNT;
END;
$$;
