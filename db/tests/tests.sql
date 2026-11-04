-- ENSF 608 - EcoCollect - Step 5: Constraint tests
-- Run only after Step 4 and the team's parent tables are installed.
-- Replace the two parent ID pairs below with valid, unused test records.
-- All test changes are rolled back at the end.

BEGIN;

CREATE TEMP TABLE step5_fixture (
    test_no INTEGER PRIMARY KEY,
    account_id TEXT NOT NULL,
    acceptance_id TEXT NOT NULL
);

-- Each acceptance ID must belong to the resident on the same row.
INSERT INTO step5_fixture VALUES
    (1, 'REPLACE_RESIDENT_ACCOUNT_1', 'REPLACE_TERMS_ACCEPTANCE_1'),
    (2, 'REPLACE_RESIDENT_ACCOUNT_2', 'REPLACE_TERMS_ACCEPTANCE_2');

DO $$
BEGIN
    IF to_regclass('krunali_issue71.item_category') IS NULL
       OR to_regclass('krunali_issue71.pickup_request') IS NULL
       OR to_regclass('krunali_issue71.pickup_window') IS NULL THEN
        RAISE EXCEPTION 'Run the Step 4 creation script before Step 5';
    END IF;
    IF to_regclass('public.resident') IS NULL
       OR to_regclass('public.terms_acceptance') IS NULL THEN
        RAISE EXCEPTION 'The team parent tables are still missing';
    END IF;
    IF EXISTS (
        SELECT 1 FROM step5_fixture
        WHERE account_id LIKE 'REPLACE_%' OR acceptance_id LIKE 'REPLACE_%'
    ) THEN
        RAISE EXCEPTION 'Replace both parent ID pairs before running these tests';
    END IF;
END $$;

CREATE TEMP TABLE step5_results (
    test_id TEXT,
    result TEXT,
    details TEXT
);

-- Run an invalid statement and check that PostgreSQL rejects it.
CREATE FUNCTION pg_temp.expect_error(
    p_test_id TEXT, p_sql TEXT, p_sqlstate TEXT, p_constraint TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE
    actual_state TEXT;
    actual_constraint TEXT;
BEGIN
    BEGIN
        EXECUTE p_sql;
        RAISE EXCEPTION 'Unexpected success' USING ERRCODE = 'P9001';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS
            actual_state = RETURNED_SQLSTATE,
            actual_constraint = CONSTRAINT_NAME;
    END;

    IF actual_state = p_sqlstate
       AND (p_constraint IS NULL OR actual_constraint = p_constraint) THEN
        INSERT INTO step5_results VALUES (p_test_id, 'PASS', actual_state);
        RAISE NOTICE 'PASS % (SQLSTATE %)', p_test_id, actual_state;
    ELSE
        INSERT INTO step5_results VALUES
            (p_test_id, 'FAIL', format('Expected %s / %s, got %s / %s',
             p_sqlstate, p_constraint, actual_state, actual_constraint));
        RAISE WARNING 'FAIL %: expected %, got %', p_test_id, p_sqlstate, actual_state;
    END IF;
END;
$fn$;

-- Build a request insert without assuming the team's acceptance ID type.
CREATE FUNCTION pg_temp.request_insert(
    p_request UUID, p_account TEXT, p_category TEXT,
    p_acceptance TEXT, p_quantity INTEGER,
    p_street TEXT DEFAULT '123 Test Street',
    p_postal TEXT DEFAULT 'T2P1J9'
) RETURNS TEXT LANGUAGE sql AS $fn$
    SELECT format(
        'INSERT INTO krunali_issue71.pickup_request
         (request_id, account_id, category_id, acceptance_id,
          quantity, pickup_street, pickup_postal_code)
         VALUES (%L, %L, %L, %L, %L, %L, %L)',
         p_request, p_account, p_category, p_acceptance,
         p_quantity, p_street, p_postal
    );
$fn$;

-- A. ITEM_CATEGORY
DO $tests$
DECLARE
    v_category TEXT := 'step5_test_category_71';
BEGIN
    INSERT INTO krunali_issue71.item_category
        (category_id, name, waste_type, standard_weight_kg)
    VALUES (v_category, 'Step 5 Test Category 71', 'Laptop', 2.50);
    INSERT INTO step5_results VALUES ('C01 valid category', 'PASS', 'Insert accepted');

    PERFORM pg_temp.expect_error('C02 duplicate category ID',
        $sql$INSERT INTO krunali_issue71.item_category VALUES
        ('step5_test_category_71', 'Another Category 71', 'E-waste', 1.00)$sql$,
        '23505', 'item_category_pkey');

    PERFORM pg_temp.expect_error('C03 duplicate category name',
        $sql$INSERT INTO krunali_issue71.item_category VALUES
        ('step5_other_category_71', 'Step 5 Test Category 71', 'E-waste', 1.00)$sql$,
        '23505', 'item_category_name_key');

    PERFORM pg_temp.expect_error('C04 missing name',
        $sql$INSERT INTO krunali_issue71.item_category VALUES
        ('step5_null_name_71', NULL, 'E-waste', 1.00)$sql$, '23502');

    PERFORM pg_temp.expect_error('C05 zero standard weight',
        $sql$INSERT INTO krunali_issue71.item_category VALUES
        ('step5_zero_weight_71', 'Zero Weight 71', 'E-waste', 0.00)$sql$, '23514');
END;
$tests$;

-- B. PICKUP_REQUEST
DO $tests$
DECLARE
    a1 TEXT; t1 TEXT; a2 TEXT; t2 TEXT;
    r1 UUID := gen_random_uuid();
    r2 UUID := gen_random_uuid();
    weight_value NUMERIC;
    expiry_value TIMESTAMPTZ;
BEGIN
    SELECT account_id, acceptance_id INTO a1, t1
    FROM step5_fixture WHERE test_no = 1;
    SELECT account_id, acceptance_id INTO a2, t2
    FROM step5_fixture WHERE test_no = 2;

    PERFORM pg_temp.expect_error('R01 missing resident FK',
        pg_temp.request_insert(gen_random_uuid(), 'missing_resident_step5_71',
            'step5_test_category_71', t1, 2), '23503');

    PERFORM pg_temp.expect_error('R02 missing category FK',
        pg_temp.request_insert(gen_random_uuid(), a1,
            'missing_category_step5_71', t1, 2), 'P0001');

    PERFORM pg_temp.expect_error('R03 zero quantity',
        pg_temp.request_insert(gen_random_uuid(), a1,
            'step5_test_category_71', t1, 0), '23514');

    PERFORM pg_temp.expect_error('R04 missing pickup street',
        pg_temp.request_insert(gen_random_uuid(), a1,
            'step5_test_category_71', t1, 2, NULL), '23502');

    PERFORM pg_temp.expect_error('R05 invalid Calgary postal code',
        pg_temp.request_insert(gen_random_uuid(), a1,
            'step5_test_category_71', t1, 2, '123 Test Street', 'X1X1X1'), '23514');

    PERFORM pg_temp.expect_error('R06 missing terms acceptance',
        pg_temp.request_insert(gen_random_uuid(), a1,
            'step5_test_category_71', NULL, 2), '23502');

    EXECUTE pg_temp.request_insert(r1, a1, 'step5_test_category_71', t1, 2);

    -- Use the second unused acceptance ID to isolate the primary-key test.
    PERFORM pg_temp.expect_error('R09 duplicate request ID',
        pg_temp.request_insert(r1, a2, 'step5_test_category_71', t2, 1),
        '23505', 'pickup_request_pkey');

    EXECUTE pg_temp.request_insert(r2, a2, 'step5_test_category_71', t2, 1);
    INSERT INTO step5_results VALUES ('R07 valid requests', 'PASS', 'Two inserts accepted');

    SELECT estimated_weight_kg INTO weight_value
    FROM krunali_issue71.pickup_request WHERE request_id = r1;
    INSERT INTO step5_results VALUES
        ('R08 calculated weight',
         CASE WHEN weight_value = 5.00 THEN 'PASS' ELSE 'FAIL' END,
         format('Expected 5.00; actual %s', weight_value));

    PERFORM pg_temp.expect_error('R10 reused acceptance ID',
        pg_temp.request_insert(gen_random_uuid(), a1,
            'step5_test_category_71', t1, 1),
        '23505', 'pickup_request_acceptance_id_key');

    PERFORM pg_temp.expect_error('R11 change pickup address',
        format('UPDATE krunali_issue71.pickup_request
                SET pickup_street = %L WHERE request_id = %L',
                'Changed Street', r1), 'P0001');

    PERFORM pg_temp.expect_error('R12 change weight directly',
        format('UPDATE krunali_issue71.pickup_request
                SET estimated_weight_kg = 999 WHERE request_id = %L', r1),
        'P0001');

    SELECT expires_at INTO expiry_value
    FROM krunali_issue71.pickup_request_expiry WHERE request_id = r1;
    INSERT INTO step5_results
    SELECT 'R13 30-day expiry view',
           CASE WHEN expiry_value = created_at + INTERVAL '30 days'
                THEN 'PASS' ELSE 'FAIL' END,
           'Expiry derived from created_at'
    FROM krunali_issue71.pickup_request WHERE request_id = r1;

    UPDATE krunali_issue71.pickup_request
    SET quantity = 3 WHERE request_id = r1;
    SELECT estimated_weight_kg INTO weight_value
    FROM krunali_issue71.pickup_request WHERE request_id = r1;
    INSERT INTO step5_results VALUES
        ('R14 weight recalculated on quantity change',
         CASE WHEN weight_value = 7.50 THEN 'PASS' ELSE 'FAIL' END,
         format('Expected 7.50; actual %s', weight_value));

    UPDATE krunali_issue71.item_category
    SET standard_weight_kg = 3.00
    WHERE category_id = 'step5_test_category_71';
    SELECT estimated_weight_kg INTO weight_value
    FROM krunali_issue71.pickup_request WHERE request_id = r1;
    INSERT INTO step5_results VALUES
        ('R15 saved weight unaffected by category edit',
         CASE WHEN weight_value = 7.50 THEN 'PASS' ELSE 'FAIL' END,
         format('Expected saved 7.50; actual %s', weight_value));

    CREATE TEMP TABLE step5_request_ids (test_no INTEGER, request_id UUID);
    INSERT INTO step5_request_ids VALUES (1, r1), (2, r2);
END;
$tests$;

-- C. PICKUP_WINDOW
DO $tests$
DECLARE
    r1 UUID; r2 UUID;
    w1 UUID := gen_random_uuid();
    w2 UUID := gen_random_uuid();
    test_date DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::date + 2;
    active_count INTEGER;
    got_state TEXT;
BEGIN
    SELECT request_id INTO r1 FROM step5_request_ids WHERE test_no = 1;
    SELECT request_id INTO r2 FROM step5_request_ids WHERE test_no = 2;

    INSERT INTO krunali_issue71.pickup_window
        (window_id, request_id, pickup_date, slot)
    VALUES (w1, r1, test_date, 10),
           (w2, r2, test_date, 11);
    INSERT INTO step5_results VALUES ('W01 valid pickup windows', 'PASS', 'Two inserts accepted');

    PERFORM pg_temp.expect_error('W02 duplicate window ID',
        format('INSERT INTO krunali_issue71.pickup_window
                (window_id, request_id, pickup_date, slot)
                VALUES (%L, %L, %L, 12)', w1, r1, test_date + 1),
        '23505', 'pickup_window_pkey');

    PERFORM pg_temp.expect_error('W03 missing request FK',
        format('INSERT INTO krunali_issue71.pickup_window
                (request_id, pickup_date, slot)
                VALUES (%L, %L, 10)',
                'ffffffff-ffff-4fff-8fff-ffffffffffff', test_date + 1), 'P0001');

    PERFORM pg_temp.expect_error('W04 slot below 0',
        format('INSERT INTO krunali_issue71.pickup_window
                (request_id, pickup_date, slot) VALUES (%L, %L, -1)',
                r1, test_date + 1), '23514');

    PERFORM pg_temp.expect_error('W05 slot above 23',
        format('INSERT INTO krunali_issue71.pickup_window
                (request_id, pickup_date, slot) VALUES (%L, %L, 24)',
                r1, test_date + 1), '23514');

    PERFORM pg_temp.expect_error('W13 missing pickup date',
        format('INSERT INTO krunali_issue71.pickup_window
                (request_id, pickup_date, slot) VALUES (%L, NULL, 10)',
                r1), '23502');

    PERFORM pg_temp.expect_error('W14 missing slot',
        format('INSERT INTO krunali_issue71.pickup_window
                (request_id, pickup_date, slot) VALUES (%L, %L, NULL)',
                r1, test_date + 1), '23502');

    PERFORM pg_temp.expect_error('W06 duplicate active date',
        format('INSERT INTO krunali_issue71.pickup_window
                (request_id, pickup_date, slot) VALUES (%L, %L, 14)',
                r1, test_date), '23505', 'pickup_window_active_date_uq');

    PERFORM pg_temp.expect_error('W07 past pickup date',
        format('INSERT INTO krunali_issue71.pickup_window
                (request_id, pickup_date, slot) VALUES (%L, %L, 10)',
                r1, test_date - 3), 'P0001');

    PERFORM pg_temp.expect_error('W08 after 30-day expiry',
        format('INSERT INTO krunali_issue71.pickup_window
                (request_id, pickup_date, slot) VALUES (%L, %L, 10)',
                r1, test_date + 31), 'P0001');

    INSERT INTO krunali_issue71.pickup_window (request_id, pickup_date, slot)
    VALUES (r1, test_date + 1, 11), (r1, test_date + 2, 12);

    PERFORM pg_temp.expect_error('W09 fourth active window',
        format('INSERT INTO krunali_issue71.pickup_window
                (request_id, pickup_date, slot) VALUES (%L, %L, 13)',
                r1, test_date + 3), 'P0001');

    PERFORM pg_temp.expect_error('W10 delete window history',
        format('DELETE FROM krunali_issue71.pickup_window WHERE window_id = %L', w1),
        'P0001');

    -- Force the deferred minimum-window check without saving the update.
    BEGIN
        UPDATE krunali_issue71.pickup_window
        SET is_active = FALSE WHERE request_id = r1;
        SET CONSTRAINTS ALL IMMEDIATE;
        RAISE EXCEPTION 'Unexpected success' USING ERRCODE = 'P9001';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS got_state = RETURNED_SQLSTATE;
    END;
    INSERT INTO step5_results VALUES
        ('W11 at least one active window',
         CASE WHEN got_state = 'P0001' THEN 'PASS' ELSE 'FAIL' END,
         format('Expected P0001; actual %s', got_state));

    SELECT COUNT(*) INTO active_count
    FROM krunali_issue71.pickup_window
    WHERE request_id = r1 AND is_active;
    INSERT INTO step5_results VALUES
        ('W12 three active windows accepted',
         CASE WHEN active_count = 3 THEN 'PASS' ELSE 'FAIL' END,
         format('Active windows: %s', active_count));
END;
$tests$;

-- The integration tester should check every result before marking Step 5 complete.
SELECT test_id, result, details FROM step5_results ORDER BY test_id;

-- Do not keep any test rows.
ROLLBACK;
