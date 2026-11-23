-- ENSF 608 Section 5: Database Operations and Queries
-- Runs on the physical model in "../4. Physical model/" (tables.sql, transactions.sql, seed.sql).
-- Sections follow the category table in the 608 project description.

SET search_path TO ecocollect608, public;


-- 0. Helper view used by other queries
--    View: each request's owner and current status.
--    Rationale: status is stored as history (status_change); current = latest row.
--               Defined once so later queries can select from it like a table.
--    Citation:  supports FR09, FR12
--    Concepts:  view, 3-table join, correlated subquery, MAX
--    Used by:   F3 (filters to Open requests for a volunteer's codes),
--               J2 (shows each of a resident's requests with its current status)
CREATE OR REPLACE VIEW request_current_status AS
SELECT pr.pickup_request_id,
       ta.account_id AS resident_id,
       pr.category_id,
       pr.pickup_postal_code,
       sc.status,
       sc.changed_at AS status_since
FROM pickup_request pr
JOIN terms_acceptance ta ON ta.terms_acceptance_id = pr.terms_acceptance_id
JOIN status_change sc ON sc.pickup_request_id = pr.pickup_request_id
WHERE sc.changed_at = (SELECT MAX(s2.changed_at)
                       FROM status_change s2
                       WHERE s2.pickup_request_id = pr.pickup_request_id);

-- Check: one row per request (11 in the seed), all seven statuses.
SELECT RIGHT(pickup_request_id::text, 4) AS request, resident_id, category_id,
       pickup_postal_code, status
FROM request_current_status
ORDER BY status, resident_id;


-- 1. INSERT operations

-- I1. Register a resident.
--    Rationale: sign-up creates the account, its resident role (with address) and the
--               acceptance of the current terms, together or not at all.
--    Citation:  FR01, FR22 · App: accounts.ts saveRegistration (l.69), same tables
--    Concepts:  transaction, INSERT ... VALUES, INSERT ... SELECT, CALL, 3-table join
--    Uses:      check_business_rules() (transactions.sql)
BEGIN;

-- a) The person.
INSERT INTO account (account_id, first_name, last_name, public_name, date_of_birth, created_at)
VALUES ('resident91', 'Jordan', 'Lee', 'Jordan L.', '1990-04-15', now());

-- b) The resident role, with the Calgary address.
INSERT INTO resident (account_id, street, postal_code)
VALUES ('resident91', '200 Example St NW', 'T2N1N4');

-- c) Acceptance of the current terms (newest document).
INSERT INTO terms_acceptance (terms_acceptance_id, terms_document_id, account_id, accepted_at, type)
SELECT '00000091-0000-4000-8000-000000000001', terms_document_id, 'resident91', now(),
       'AT_RESIDENT_REGISTRATION_OR_ACTIVATION'
FROM terms_document
ORDER BY published_at DESC
LIMIT 1;

-- d) Multi-row rules (e.g. each role needs its registration acceptance).
CALL check_business_rules();

-- e) Show the new resident.
SELECT a.account_id, a.public_name, r.postal_code, t.type,
       RIGHT(t.terms_document_id::text, 4) AS terms
FROM account a
JOIN resident r ON r.account_id = a.account_id
JOIN terms_acceptance t ON t.account_id = a.account_id
WHERE a.account_id = 'resident91';

ROLLBACK;

-- I2. Save a browser's push subscription.
--    Rationale: when a user turns on push in a browser, its endpoint and keys are stored
--               so pushes can be sent there; the same browser subscribing again updates
--               its row instead of failing.
--    Citation:  FR19 · App (#103): subscriptions.js add (l.9), same statement
--    Concepts:  INSERT ... VALUES, ON CONFLICT DO UPDATE (upsert), EXCLUDED
BEGIN;

INSERT INTO push_subscription (endpoint, account_id, p256dh, auth, expiration_time, user_agent, updated_at)
VALUES ('https://push.example.test/resident1-laptop', 'resident1',
        'BExampleP256dhKeyResident1Laptop', 'exampleAuthSecret1', NULL, 'Firefox on Linux', now())
ON CONFLICT (endpoint) DO UPDATE SET
  account_id = EXCLUDED.account_id,  -- EXCLUDED = the row we tried to insert; take its value  p256dh = EXCLUDED.p256dh,
  auth = EXCLUDED.auth,
  expiration_time = EXCLUDED.expiration_time,
  user_agent = EXCLUDED.user_agent,
  updated_at = now();

-- Show resident1's subscriptions.
SELECT account_id, endpoint, user_agent
FROM push_subscription
WHERE account_id = 'resident1'
ORDER BY endpoint;

ROLLBACK;

-- 2. UPDATE operations

-- U1. Change an account's public name.
--    Rationale: users manage their profile; the public name is what others see on
--               requests and public profiles. Deactivated accounts can't be edited.
--    Citation:  FR04, FR05
--    Concepts:  UPDATE ... SET ... WHERE, AND, IS NULL
BEGIN;

UPDATE account
SET public_name = 'Avery CC'
WHERE account_id = 'resident1'
  AND deactivated_at IS NULL;

-- Show the change.
SELECT account_id, first_name, last_name, public_name
FROM account
WHERE account_id = 'resident1';

ROLLBACK;

