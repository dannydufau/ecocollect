-- Notification Service procedures (schema "notifications"): deleting notifications.
-- The course tables they change are in db/init/040_notification_tables.sql.
-- Safe to rerun: each procedure is dropped and created again.
-- Loaded by backend/scripts/notification/load-db.sh.

-- delete_expired_notifications: deletes every expired notification (E14, daily cleanup).
-- Only request notifications expire (award notifications never do), so only they are deleted.
-- Then it deletes the request events nothing needs any more: an event is kept while a notification
-- still points at it (X1 reads its transition_id), and each request's newest event is always kept
-- (its request_seq tells a late event apart, rule X3). An older event redelivered after its row is
-- gone is still seen as late: its notifications are saved expired and deleted on the next run.
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
