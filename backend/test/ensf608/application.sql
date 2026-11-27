\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    model_tables CONSTANT text[] := ARRAY[
        'account', 'resident', 'volunteer', 'volunteer_preferred_postal_code',
        'terms_document', 'terms_acceptance', 'item_category', 'photo', 'pickup_request',
        'pickup_window', 'status_change', 'assignment', 'recycling_facility', 'facility_accepts',
        'delivery', 'ecopoints_award', 'resident_award', 'volunteer_award', 'push_subscription',
        'notification', 'request_event', 'request_update_event', 'request_changed_field',
        'request_notification', 'award_notification'
    ];
    award_id CONSTANT uuid := '00000008-0000-4000-8000-000000000002';
    notice_id CONSTANT uuid := 'f6080000-0000-4000-8000-000000000002';
    unknown_id CONSTANT uuid := 'f6080000-0000-4000-8000-000000000003';
    delivered bigint;
    weight numeric;
    affected integer;
    failure_constraint text;
BEGIN
    IF (SELECT count(*) FROM information_schema.tables
        WHERE table_schema IN ('users','requests','rewards','notifications')
          AND table_type='BASE TABLE' AND table_name=ANY(model_tables)) <> 25
       OR (SELECT count(*) FROM information_schema.columns
        WHERE table_schema IN ('users','requests','rewards','notifications')
          AND table_name=ANY(model_tables)) <> 100
       OR (SELECT count(*) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
           JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname IN ('users','requests','rewards','notifications')
             AND c.relname=ANY(model_tables) AND k.contype='p') <> 25
       OR (SELECT count(*) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
           JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname IN ('users','requests','rewards','notifications')
             AND c.relname=ANY(model_tables) AND k.contype='f' AND k.convalidated) <> 30 THEN
        RAISE EXCEPTION 'APP01: unexpected table, column or key count';
    END IF;
    RAISE NOTICE 'PASS APP01: 25 course tables, 100 columns, 25 primary keys and 30 validated foreign keys';

    SELECT count(*), sum(r.estimated_weight_kg) INTO delivered, weight
    FROM requests.delivery d
    JOIN requests.assignment a USING (assignment_id)
    JOIN requests.pickup_window w USING (pickup_window_id)
    JOIN requests.pickup_request r USING (pickup_request_id);
    IF delivered <> 2 OR weight IS DISTINCT FROM 5.60 THEN
        RAISE EXCEPTION 'APP02: expected two deliveries and 5.60 kg, got % and %', delivered, weight;
    END IF;
    RAISE NOTICE 'PASS APP02: delivery join returned two deliveries and 5.60 kg estimated';

    IF (SELECT count(DISTINCT facility_id) FROM requests.facility_accepts WHERE category_id='phones') <> 2
       OR (SELECT count(DISTINCT category_id) FROM requests.facility_accepts
           WHERE facility_id='00000006-0000-4000-8000-000000000001') <> 8 THEN
        RAISE EXCEPTION 'APP03: seeded facility coverage differs from expected';
    END IF;
    RAISE NOTICE 'PASS APP03: phones are accepted at two facilities and the first facility accepts eight categories';

    -- Replace the seeded notification inside this transaction to exercise the unique award link.
    DELETE FROM notifications.award_notification WHERE ecopoints_award_id=award_id;
    DELETE FROM notifications.notification WHERE notification_id='0000000a-0000-4000-8000-000000000066';
    INSERT INTO notifications.notification (notification_id, type, created_at, is_read, is_expired)
    VALUES (notice_id, 'ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT', CURRENT_TIMESTAMP, FALSE, FALSE);
    INSERT INTO notifications.award_notification (notification_id, ecopoints_award_id)
    VALUES (notice_id, award_id);
    IF (SELECT e.points FROM notifications.award_notification n
        JOIN rewards.ecopoints_award e USING (ecopoints_award_id)
        WHERE n.notification_id=notice_id) IS DISTINCT FROM 13 THEN
        RAISE EXCEPTION 'APP04: linked award could not be read back';
    END IF;
    RAISE NOTICE 'PASS APP04: new notification linked to an existing award across schemas';

    BEGIN
        UPDATE notifications.award_notification SET ecopoints_award_id=unknown_id WHERE notification_id=notice_id;
        RAISE EXCEPTION 'APP05: an unknown award was accepted';
    EXCEPTION WHEN foreign_key_violation THEN
        GET STACKED DIAGNOSTICS failure_constraint = CONSTRAINT_NAME;
        IF failure_constraint <> 'award_notification_fk2' THEN RAISE; END IF;
    END;
    RAISE NOTICE 'PASS APP05: an unknown award was rejected by award_notification_fk2 (23503)';

    BEGIN
        INSERT INTO requests.facility_accepts (facility_id, category_id)
        SELECT facility_id, category_id FROM requests.facility_accepts WHERE category_id='phones' LIMIT 1;
        RAISE EXCEPTION 'APP06: duplicate facility/category pair accepted';
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS failure_constraint = CONSTRAINT_NAME;
        IF failure_constraint <> 'facility_accepts_pk' THEN RAISE; END IF;
    END;
    RAISE NOTICE 'PASS APP06: duplicate facility/category pair rejected (23505)';

    BEGIN
        UPDATE requests.pickup_request SET quantity=0
        WHERE pickup_request_id='00000003-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'APP07: zero quantity accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
    BEGIN
        UPDATE users.account SET public_name=NULL WHERE account_id='resident1';
        RAISE EXCEPTION 'APP07: missing name accepted';
    EXCEPTION WHEN not_null_violation THEN
        NULL;
    END;
    RAISE NOTICE 'PASS APP07: zero quantity and missing public name rejected (23514, 23502)';

    UPDATE notifications.notification SET is_read=TRUE WHERE notification_id=notice_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 OR (SELECT is_read FROM notifications.notification WHERE notification_id=notice_id) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'APP08: read-state update did not persist';
    END IF;
    DELETE FROM notifications.award_notification WHERE notification_id=notice_id;
    DELETE FROM notifications.notification WHERE notification_id=notice_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 OR EXISTS (SELECT 1 FROM notifications.notification WHERE notification_id=notice_id)
       OR NOT EXISTS (SELECT 1 FROM rewards.ecopoints_award WHERE ecopoints_award_id=award_id) THEN
        RAISE EXCEPTION 'APP08: notification deletion did not preserve its award';
    END IF;
    RAISE NOTICE 'PASS APP08: read state changed, notification was removed, and award history remained';
END;
$$;

ROLLBACK;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM notifications.notification
        WHERE notification_id='f6080000-0000-4000-8000-000000000002'
    ) OR NOT EXISTS (
        SELECT 1 FROM notifications.award_notification
        WHERE notification_id='0000000a-0000-4000-8000-000000000066'
          AND ecopoints_award_id='00000008-0000-4000-8000-000000000002'
    ) THEN
        RAISE EXCEPTION 'APP09: rollback did not restore the seeded notification';
    END IF;
    RAISE NOTICE 'PASS APP09: rollback restored the original award notification';
END;
$$;
