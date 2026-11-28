CREATE PROCEDURE ensf608_queries.mark_read(
    IN  p_account_id      VARCHAR(50),
    IN  p_notification_id UUID,
    OUT p_found           BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
    SELECT COUNT(*) > 0 INTO p_found
    FROM request_notification
    WHERE account_id = p_account_id
      AND notification_id = p_notification_id;

    UPDATE notification n
    SET is_read = TRUE
    FROM request_notification rn
    WHERE n.notification_id = rn.notification_id
      AND rn.account_id = p_account_id
      AND n.notification_id = p_notification_id;
END;
$$;

CALL ensf608_queries.mark_read('resident1', '0000000a-0000-4000-8000-000000000008', NULL);
CALL ensf608_queries.mark_read('resident1', '0000000a-0000-4000-8000-000000000002', NULL);
