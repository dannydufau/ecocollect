-- Notification Service procedures (schema "notifications"): marking notifications read.
-- The course tables they change are in db/init/040_notification_tables.sql.
-- Safe to rerun: each procedure is dropped and created again.
-- Loaded by backend/scripts/notification/load-db.sh.

-- mark_all_read: marks every one of an account's notifications read (N5).
DROP PROCEDURE IF EXISTS notifications.mark_all_read(VARCHAR);    -- Postgres names a procedure by its parameter types

CREATE PROCEDURE notifications.mark_all_read(IN p_account_id VARCHAR(50))
LANGUAGE plpgsql    -- the body is Postgres's procedural language (BEGIN ... END)
AS $$               -- start of the quoted body; replaces Lecture 12's DELIMITER //
BEGIN
    UPDATE notifications.notification n
    SET is_read = TRUE
    FROM notifications.request_notification rn
    WHERE n.notification_id = rn.notification_id
      AND rn.account_id = p_account_id
      AND NOT n.is_read;
END;
$$;                 -- end of the body

-- mark_read: marks one notification read, only if it belongs to the account (N4).
-- p_found tells the caller which happened: false means not theirs or not there (404).
DROP PROCEDURE IF EXISTS notifications.mark_read(VARCHAR, UUID, BOOLEAN);

CREATE PROCEDURE notifications.mark_read(
    IN  p_account_id      VARCHAR(50),
    IN  p_notification_id UUID,
    OUT p_found           BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Does this notification belong to this account? (SELECT ... INTO the OUT parameter)
    SELECT COUNT(*) > 0 INTO p_found
    FROM notifications.request_notification
    WHERE account_id = p_account_id
      AND notification_id = p_notification_id;

    -- Mark it read (changes nothing when it isn't theirs).
    UPDATE notifications.notification n
    SET is_read = TRUE
    FROM notifications.request_notification rn
    WHERE n.notification_id = rn.notification_id
      AND rn.account_id = p_account_id
      AND n.notification_id = p_notification_id;
END;
$$;
