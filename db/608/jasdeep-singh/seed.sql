SET
    search_path TO ecocollect608;

-- Stubs seeding
INSERT INTO
    account (username)
VALUES
    ('resident1'),
    ('resident2'),
    ('resident3'),
    ('resident4'),
    ('volunteer1'),
    ('volunteer2'),
    ('volunteer3'),
    ('volunteer4'),
    ('both1'),
    ('both2');

INSERT INTO
    assignment (id)
VALUES
    (1000),
    (1001),
    (1002),
    (1003),
    (1004);

INSERT INTO
    pickup_request (id)
VALUES
    ('10000000-0000-4000-8000-000000000001'),
    ('10000000-0000-4000-8000-000000000002'),
    ('10000000-0000-4000-8000-000000000003'),
    ('10000000-0000-4000-8000-000000000004'),
    ('10000000-0000-4000-8000-000000000005');

-- Normal seeding (not stubs)
INSERT INTO
    terms_document (id, content, published_at)
VALUES
    (
        3000,
        'Terms and Conditions: Version 3000. Safety first!',
        '2026-11-01 00:05:00-07'
    ),
    (
        3001,
        'Terms and Conditions: Version 3001. Safety first!',
        '2026-11-02 12:05:00-07'
    ),
    (
        3002,
        'Terms and Conditions: Version 3002. Safety first!',
        '2026-11-03 00:25:00-07'
    ),
    (
        3003,
        'Terms and Conditions: Version 3003. Safety first!',
        '2026-11-03 12:30:00-07'
    ),
    (
        3004,
        'Terms and Conditions: Version 3004. Safety first!',
        '2026-11-03 15:35:00-07'
    );

INSERT INTO
    terms_acceptance (id, terms_doc_id, username, accepted_at, type)
VALUES
    (
        4000,
        3000,
        'resident1',
        '2026-11-01 01:05:00-07',
        'AT_RESIDENT_REGISTRATION_OR_ACTIVATION'
    ),
    (
        4001,
        3001,
        'resident2',
        '2026-11-02 14:05:00-07',
        'AT_RESIDENT_REQUEST_CREATION'
    ),
    (
        4002,
        3002,
        'volunteer1',
        '2026-11-03 03:25:00-07',
        'AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION'
    ),
    (
        4003,
        3003,
        'volunteer2',
        '2026-11-03 13:30:00-07',
        'AT_VOLUNTEER_ACCEPTANCE'
    ),
    (
        4004,
        3004,
        'both1',
        '2026-11-03 17:35:00-07',
        'AT_RESIDENT_REQUEST_CREATION'
    );

INSERT INTO
    ecopoints_award (
        id,
        assignment_id,
        username,
        points,
        formula,
        role
    )
VALUES
    (
        6000,
        1000,
        'resident3',
        50,
        '((3 x Quantity) + (4 x Estimated_Weight_Kg)) ÷ 2',
        'resident'
    ),
    (
        6001,
        1000,
        'volunteer3',
        100,
        '(3 x Quantity) + (4 x Estimated_Weight_Kg)',
        'volunteer'
    ),
    (
        6002,
        1001,
        'resident4',
        100,
        '((3 x Quantity) + (4 x Estimated_Weight_Kg)) ÷ 2',
        'resident'
    ),
    (
        6003,
        1001,
        'volunteer4',
        200,
        '(3 x Quantity) + (4 x Estimated_Weight_Kg)',
        'volunteer'
    ),
    (
        6004,
        1004,
        'both1',
        100,
        '(3 x Quantity) + (4 x Estimated_Weight_Kg)',
        'volunteer'
    );

INSERT INTO
    notification (
        id,
        username,
        pickup_request_id,
        ecopoints_award_id,
        type,
        created_at,
        metadata
    )
VALUES
    (
        5000,
        'resident2',
        '10000000-0000-4000-8000-000000000003',
        NULL,
        'REQUEST_CREATED',
        '2026-11-02 14:05:05-07',
        NULL
    ),
    -- no push for self action, so metadata is not needed
    (
        5001,
        'volunteer2',
        '10000000-0000-4000-8000-000000000003',
        NULL,
        'NEW_MATCHING_REQUEST',
        '2026-11-02 14:05:10-07',
        '{"itemCategoryID": "batteries", "quantity": 20, "postalCode": "T2N5A6" }'
    ),
    -- sample notification for this could be "New request posted for T2N5A6: 20 Batteries"
    (
        5002,
        'volunteer2',
        '10000000-0000-4000-8000-000000000003',
        NULL,
        'REQUEST_ASSIGNED_VOLUNTEER',
        '2026-11-03 13:30:05-07',
        NULL
    ),
    -- no push for self action, so metadata is not needed
    (
        5003,
        'resident2',
        '10000000-0000-4000-8000-000000000003',
        NULL,
        'REQUEST_ASSIGNED_RESIDENT',
        '2026-11-03 13:30:10-07',
        '{"volunteerPublicName": "Volunteer Two", "itemCategoryID": "batteries", "quantity": 20}'
    ),
    -- sample notification for this could be "Volunteer Two accepted your request for 20 Batteries"
    (
        5004,
        'resident2',
        '10000000-0000-4000-8000-000000000003',
        NULL,
        'REQUEST_COLLECTED_RESIDENT',
        '2026-11-03 15:30:03-07',
        NULL
    ),
    -- no push for self action, so metadata is not needed
    (
        5005,
        'volunteer2',
        '10000000-0000-4000-8000-000000000003',
        NULL,
        'REQUEST_COLLECTED_VOLUNTEER',
        '2026-11-03 15:30:08-07',
        '{"residentPublicName": "Resident Two", "itemCategoryID": "batteries", "quantity": 20}'
    ),
    -- sample notification for this could be "Resident Two approved your collection of 20 Batteries"
    (
        5006,
        'resident3',
        '10000000-0000-4000-8000-000000000004',
        6000,
        'ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT',
        '2026-11-03 18:35:00-07',
        '{"itemCategoryID": "batteries", "quantity": 20, "points": 50 }'
    ),
    -- sample notification for this could be "Your request for 20 batteries has been delivered. You earned 50 points."
    (
        5007,
        'volunteer3',
        '10000000-0000-4000-8000-000000000004',
        6001,
        'ECOPOINTS_AWARDED_ON_DELIVERY_VOLUNTEER',
        '2026-11-03 18:35:05-07',
        '{"itemCategoryID": "batteries", "quantity": 20, "points": 100}'
    ),
    -- sample notification for this could be "You have earned 100 points for delivering 20 batteries."
    (
        5008,
        'resident4',
        '10000000-0000-4000-8000-000000000005',
        6002,
        'ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT',
        '2026-11-03 20:10:00-07',
        '{"itemCategoryID": "laptops", "quantity": 2, "points": 100 }'
    ),
    -- sample notification for this could be "Your request for 2 laptops has been delivered. You earned 100 points."
    (
        5009,
        'volunteer4',
        '10000000-0000-4000-8000-000000000005',
        6003,
        'ECOPOINTS_AWARDED_ON_DELIVERY_VOLUNTEER',
        '2026-11-03 20:10:05-07',
        '{"itemCategoryID": "laptops", "quantity": 2, "points": 200 }'
    ),
    -- sample notification for this could be "You have earned 200 points for delivering 2 laptops."
    (
        5010,
        'both1',
        '10000000-0000-4000-8000-000000000002',
        6004,
        'ECOPOINTS_AWARDED_ON_ASSIGNMENT_CANCELLATION_VOLUNTEER',
        '2026-11-03 22:50:00-07',
        '{"itemCategoryID": "monitors", "quantity": 1, "points": 100, "residentPublicName": "Resident Two" }'
    );

-- sample notification for this could be "Unfortunately, Resident Two cancelled your assignment for 1 monitor. You have still earned 100 points, as the cancellation was outside the allowed window."