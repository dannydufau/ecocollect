
-- Step 6: Sample Data
-- ENSF 608 - EcoCollect
-- Tables: item_category, pickup_request, pickup_window
--
-- Sample records for the three assigned tables.
-- Run after the team's parent tables and records exist.
--
-- IMPORTANT:
-- Confirm the account_id and acceptance_id mapping
-- with the team before executing this file.

BEGIN;

-- 6.1 ITEM_CATEGORY
-- Five sample item categories.

INSERT INTO krunali_issue71.item_category
    (category_id, name, waste_type, standard_weight_kg)
VALUES
    ('laptops', 'Laptops', 'E-waste', 2.50),
    ('batteries', 'Batteries', 'E-waste', 0.50),
    ('monitors', 'Monitors', 'E-waste', 4.00),
    ('phones', 'Phones', 'E-waste', 0.25),
    ('cables', 'Cables', 'E-waste', 0.10);


-- 6.2 PICKUP_REQUEST
-- Five sample pickup requests.
--
-- The account and acceptance mapping is proposed.
-- The team must confirm ownership before execution.
--
-- Estimated weight is calculated automatically
-- by the trigger defined in Step 4.
--
-- Request status is maintained separately
-- through the team's status_change table.

INSERT INTO krunali_issue71.pickup_request
    (
        request_id,
        account_id,
        category_id,
        acceptance_id,
        quantity,
        pickup_street,
        pickup_postal_code,
        notes,
        photo_url
    )
VALUES
    (
        '10000000-0000-4000-8000-000000000001',
        'resident1',
        'laptops',
        4000,
        2,
        '100 Example Street',
        'T2P1J9',
        'Two old laptops for recycling.',
        NULL
    ),
    (
        '10000000-0000-4000-8000-000000000002',
        'resident2',
        'batteries',
        4001,
        3,
        '200 Example Street',
        'T2A0A1',
        'Used household batteries.',
        NULL
    ),
    (
        '10000000-0000-4000-8000-000000000003',
        'resident3',
        'monitors',
        4002,
        1,
        '300 Example Street',
        'T3A0A1',
        'One computer monitor.',
        NULL
    ),
    (
        '10000000-0000-4000-8000-000000000004',
        'resident4',
        'phones',
        4003,
        2,
        '400 Example Street',
        'T2N1N4',
        'Two old mobile phones.',
        NULL
    ),
    (
        '10000000-0000-4000-8000-000000000005',
        'both1',
        'cables',
        4004,
        5,
        '500 Example Street',
        'T2E0A1',
        'Unused charging and computer cables.',
        NULL
    );


-- 6.3 PICKUP_WINDOW
-- Eight sample pickup windows.
--
-- Dates are relative to the current Calgary date.
-- All dates are in the future and within 30 days.
--
-- Each request has between one and three
-- active pickup windows.
--
-- Slot represents the starting hour (0 to 23).

INSERT INTO krunali_issue71.pickup_window
    (
        window_id,
        request_id,
        pickup_date,
        slot,
        is_active
    )
VALUES
    (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::date + 3,
        9,
        TRUE
    ),
    (
        '20000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000001',
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::date + 5,
        14,
        TRUE
    ),
    (
        '20000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000002',
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::date + 4,
        10,
        TRUE
    ),
    (
        '20000000-0000-4000-8000-000000000004',
        '10000000-0000-4000-8000-000000000002',
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::date + 6,
        15,
        TRUE
    ),
    (
        '20000000-0000-4000-8000-000000000005',
        '10000000-0000-4000-8000-000000000003',
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::date + 5,
        11,
        TRUE
    ),
    (
        '20000000-0000-4000-8000-000000000006',
        '10000000-0000-4000-8000-000000000003',
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::date + 7,
        13,
        TRUE
    ),
    (
        '20000000-0000-4000-8000-000000000007',
        '10000000-0000-4000-8000-000000000004',
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::date + 8,
        10,
        TRUE
    ),
    (
        '20000000-0000-4000-8000-000000000008',
        '10000000-0000-4000-8000-000000000005',
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::date + 9,
        16,
        TRUE
    );

COMMIT;


-- 6.4 VERIFY SAMPLE RECORD COUNTS
-- Run after successful insertion.

SELECT COUNT(*) AS category_count
FROM krunali_issue71.item_category;

SELECT COUNT(*) AS request_count
FROM krunali_issue71.pickup_request;

SELECT COUNT(*) AS window_count
FROM krunali_issue71.pickup_window;
