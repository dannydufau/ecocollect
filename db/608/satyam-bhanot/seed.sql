SET
    search_path TO ecocollect608;

-- Accounts first, then the role rows that point at them.
INSERT INTO
    account (account_id, public_name, first_name, last_name, date_of_birth)
VALUES
    ('resident1', 'Riley', 'Riley', 'Chen', '1995-03-14'),
    ('resident2', 'Rosa', 'Rosa', 'Martin', '1988-07-02'),
    ('resident3', 'Ravi', 'Ravi', 'Patel', '1992-11-21'),
    ('resident4', 'Rena', 'Rena', 'Okafor', '2000-01-30'),
    ('volunteer1', 'Vera', 'Vera', 'Singh', '1993-05-18'),
    ('volunteer2', 'Victor', 'Victor', 'Alvarez', '1985-12-03'),
    ('volunteer3', 'Violet', 'Violet', 'Nguyen', '1998-08-27'),
    ('volunteer4', 'Vince', 'Vince', 'Brown', '1991-02-11'),
    ('both1', 'Rory', 'Rory', 'Campbell', '1990-09-09'),
    ('both2', 'Bryn', 'Bryn', 'Tremblay', '1996-04-16');

-- The addresses for resident1-4 and both1 match the pickup addresses in the pickup_request
-- sample data, because a request copies its address from the resident's profile.
INSERT INTO
    resident (account_id, street, postal_code)
VALUES
    ('resident1', '100 Example Street', 'T2P1J9'),
    ('resident2', '200 Example Street', 'T2A0A1'),
    ('resident3', '300 Example Street', 'T3A0A1'),
    ('resident4', '400 Example Street', 'T2N1N4'),
    ('both1', '500 Example Street', 'T2E0A1'),
    ('both2', '600 Example Street', 'T2M0A1');

-- both1 and both2 are also volunteers, next to the four volunteer-only accounts.
INSERT INTO
    volunteer (account_id)
VALUES
    ('volunteer1'),
    ('volunteer2'),
    ('volunteer3'),
    ('volunteer4'),
    ('both1'),
    ('both2');

-- volunteer1 saves the most (three), volunteer4 saves none.
INSERT INTO
    volunteer_preferred_postal_code (account_id, postal_code, preference_slot)
VALUES
    ('volunteer1', 'T2P1J9', 1),
    ('volunteer1', 'T3A0A1', 2),
    ('volunteer1', 'T2N1N4', 3),
    ('volunteer2', 'T2A0A1', 1),
    ('volunteer3', 'T2E0A1', 1),
    ('both1', 'T2P1J9', 1),
    ('both1', 'T2A0A1', 2),
    ('both2', 'T2M0A1', 1);
