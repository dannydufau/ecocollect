\set ON_ERROR_STOP on

-- Reuse the existing positive and negative verification cases before running
-- assertions on the untouched seed. Both scripts roll back their test writes.
\ir verify.sql

BEGIN;
SET LOCAL search_path TO ecocollect608, public;
SET LOCAL TIME ZONE 'UTC';

DO $$
DECLARE
    schema_oid OID := 'ecocollect608'::regnamespace;
    actual JSONB;
    affected INTEGER;
    delivered INTEGER;
    weight NUMERIC;
BEGIN
    IF (SELECT COUNT(*) FROM pg_class WHERE relnamespace=schema_oid AND relkind='r') <> 25
       OR (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='ecocollect608') <> 100
       OR (SELECT COUNT(*) FROM pg_constraint WHERE connamespace=schema_oid AND contype='p') <> 25 THEN
        RAISE EXCEPTION 'DB01: expected 25 tables, 100 columns and 25 primary keys';
    END IF;
    RAISE NOTICE 'PASS DB01: 25 tables, 100 columns and 25 primary keys';

    IF (SELECT COUNT(*) FROM pg_constraint WHERE connamespace=schema_oid AND contype='f' AND convalidated) <> 30
       OR EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace=schema_oid AND contype='f' AND NOT convalidated) THEN
        RAISE EXCEPTION 'DB02: expected 30 validated foreign keys';
    END IF;
    RAISE NOTICE 'PASS DB02: 30 foreign keys exist and are validated';

    IF NOT EXISTS (SELECT 1 FROM pickup_request WHERE category_id='phones') THEN
        RAISE EXCEPTION 'DB03: seed must contain a request referencing phones';
    END IF;
    BEGIN
        DELETE FROM item_category WHERE category_id='phones';
        RAISE EXCEPTION 'DB03: deletion of a referenced category succeeded';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE 'PASS DB03: referenced category deletion rejected with SQLSTATE 23503';
    END;

    SELECT jsonb_object_agg(status, requests) INTO actual
    FROM (
        SELECT latest.status, COUNT(*) AS requests
        FROM (
            SELECT DISTINCT ON (pickup_request_id) pickup_request_id, status
            FROM status_change
            ORDER BY pickup_request_id, changed_at DESC
        ) latest
        GROUP BY latest.status
    ) totals;
    IF actual IS DISTINCT FROM '{"Open":4,"Assigned":1,"Collected":1,"Delivered":2,"Cancelled":1,"Expired":1,"Missed":1}'::jsonb THEN
        RAISE EXCEPTION 'DB04: unexpected status totals: %', actual;
    END IF;
    RAISE NOTICE 'PASS DB04: latest-status counts match all seven expected states';

    SELECT COUNT(*), SUM(r.estimated_weight_kg) INTO delivered, weight
    FROM delivery d
    JOIN assignment a ON a.assignment_id=d.assignment_id
    JOIN pickup_window w ON w.pickup_window_id=a.pickup_window_id
    JOIN pickup_request r ON r.pickup_request_id=w.pickup_request_id;
    IF delivered <> 2 OR weight IS DISTINCT FROM 5.60::numeric THEN
        RAISE EXCEPTION 'DB05: expected 2 deliveries and 5.60 kg estimated, got % and %', delivered, weight;
    END IF;
    RAISE NOTICE 'PASS DB05: delivery join returns 2 deliveries and 5.60 kg estimated';

    SELECT jsonb_object_agg(earned_role, jsonb_build_array(awards, points)) INTO actual
    FROM (
        SELECT 'resident' AS earned_role, COUNT(*) AS awards, SUM(a.points) AS points
        FROM ecopoints_award a JOIN resident_award r USING (ecopoints_award_id)
        UNION ALL
        SELECT 'volunteer', COUNT(*), SUM(a.points)
        FROM ecopoints_award a JOIN volunteer_award v USING (ecopoints_award_id)
    ) totals;
    IF actual IS DISTINCT FROM '{"resident":[2,18.70],"volunteer":[3,60.40]}'::jsonb THEN
        RAISE EXCEPTION 'DB06: unexpected award totals: %', actual;
    END IF;
    RAISE NOTICE 'PASS DB06: resident and volunteer award counts and point totals match';

    IF (SELECT COUNT(*) FROM request_notification) <> 8
       OR (SELECT COUNT(*) FROM award_notification) <> 5
       OR (SELECT COUNT(*) FROM notification) <> 13
       OR EXISTS (SELECT 1 FROM request_notification JOIN award_notification USING (notification_id)) THEN
        RAISE EXCEPTION 'DB07: expected 8 request and 5 award notifications with distinct sources';
    END IF;
    RAISE NOTICE 'PASS DB07: 8 request notifications and 5 award notifications with distinct sources';

    INSERT INTO facility_accepts (facility_id, category_id)
    VALUES ('00000006-0000-4000-8000-000000000003','tablets');
    DELETE FROM facility_accepts
    WHERE facility_id='00000006-0000-4000-8000-000000000001' AND category_id='tablets';
    GET DIAGNOSTICS affected = ROW_COUNT;
    CALL check_business_rules();
    IF affected <> 1 OR NOT EXISTS (
        SELECT 1 FROM facility_accepts
        WHERE facility_id='00000006-0000-4000-8000-000000000003' AND category_id='tablets'
    ) THEN
        RAISE EXCEPTION 'DB08: expected one deleted row and the replacement eligibility row';
    END IF;
    RAISE NOTICE 'PASS DB08: one eligibility row deleted and replacement accepted';

    UPDATE account SET public_name='Database test name' WHERE account_id='resident1';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 OR (SELECT public_name FROM account WHERE account_id='resident1') IS DISTINCT FROM 'Database test name' THEN
        RAISE EXCEPTION 'DB09: expected one account update and readable name';
    END IF;
    RAISE NOTICE 'PASS DB09: valid update changed exactly one account and can be read back';
END;
$$;

ROLLBACK;

DO $$
BEGIN
    IF (SELECT public_name FROM ecocollect608.account WHERE account_id='resident1') IS NULL
       OR EXISTS (SELECT 1 FROM ecocollect608.account WHERE account_id='resident1' AND public_name='Database test name')
       OR NOT EXISTS (
           SELECT 1 FROM ecocollect608.facility_accepts
           WHERE facility_id='00000006-0000-4000-8000-000000000001' AND category_id='tablets'
       )
       OR EXISTS (
           SELECT 1 FROM ecocollect608.facility_accepts
           WHERE facility_id='00000006-0000-4000-8000-000000000003' AND category_id='tablets'
       ) THEN
        RAISE EXCEPTION 'DB10: seed changes survived rollback';
    END IF;
    RAISE NOTICE 'PASS DB10: rollback restored the seed used by the write tests';
END;
$$;

BEGIN;
SET LOCAL search_path TO ecocollect608, public;

DO $$
DECLARE
    new_request CONSTANT UUID := '00000003-0000-4000-8000-000000000099';
    delivered_request CONSTANT UUID := '00000003-0000-4000-8000-000000000009';
    test_notification CONSTANT UUID := '0000000a-0000-4000-8000-000000000099';
    cleanup_ids CONSTANT UUID[] := ARRAY[
        '0000000a-0000-4000-8000-000000000068',
        '0000000a-0000-4000-8000-000000000069',
        '0000000a-0000-4000-8000-000000000099'
    ]::UUID[];
    other_notifications UUID[];
    history_before JSONB;
    failure_message TEXT;
BEGIN
    INSERT INTO pickup_request (pickup_request_id, category_id, terms_acceptance_id, quantity,
        estimated_weight_kg, created_at, request_seq, pickup_street, pickup_postal_code)
    SELECT new_request, 'phones', terms_acceptance_id, 1, 0.20, created_at, 1, pickup_street, pickup_postal_code
    FROM pickup_request WHERE pickup_request_id='00000003-0000-4000-8000-00000000000b';

    INSERT INTO pickup_window (pickup_window_id, pickup_request_id, pickup_date, start_hour, is_active)
    VALUES ('00000004-0000-4000-8000-000000000099', new_request,
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::DATE + 3, 12, TRUE);

    INSERT INTO status_change (pickup_request_id, changed_at, status)
    SELECT pickup_request_id, created_at, 'Open' FROM pickup_request WHERE pickup_request_id=new_request;

    CALL check_business_rules();
    IF (SELECT status FROM status_change WHERE pickup_request_id=new_request) IS DISTINCT FROM 'Open'
       OR EXISTS (SELECT 1 FROM request_event WHERE pickup_request_id=new_request) THEN
        RAISE EXCEPTION 'DB11: expected an Open request with zero consumed events';
    END IF;
    RAISE NOTICE 'PASS DB11: Open request accepted with zero consumed events';

    -- A failed subtransaction rolls the proposed deactivation back.
    BEGIN
        UPDATE account SET deactivated_at=CURRENT_TIMESTAMP WHERE account_id='resident1';
        CALL check_business_rules();
        RAISE EXCEPTION 'DB12: deactivation succeeded despite active work';
    EXCEPTION WHEN check_violation THEN
        GET STACKED DIAGNOSTICS failure_message = MESSAGE_TEXT;
        IF failure_message <> 'Deactivated accounts cannot retain active work' THEN
            RAISE;
        END IF;
    END;
    IF (SELECT deactivated_at FROM account WHERE account_id='resident1') IS NOT NULL THEN
        RAISE EXCEPTION 'DB12: rejected deactivation was not rolled back';
    END IF;
    RAISE NOTICE 'PASS DB12: active work blocks deactivation (23514)';

    INSERT INTO push_subscription (endpoint, account_id, p256dh, auth, updated_at)
    VALUES ('https://push.example.test/db13', 'both1', 'sample-key', 'sample-token', CURRENT_TIMESTAMP);
    INSERT INTO notification (notification_id, type, created_at, is_read, is_expired)
    VALUES (test_notification, 'REQUEST_DELIVERED_RESIDENT', CURRENT_TIMESTAMP, FALSE, FALSE);
    INSERT INTO request_notification (notification_id, account_id, pickup_request_id, request_seq)
    VALUES (test_notification, 'both1', delivered_request, 4);

    SELECT array_agg(notification_id ORDER BY notification_id) INTO other_notifications
    FROM notification WHERE notification_id <> ALL(cleanup_ids);

    SELECT jsonb_build_array((SELECT count(*) FROM pickup_request), (SELECT count(*) FROM assignment),
        (SELECT count(*) FROM ecopoints_award), (SELECT count(*) FROM terms_acceptance))
    INTO history_before;

    UPDATE account SET deactivated_at=CURRENT_TIMESTAMP WHERE account_id='both1';
    CALL check_business_rules();

    -- Exercise the SQL cleanup step on source rows and their parents.
    -- The course database has no running E16 consumer.
    DELETE FROM request_notification WHERE notification_id=ANY(cleanup_ids);
    DELETE FROM award_notification WHERE notification_id=ANY(cleanup_ids);
    DELETE FROM notification WHERE notification_id=ANY(cleanup_ids);
    DELETE FROM push_subscription WHERE account_id='both1';
    CALL check_business_rules();

    IF (SELECT deactivated_at FROM account WHERE account_id='both1') IS NULL
       OR EXISTS (SELECT 1 FROM notification WHERE notification_id=ANY(cleanup_ids))
       OR EXISTS (SELECT 1 FROM request_notification WHERE notification_id=ANY(cleanup_ids))
       OR EXISTS (SELECT 1 FROM award_notification WHERE notification_id=ANY(cleanup_ids))
       OR EXISTS (SELECT 1 FROM push_subscription WHERE account_id='both1')
       OR (SELECT array_agg(notification_id ORDER BY notification_id) FROM notification) IS DISTINCT FROM other_notifications
       OR (SELECT count(*) FROM push_subscription WHERE account_id <> 'both1') <> 2
       OR jsonb_build_array((SELECT count(*) FROM pickup_request), (SELECT count(*) FROM assignment),
           (SELECT count(*) FROM ecopoints_award), (SELECT count(*) FROM terms_acceptance)) IS DISTINCT FROM history_before THEN
        RAISE EXCEPTION 'DB13: cleanup failed or changed other accounts or history';
    END IF;
    RAISE NOTICE 'PASS DB13: deactivation cleanup removed target rows and preserved other accounts and history';
END;
$$;

ROLLBACK;
