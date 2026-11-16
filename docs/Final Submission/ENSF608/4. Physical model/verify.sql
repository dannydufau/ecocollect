BEGIN;
SET search_path TO ecocollect608, public;
SET TIME ZONE 'UTC';
CALL check_business_rules();

-- Each rejected write is rolled back inside its test block.
DO $$
DECLARE
    test RECORD;
BEGIN
    FOR test IN SELECT * FROM (VALUES
        ('Invalid postal-code letters', 'UPDATE resident SET postal_code=''T2I1O9'' WHERE account_id=''resident1''', '23514'),
        ('Award on an unfinished assignment', 'UPDATE ecopoints_award SET assignment_id=''00000005-0000-4000-8000-000000000002'' WHERE ecopoints_award_id=''00000008-0000-4000-8000-000000000001''; CALL check_business_rules()', '23514'),
        ('Duplicate account key', 'INSERT INTO volunteer VALUES (''volunteer1'')', '23505'),
        ('Unknown account', 'INSERT INTO volunteer VALUES (''unknown-person'')', '23503'),
        ('Required name', 'UPDATE account SET first_name=NULL WHERE account_id=''resident1''', '23502'),
        ('Empty public name', 'UPDATE account SET public_name='' '' WHERE account_id=''resident1''', '23514'),
        ('Underage account', 'UPDATE account SET date_of_birth=CURRENT_DATE WHERE account_id=''resident1''', '23514'),
        ('Zero quantity', 'UPDATE pickup_request SET quantity=0 WHERE pickup_request_id=''00000003-0000-4000-8000-000000000001''', '23514'),
        ('Negative estimate', 'UPDATE pickup_request SET estimated_weight_kg=-1 WHERE pickup_request_id=''00000003-0000-4000-8000-000000000001''', '23514'),
        ('Invalid hour', 'UPDATE pickup_window SET start_hour=24 WHERE pickup_window_id=''00000004-0000-4000-8000-000000000001''', '23514'),
        ('Invalid status', 'UPDATE status_change SET status=''Waiting'' WHERE pickup_request_id=''00000003-0000-4000-8000-000000000001''', '23514'),
        ('Incomplete assignment ending', 'UPDATE assignment SET ended_at=CURRENT_TIMESTAMP WHERE assignment_id=''00000005-0000-4000-8000-000000000002''', '23514'),
        ('Collection before acceptance', 'UPDATE assignment SET collected_at=accepted_at-INTERVAL ''1 day'' WHERE assignment_id=''00000005-0000-4000-8000-000000000003''', '23514'),
        ('Invalid update reason', 'UPDATE request_update_event SET reason=''other'' WHERE pickup_request_id=''00000003-0000-4000-8000-000000000001''', '23514'),
        ('Invalid changed field', 'UPDATE request_changed_field SET field_name=''address'' WHERE pickup_request_id=''00000003-0000-4000-8000-000000000001''', '23514'),
        ('Duplicate award notification', 'INSERT INTO award_notification VALUES (''0000000a-0000-4000-8000-0000000003e7'',''00000008-0000-4000-8000-000000000001'')', '23505'),
        ('Duplicate delivery evidence', 'UPDATE delivery SET file_id=''evidence-4'' WHERE delivery_id=''00000007-0000-4000-8000-000000000009''', '23505'),
        ('Self rescheduling', 'UPDATE pickup_request SET rescheduled_from_request_id=pickup_request_id WHERE pickup_request_id=''00000003-0000-4000-8000-000000000001''', '23514'),
        ('Fourth preferred code', 'CALL add_preferred_code(''volunteer1'',''T3K2L7'')', '23514'),
        ('Delivery photo used for an item', 'CALL attach_item_photo(''00000003-0000-4000-8000-000000000001'',''evidence-4'')', '23514'),
        ('Accept an unavailable request', 'CALL accept_request(''00000005-0000-4000-8000-000000000384'',''00000004-0000-4000-8000-000000000002'',''00000002-0000-4000-8000-0000000000ca'')', '23514'),
        ('Missing award role', 'DELETE FROM volunteer_award WHERE ecopoints_award_id=''00000008-0000-4000-8000-000000000001''; CALL check_business_rules()', '23514'),
        ('Both award roles', 'INSERT INTO resident_award VALUES (''00000008-0000-4000-8000-000000000001''); CALL check_business_rules()', '23514'),
        ('Both notification sources', 'INSERT INTO request_notification VALUES (''0000000a-0000-4000-8000-000000000065'',''volunteer1'',''00000003-0000-4000-8000-000000000004'',4); CALL check_business_rules()', '23514'),
        ('Missing notification source', 'DELETE FROM request_notification WHERE notification_id=''0000000a-0000-4000-8000-000000000001''; CALL check_business_rules()', '23514'),
        ('Changed field on reopened event', 'INSERT INTO request_changed_field VALUES (''00000003-0000-4000-8000-00000000000a'',3,''windows''); CALL check_business_rules()', '23514'),
        ('Duplicate active window', 'INSERT INTO pickup_window SELECT ''00000004-0000-4000-8000-000000000384'',pickup_request_id,pickup_date,start_hour,TRUE FROM pickup_window WHERE pickup_window_id=''00000004-0000-4000-8000-000000000001''; CALL check_business_rules()', '23514'),
        ('Owner acceptance has wrong type', 'UPDATE pickup_request SET terms_acceptance_id=''00000002-0000-4000-8000-000000000001'' WHERE pickup_request_id=''00000003-0000-4000-8000-000000000001''; CALL check_business_rules()', '23514'),
        ('Event sequence gap', 'DELETE FROM request_event WHERE pickup_request_id=''00000003-0000-4000-8000-000000000002'' AND request_seq=2; CALL check_business_rules()', '23514')
    ) AS cases(name, statement, expected_code)
    LOOP
        BEGIN
            EXECUTE test.statement;
            RAISE EXCEPTION 'Invalid write was accepted: %', test.name;
        EXCEPTION WHEN OTHERS THEN
            IF SQLSTATE <> test.expected_code THEN
                RAISE EXCEPTION 'Test % failed: expected %, got % (%)', test.name, test.expected_code, SQLSTATE, SQLERRM;
            END IF;
        END;
        RAISE NOTICE 'Passed: %', test.name;
    END LOOP;
END;
$$;

-- These valid changes also leave the original seed data intact.
CALL add_preferred_code('volunteer3','T2P1J9');
CALL attach_item_photo('00000003-0000-4000-8000-000000000001','item-photo-1');
CALL check_business_rules();

SELECT s.status, COUNT(*) AS request_count
FROM status_change s
WHERE NOT EXISTS (
    SELECT 1 FROM status_change later
    WHERE later.pickup_request_id=s.pickup_request_id AND later.changed_at>s.changed_at
)
GROUP BY s.status ORDER BY s.status;

SELECT 'resident' AS earned_role, COUNT(*) AS awards, SUM(a.points) AS points
FROM ecopoints_award a JOIN resident_award r ON r.ecopoints_award_id=a.ecopoints_award_id
UNION ALL SELECT 'volunteer', COUNT(*), SUM(a.points)
FROM ecopoints_award a JOIN volunteer_award v ON v.ecopoints_award_id=a.ecopoints_award_id;

SELECT 'request' AS notification_source, COUNT(*) AS notifications FROM request_notification
UNION ALL SELECT 'award', COUNT(*) FROM award_notification;

ROLLBACK;
