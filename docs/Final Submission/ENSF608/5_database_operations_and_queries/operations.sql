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
--               A2 (weight stats of Open requests),
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

-- U2. Replace an Open request's pickup windows (resident edit).
--    Rationale: residents may replace active windows while Open; old windows are kept
--               as history (is_active = FALSE), not deleted.
--    Citation:  FR10, FR07
--    Concepts:  transaction, row lock (FOR UPDATE), UPDATE, INSERT ... SELECT,
--               business-rule check (CALL), ROLLBACK keeps the seed unchanged
--    Uses:      check_business_rules() (transactions.sql); request ...0001 from seed.sql
BEGIN;

-- a) Lock the request; a resident editing and a volunteer accepting can
--    collide; accept_request locks the same row, so the second one waits and then
--    sees the new windows.
SELECT pickup_request_id FROM pickup_request
WHERE pickup_request_id = '00000003-0000-4000-8000-000000000001'
FOR UPDATE;

-- b) Retire the current active windows (kept as history).
UPDATE pickup_window
SET is_active = FALSE
WHERE pickup_request_id = '00000003-0000-4000-8000-000000000001'
  AND is_active;

-- c) Add the replacement window: 3 days after creation, 15:00 Calgary time
--    (any start after creation and end within 30 days is valid, FR07).
INSERT INTO pickup_window (pickup_window_id, pickup_request_id, pickup_date, start_hour, is_active)
SELECT '00000091-0000-4000-8000-000000000002', pr.pickup_request_id,
       (pr.created_at AT TIME ZONE 'America/Edmonton')::date + 3, 15, TRUE
FROM pickup_request pr
WHERE pr.pickup_request_id = '00000003-0000-4000-8000-000000000001';

-- d) Bump the published sequence: an edit is a new request event, and consumers
--    use request_seq to spot late events.
UPDATE pickup_request
SET request_seq = request_seq + 1
WHERE pickup_request_id = '00000003-0000-4000-8000-000000000001';

-- e) Multi-row rules (1-3 active windows, distinct, inside the 30-day period).
CALL check_business_rules();

-- f) Show the result.
SELECT RIGHT(w.pickup_window_id::text, 4) AS

-- 3. DELETE operations

-- D1. Volunteer drops a preferred postal code.
--    Rationale: volunteers choose up to 3 postal codes to be notified about; removing
--               one stops new-request notifications for that area.
--    Citation:  FR04, FR01 (up to 3 preferred codes)
--    Concepts:  DELETE ... WHERE, AND, row lock (FOR UPDATE), CALL
--    Uses:      check_business_rules() (transactions.sql); volunteer1 from seed.sql
BEGIN;

-- a) Lock the volunteer: preferred-code changes lock the volunteer row
--    (add_preferred_code does the same), so two edits can't race past the 3-code limit.
SELECT account_id FROM volunteer WHERE account_id = 'volunteer1' FOR UPDATE;

-- b) Remove one code.
DELETE FROM volunteer_preferred_postal_code
WHERE account_id = 'volunteer1'
  AND postal_code = 'T2T4M3';

-- c) Multi-row rules.
CALL check_business_rules();

-- d) Show the remaining codes.
SELECT account_id, postal_code
FROM volunteer_preferred_postal_code
WHERE account_id = 'volunteer1'
ORDER BY postal_code;

ROLLBACK;

-- D2. Delete expired push subscriptions.
--    Rationale: a browser subscription past its expiration time can't receive pushes;
--               removing it keeps the Notification Service from sending to dead endpoints.
--    Citation:  FR19 · App (#103): subscriptions.js remove (l.39), variant: by expiry, not one endpoint
--    Concepts:  DELETE ... WHERE, IS NOT NULL, AND, comparison with now()
BEGIN;

-- a) Setup: the seed has no expired subscription, so add one.
INSERT INTO push_subscription (endpoint, account_id, p256dh, auth, expiration_time, user_agent, updated_at)
VALUES ('https://push.example.test/resident2-old-phone', 'resident2',
        'BExampleP256dhKeyResident2Phone', 'exampleAuthSecret2',
        now() - INTERVAL '1 day', 'Chrome on Android', now() - INTERVAL '40 days');

-- b) Before: which subscriptions are expired.
SELECT account_id, endpoint,
       expiration_time IS NOT NULL AND expiration_time < now() AS expired
FROM push_subscription
ORDER BY account_id;

-- c) Delete every expired subscription.
DELETE FROM push_subscription
WHERE expiration_time IS NOT NULL
  AND expiration_time < now();

-- d) After.
SELECT account_id, endpoint
FROM push_subscription
ORDER BY account_id;

ROLLBACK;

-- 4. Basic SELECT queries with filtering

-- F1. A volunteer's preferred postal codes.
--    Rationale: shown on the volunteer's profile; these codes decide which new requests
--               they're notified about and their default discovery filter.
--    Citation:  FR04, FR12 · App: profile.ts (preferred codes subquery)
--    Concepts:  SELECT, WHERE
SELECT postal_code
FROM volunteer_preferred_postal_code
WHERE account_id = 'volunteer1'
ORDER BY postal_code;

-- F2. Facilities in a volunteer's areas that need no special drop-off steps.
--    Rationale: when choosing where to deliver, a volunteer may prefer a nearby
--               facility with a simple drop-off.
--    Citation:  FR17
--    Concepts:  WHERE, LIKE (prefix pattern), OR, AND, IS NULL, parentheses
SELECT name, street, postal_code
FROM recycling_facility
WHERE (postal_code LIKE 'T2N%' OR postal_code LIKE 'T2T%')
  AND special_instructions IS NULL
ORDER BY name;

-- F3. Open requests in a volunteer's preferred postal codes.
--    Rationale: the volunteer's default discovery list shows only Open requests in
--               their preferred codes (FR12).
--    Citation:  FR12 · App: store.js listAvailable (l.135), "pickup_postal_code = ANY($1)"
--    Concepts:  WHERE, AND, IN (with a list from a subquery)
--    Uses:      view request_current_status (op 0) for the current status
SELECT RIGHT(pickup_request_id::text, 4) AS request, category_id, pickup_postal_code
FROM request_current_status
WHERE status = 'Open'
  AND pickup_postal_code IN (SELECT postal_code
                             FROM volunteer_preferred_postal_code
                             WHERE account_id = 'volunteer1')
ORDER BY pickup_postal_code, request;

-- F4. Active pickup windows in the next 7 days (Calgary dates).
--    Rationale: shows the pickups scheduled for the coming week, for planning
--               and for the windows a volunteer can still pick from.
--    Citation:  FR07, FR12
--    Concepts:  WHERE, BETWEEN (inclusive date range), AND, boolean column
SELECT RIGHT(pickup_request_id::text, 4) AS request, pickup_date, start_hour
FROM pickup_window
WHERE is_active
  AND pickup_date BETWEEN (now() AT TIME ZONE 'America/Edmonton')::date
                      AND (now() AT TIME ZONE 'America/Edmonton')::date + 7
ORDER BY pickup_date, start_hour, request;

-- 5. SELECT queries with ORDER BY, DISTINCT or LIMIT

-- O1. Item categories for the request form, by waste type then name.
--    Rationale: residents pick a category when creating a request; its standard weight
--               drives the system's weight estimate.
--    Citation:  FR06 · App: store.js loadCategories (l.21)
--    Concepts:  ORDER BY on two columns, AS (column alias)
SELECT name AS category, waste_type, standard_weight_kg
FROM item_category
ORDER BY waste_type, name;

-- O2. Newest notifications for an account, first page.
--    Rationale: the in-app notification list shows the newest first, a page at a time;
--               expired notifications are hidden (FR19).
--    Citation:  FR19 · App (#103): notification-store.js listForAccount (l.84),
--               "ORDER BY n.created_at DESC ... LIMIT $3"
--    Concepts:  ORDER BY ... DESC, LIMIT, WHERE, AND NOT, join
SELECT n.type, n.created_at, n.is_read,
       RIGHT(rn.pickup_request_id::text, 4) AS request
FROM request_notification rn
JOIN notification n ON n.notification_id = rn.notification_id
WHERE rn.account_id = 'resident1'
  AND NOT n.is_expired
ORDER BY n.created_at DESC
LIMIT 2;

-- 6. SELECT queries with aggregate functions

-- A1. Community impact totals: delivered requests and estimated weight diverted.
--    Rationale: the public statistics page shows how much e-waste has reached
--               recycling facilities (FR23).
--    Citation:  FR23
--    Concepts:  COUNT, SUM, AS, join, WHERE
SELECT COUNT(*) AS delivered_requests,
       SUM(pr.estimated_weight_kg) AS total_weight_kg
FROM pickup_request pr
JOIN status_change sc ON sc.pickup_request_id = pr.pickup_request_id
WHERE sc.status = 'Delivered';

-- A2. Weight of requests waiting for a volunteer: average, lightest, heaviest.
--    Rationale: volunteers see each request's weight (FR12); the spread tells whether
--               typical pickups fit in a car or need more capacity.
--    Citation:  FR12, FR06 (system-estimated weight)
--    Concepts:  AVG, MIN, MAX, COUNT, ROUND, join, WHERE
--    Uses:      view request_current_status (op 0) to find Open requests
SELECT COUNT(*) AS open_requests,
       ROUND(AVG(pr.estimated_weight_kg), 2) AS avg_kg,
       MIN(pr.estimated_weight_kg) AS min_kg,
       MAX(pr.estimated_weight_kg) AS max_kg
FROM pickup_request pr
JOIN request_current_status rcs ON rcs.pickup_request_id = pr.pickup_request_id
WHERE rcs.status = 'Open';

-- A3. Unread notification count for an account (the badge on the bell icon).
--    Rationale: users see how many unread, still-relevant notifications they have;
--               expired ones don't count (FR19).
--    Citation:  FR19 · App (#103): notification-store.js listForAccount (l.97),
--               "SELECT count(*) ... AND NOT n.is_expired AND NOT n.is_read"
--    Concepts:  COUNT, WHERE, AND NOT, join
SELECT COUNT(*) AS unread
FROM request_notification rn
JOIN notification n ON n.notification_id = rn.notification_id
WHERE rn.account_id = 'resident1'
  AND NOT n.is_expired
  AND NOT n.is_read;
