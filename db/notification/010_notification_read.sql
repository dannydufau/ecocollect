-- Notification Service procedures (schema "notifications"): marking notifications read.
-- The course tables they change are in db/init/040_notification_tables.sql.
-- A request notification stores its recipient (request_notification.account_id). An award
-- notification doesn't: the recipient is found through the award (physical model):
--   volunteer award: award -> assignment -> the volunteer's terms acceptance -> account
--   resident award:  award -> assignment -> window -> request -> the request's terms acceptance -> account
-- Safe to rerun: each procedure is dropped and created again.
-- Loaded by backend/scripts/notification/load-db.sh.

-- mark_all_read: marks every one of an account's notifications read (N5).
DROP PROCEDURE IF EXISTS notifications.mark_all_read(VARCHAR);    -- Postgres names a procedure by its parameter types

CREATE PROCEDURE notifications.mark_all_read(IN p_account_id VARCHAR(50))
LANGUAGE plpgsql    -- the body is Postgres's procedural language (BEGIN ... END)
AS $$               -- start of the quoted body; replaces Lecture 12's DELIMITER //
BEGIN
    -- Mark the account's request notifications read.
    UPDATE notifications.notification n
    SET is_read = TRUE
    FROM notifications.request_notification rn
    WHERE n.notification_id = rn.notification_id
      AND rn.account_id = p_account_id
      AND NOT n.is_read;

    -- Mark the account's award notifications read: volunteer awards for their assignments,
    -- resident awards for their requests.
    UPDATE notifications.notification n
    SET is_read = TRUE
    FROM notifications.award_notification an
    JOIN rewards.ecopoints_award ea ON ea.ecopoints_award_id = an.ecopoints_award_id
    JOIN requests.assignment a ON a.assignment_id = ea.assignment_id
    JOIN requests.pickup_window w ON w.pickup_window_id = a.pickup_window_id
    JOIN requests.pickup_request r ON r.pickup_request_id = w.pickup_request_id
    JOIN users.terms_acceptance vta ON vta.terms_acceptance_id = a.terms_acceptance_id
    JOIN users.terms_acceptance rta ON rta.terms_acceptance_id = r.terms_acceptance_id
    LEFT JOIN rewards.volunteer_award va ON va.ecopoints_award_id = an.ecopoints_award_id
    LEFT JOIN rewards.resident_award ra ON ra.ecopoints_award_id = an.ecopoints_award_id
    WHERE n.notification_id = an.notification_id
      AND ((va.ecopoints_award_id IS NOT NULL AND vta.account_id = p_account_id)
        OR (ra.ecopoints_award_id IS NOT NULL AND rta.account_id = p_account_id))
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
DECLARE
    v_is_their_request_notification BOOLEAN;
    v_is_their_award_notification   BOOLEAN;
BEGIN
    -- Is it one of the account's request notifications?
    SELECT COUNT(*) > 0 INTO v_is_their_request_notification
    FROM notifications.request_notification
    WHERE account_id = p_account_id
      AND notification_id = p_notification_id;

    -- Is it one of the account's award notifications? (volunteer or resident award, as above)
    SELECT COUNT(*) > 0 INTO v_is_their_award_notification
    FROM notifications.award_notification an
    JOIN rewards.ecopoints_award ea ON ea.ecopoints_award_id = an.ecopoints_award_id
    JOIN requests.assignment a ON a.assignment_id = ea.assignment_id
    JOIN requests.pickup_window w ON w.pickup_window_id = a.pickup_window_id
    JOIN requests.pickup_request r ON r.pickup_request_id = w.pickup_request_id
    JOIN users.terms_acceptance vta ON vta.terms_acceptance_id = a.terms_acceptance_id
    JOIN users.terms_acceptance rta ON rta.terms_acceptance_id = r.terms_acceptance_id
    LEFT JOIN rewards.volunteer_award va ON va.ecopoints_award_id = an.ecopoints_award_id
    LEFT JOIN rewards.resident_award ra ON ra.ecopoints_award_id = an.ecopoints_award_id
    WHERE an.notification_id = p_notification_id
      AND ((va.ecopoints_award_id IS NOT NULL AND vta.account_id = p_account_id)
        OR (ra.ecopoints_award_id IS NOT NULL AND rta.account_id = p_account_id));

    p_found := v_is_their_request_notification OR v_is_their_award_notification;

    -- Mark it read, only when it is theirs.
    IF p_found THEN
        UPDATE notifications.notification
        SET is_read = TRUE
        WHERE notification_id = p_notification_id;
    END IF;
END;
$$;
