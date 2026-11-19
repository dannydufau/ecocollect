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
        ('Facility without an accepted category', 'DELETE FROM facility_accepts WHERE facility_id=''00000006-0000-4000-8000-000000000003''; CALL check_business_rules()', '23514'),
        ('Category without an accepting facility', 'DELETE FROM facility_accepts WHERE category_id=''tablets''; CALL check_business_rules()', '23514'),
        ('Lowercase resident postal code', 'UPDATE resident SET postal_code=''t2p1j9'' WHERE account_id=''resident1''', '23514'),
        ('Lowercase preferred postal code', 'UPDATE volunteer_preferred_postal_code SET postal_code=''t2p1j9'' WHERE account_id=''volunteer1'' AND postal_code=''T2P1J9''', '23514'),
        ('Spaces in pickup postal code', 'UPDATE pickup_request SET pickup_postal_code=''T2 P1J'' WHERE pickup_request_id=''00000003-0000-4000-8000-000000000001''', '23514'),
        ('Wrong facility postal-code prefix', 'UPDATE recycling_facility SET postal_code=''V2P1J9'' WHERE facility_id=''00000006-0000-4000-8000-000000000001''', '23514'),
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
        ('Changed field on reopened event', 'INSERT INTO request_changed_field VALUES (''00000003-0000-4000-8000-00000000000a'',4,''windows''); CALL check_business_rules()', '23514'),
        ('Duplicate active window', 'INSERT INTO pickup_window SELECT ''00000004-0000-4000-8000-000000000384'',pickup_request_id,pickup_date,start_hour,TRUE FROM pickup_window WHERE pickup_window_id=''00000004-0000-4000-8000-000000000001''; CALL check_business_rules()', '23514'),
        ('Owner acceptance has wrong type', 'UPDATE pickup_request SET terms_acceptance_id=''00000002-0000-4000-8000-000000000001'' WHERE pickup_request_id=''00000003-0000-4000-8000-000000000001''; CALL check_business_rules()', '23514'),
        ('Event beyond the published sequence', 'UPDATE pickup_request SET request_seq=4 WHERE pickup_request_id=''00000003-0000-4000-8000-000000000002''; CALL check_business_rules()', '23514'),
        ('Wrong award notification trigger', 'UPDATE notification SET type=''ECOPOINTS_AWARDED_ON_ASSIGNMENT_CANCELLATION_VOLUNTEER'' WHERE notification_id=''0000000a-0000-4000-8000-000000000065''; CALL check_business_rules()', '23514'),
        ('Update notification missing its details', 'DELETE FROM request_changed_field WHERE pickup_request_id=''00000003-0000-4000-8000-000000000001''; DELETE FROM request_update_event WHERE pickup_request_id=''00000003-0000-4000-8000-000000000001''; CALL check_business_rules()', '23514'),
        ('Acceptance with obsolete terms', 'INSERT INTO terms_acceptance VALUES (''00000002-0000-4000-8000-0000000003de'',''00000001-0000-4000-8000-000000000001'',''volunteer2'',CURRENT_TIMESTAMP,''AT_VOLUNTEER_ACCEPTANCE''); CALL accept_request(''00000005-0000-4000-8000-0000000003de'',''00000004-0000-4000-8000-000000000001'',''00000002-0000-4000-8000-0000000003de'')', '23514'),
        ('Assigned state without an assignment', 'INSERT INTO status_change VALUES (''00000003-0000-4000-8000-00000000000b'',CURRENT_TIMESTAMP,''Assigned'',NULL); CALL check_business_rules()', '23514'),
        ('Incorrect new request estimate', 'UPDATE pickup_request SET estimated_weight_kg=99 WHERE pickup_request_id=''00000003-0000-4000-8000-000000000008''; CALL check_new_request(''00000003-0000-4000-8000-000000000008'')', '23514'),
        ('Incorrect copied replacement item', 'UPDATE pickup_request SET quantity=2,estimated_weight_kg=12 WHERE pickup_request_id=''00000003-0000-4000-8000-000000000008''; CALL check_new_request(''00000003-0000-4000-8000-000000000008'')', '23514'),
        ('Birthday still tomorrow in Calgary', 'INSERT INTO account VALUES (''birthday_test'',''Alex'',''Test'',''Alex T.'',''2008-11-16'',''2026-11-16 01:00:00+00'',NULL)', '23514')
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
SAVEPOINT facility_category_test;
INSERT INTO facility_accepts (facility_id, category_id)
VALUES ('00000006-0000-4000-8000-000000000003','tablets');
DELETE FROM facility_accepts
WHERE facility_id='00000006-0000-4000-8000-000000000001' AND category_id='tablets';
CALL check_business_rules();
ROLLBACK TO SAVEPOINT facility_category_test;

SAVEPOINT postal_format_test;
UPDATE resident SET postal_code='T0A0A0' WHERE account_id='resident1';
UPDATE volunteer_preferred_postal_code SET postal_code='T9Z9Z9'
WHERE account_id='volunteer1' AND postal_code='T2P1J9';
UPDATE pickup_request SET pickup_postal_code='T0A0A0'
WHERE pickup_request_id='00000003-0000-4000-8000-000000000001';
UPDATE recycling_facility SET postal_code='T9Z9Z9' WHERE facility_id='00000006-0000-4000-8000-000000000001';
ROLLBACK TO SAVEPOINT postal_format_test;

CALL add_preferred_code('volunteer3','T2P1J9');
CALL attach_item_photo('00000003-0000-4000-8000-000000000001','item-photo-1');
CALL check_business_rules();

SAVEPOINT birthday_test;
INSERT INTO account VALUES ('birthday_test','Alex','Test','Alex T.',
    '2008-11-16','2026-11-16 07:00:00+00',NULL);
ROLLBACK TO SAVEPOINT birthday_test;

SAVEPOINT replacement_test;
UPDATE item_category SET standard_weight_kg=9 WHERE category_id='printers';
UPDATE pickup_request SET estimated_weight_kg=9
WHERE pickup_request_id='00000003-0000-4000-8000-000000000008';
CALL check_new_request('00000003-0000-4000-8000-000000000008');
UPDATE pickup_request SET quantity=2,estimated_weight_kg=18,notes='Use the side entrance.',
    file_id=NULL,request_seq=request_seq+1
WHERE pickup_request_id='00000003-0000-4000-8000-000000000008';
CALL check_business_rules();
ROLLBACK TO SAVEPOINT replacement_test;

SAVEPOINT delayed_events_test;
DELETE FROM request_event
WHERE pickup_request_id='00000003-0000-4000-8000-000000000002' AND request_seq=2;
UPDATE pickup_request SET request_seq=request_seq+1
WHERE pickup_request_id='00000003-0000-4000-8000-00000000000b';
CALL check_business_rules();
ROLLBACK TO SAVEPOINT delayed_events_test;

SAVEPOINT cancellation_test;
UPDATE terms_acceptance SET accepted_at=(
    SELECT ended_at-INTERVAL '1 hour' FROM assignment
    WHERE assignment_id='00000005-0000-4000-8000-000000000005'
) WHERE terms_acceptance_id='00000002-0000-4000-8000-0000000000cd';
UPDATE assignment SET accepted_at=(SELECT accepted_at FROM terms_acceptance
    WHERE terms_acceptance_id='00000002-0000-4000-8000-0000000000cd')
WHERE assignment_id='00000005-0000-4000-8000-000000000005';
UPDATE status_change SET changed_at=(SELECT accepted_at FROM assignment
    WHERE assignment_id='00000005-0000-4000-8000-000000000005')
WHERE pickup_request_id='00000003-0000-4000-8000-000000000005' AND status='Assigned';
CALL check_business_rules();
ROLLBACK TO SAVEPOINT cancellation_test;

SAVEPOINT acceptance_test;
INSERT INTO terms_acceptance VALUES (
    '00000002-0000-4000-8000-0000000003de',
    '00000001-0000-4000-8000-000000000002',
    'volunteer2',CURRENT_TIMESTAMP,'AT_VOLUNTEER_ACCEPTANCE'
);
CALL accept_request('00000005-0000-4000-8000-0000000003de',
    '00000004-0000-4000-8000-00000000000b','00000002-0000-4000-8000-0000000003de');
CALL check_business_rules();
ROLLBACK TO SAVEPOINT acceptance_test;

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
