-- ENSF 608 Section 5: Database Operations and Queries
-- Runs on the physical model in "../4. Physical model/" (tables.sql, transactions.sql, seed.sql).
-- Sections follow the category table in the 608 project description.
-- Citations: FRxx = ENSF607/1. Functional Requirements; Contract = contracts/README.md.
--   App: <file>:<line> <function> for code on main (db/request/*.sql = Request Service,
--   accounts.ts and profile.ts = backend/src/user/). Notification Service code is not on main
--   yet (#103), so it is cited by function name only (notification-store.js, subscriptions.js).

SET search_path TO ecocollect608, public;
SET client_min_messages = warning;  -- hide "does not exist, skipping" from DROP PROCEDURE IF EXISTS


-- 0. Helper view used by other queries
--    View: each request's owner and current status.
--    Rationale: status is stored as history (status_change); current = latest row.
--               Defined once so later queries can select from it like a table.
--    Citation:  supports FR09, FR12 · App: 022_request_helpers.sql:46 req_current_status (same idea)
--    Concepts:  view, 3-table join, correlated subquery, MAX
--    Used by:   F2 (a resident's requests that are Open or Assigned),
--               F3 (filters to Open requests for a volunteer's codes),
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
-- RIGHT(id::text, 4): ::text converts the UUID to text (standard: CAST(id AS TEXT)),
-- RIGHT keeps the last 4 characters so the output stays readable.
SELECT RIGHT(pickup_request_id::text, 4) AS request, resident_id, category_id,
       pickup_postal_code, status
FROM request_current_status
ORDER BY status, resident_id;


-- 1. INSERT operations

-- I1. Register a resident.
--    Rationale: sign-up creates the account, its resident role (with address) and the
--               acceptance of the current terms, together or not at all.
--    Citation:  FR01, FR22 · App: accounts.ts:69 saveRegistration (same tables)
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
--    Citation:  FR19 · App: subscriptions.js add (#103, same statement)
--    Concepts:  INSERT ... VALUES, ON CONFLICT DO UPDATE (upsert), EXCLUDED
BEGIN;

INSERT INTO push_subscription (endpoint, account_id, p256dh, auth, expiration_time, user_agent, updated_at)
VALUES ('https://push.example.test/resident1-laptop', 'resident1',
        'BExampleP256dhKeyResident1Laptop', 'exampleAuthSecret1', NULL, 'Firefox on Linux', now())
ON CONFLICT (endpoint) DO UPDATE SET
  account_id = EXCLUDED.account_id,  -- EXCLUDED = the row we tried to insert; take its value
  p256dh = EXCLUDED.p256dh,
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
--    Citation:  FR10, FR07 · App: 037_request_edit.sql:118 req_edit
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
-- (ids shown as their last 4 characters, see op 0)
SELECT RIGHT(w.pickup_window_id::text, 4) AS window, w.pickup_date, w.start_hour,
       w.is_active, pr.request_seq
FROM pickup_window w
JOIN pickup_request pr ON pr.pickup_request_id = w.pickup_request_id
WHERE w.pickup_request_id = '00000003-0000-4000-8000-000000000001'
ORDER BY w.is_active DESC, w.pickup_date, w.start_hour;

ROLLBACK;

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

-- D2. Daily cleanup: delete expired notifications (children first, then the parent).
--    Rationale: expired notifications no longer describe the request's state; the daily
--               cleanup removes them. Each notification has a source row in
--               request_notification or award_notification that references it, so those
--               rows are deleted before the notification itself (foreign-key order).
--    Citation:  FR19 · Contract: E14 NotificationCleanupRequested (daily at 03:00 Calgary),
--               13.2 "Expired notifications are deleted on NotificationCleanupRequested"
--    Concepts:  DELETE ... WHERE ... IN (subquery), foreign-key order, transaction, CALL
--    Uses:      check_business_rules() (transactions.sql)
BEGIN;

-- a) Before: notifications by state.
SELECT is_expired, COUNT(*) AS notifications
FROM notification
GROUP BY is_expired
ORDER BY is_expired;

-- b) Children first: source rows of expired notifications.
DELETE FROM request_notification
WHERE notification_id IN (SELECT notification_id FROM notification WHERE is_expired);

DELETE FROM award_notification     -- award notifications never expire (13.2): deletes 0 rows
WHERE notification_id IN (SELECT notification_id FROM notification WHERE is_expired);

-- c) Then the parents.
DELETE FROM notification
WHERE is_expired;

-- d) Multi-row rules (every notification still has exactly one source row).
CALL check_business_rules();

-- e) After.
SELECT is_expired, COUNT(*) AS notifications
FROM notification
GROUP BY is_expired
ORDER BY is_expired;

ROLLBACK;

-- 4. Basic SELECT queries with filtering

-- F1. A volunteer's preferred postal codes.
--    Rationale: shown on the volunteer's profile; these codes decide which new requests
--               they're notified about and their default discovery filter.
--    Citation:  FR04, FR12 · App: profile.ts:12 loadProfile (preferred codes subquery)
--    Concepts:  SELECT, WHERE
SELECT postal_code
FROM volunteer_preferred_postal_code
WHERE account_id = 'volunteer1'
ORDER BY postal_code;

-- F2. A resident's requests that can still be cancelled (Open or Assigned).
--    Rationale: residents may cancel only while a request is Open or Assigned; the
--               cancel button is offered on these (FR11).
--    Citation:  FR11 · Contract: Q10 (409 not_cancellable unless Open or Assigned)
--               · App: 034_request_cancel.sql:25 req_check_cancel
--    Concepts:  WHERE, AND, OR, parentheses
--    Uses:      view request_current_status (op 0) for the current status
-- (ids shown as their last 4 characters, see op 0)
SELECT RIGHT(pickup_request_id::text, 4) AS request, category_id, status
FROM request_current_status
WHERE resident_id = 'resident2'
  AND (status = 'Open' OR status = 'Assigned')
ORDER BY request;

-- F3. Open requests in a volunteer's preferred postal codes.
--    Rationale: the volunteer's default discovery list shows only Open requests in
--               their preferred codes (FR12).
--    Citation:  FR12 · App: 029_request_list_available.sql:25 req_list_available
--               ("p.pickup_postal_code = ANY (p_postal_codes)")
--    Concepts:  WHERE, AND, IN (with a list from a subquery)
--    Uses:      view request_current_status (op 0) for the current status
-- (ids shown as their last 4 characters, see op 0)
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
-- (ids shown as their last 4 characters, see op 0)
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
--    Citation:  FR06 · App: 025_request_lists.sql:12 req_list_categories
--    Concepts:  ORDER BY on two columns, AS (column alias)
SELECT name AS category, waste_type, standard_weight_kg
FROM item_category
ORDER BY waste_type, name;

-- O2. Newest notifications for an account, first page.
--    Rationale: the in-app notification list shows the newest first, a page at a time;
--               expired notifications are hidden (FR19).
--    Citation:  FR19 · App: notification-store.js listForAccount (#103;
--               "ORDER BY n.created_at DESC ... LIMIT $3")
--    Concepts:  ORDER BY ... DESC, LIMIT, WHERE, AND NOT, join
-- (ids shown as their last 4 characters, see op 0)
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
--    Citation:  FR19 · App: notification-store.js listForAccount (#103;
--               "SELECT count(*) ... AND NOT n.is_expired AND NOT n.is_read")
--    Concepts:  COUNT, WHERE, AND NOT, join
SELECT COUNT(*) AS unread
FROM request_notification rn
JOIN notification n ON n.notification_id = rn.notification_id
WHERE rn.account_id = 'resident1'
  AND NOT n.is_expired
  AND NOT n.is_read;

-- 7. SELECT queries with GROUP BY

-- G1. Requests and estimated weight per waste type (all requests).
--    Rationale: shows what kinds of e-waste residents ask to have collected and how
--               much, e.g. which facility types the platform needs most.
--    Citation:  FR06, FR23
--    Concepts:  GROUP BY, COUNT, SUM, join, ORDER BY an aggregate alias
SELECT c.waste_type,
       COUNT(*) AS requests,
       SUM(pr.estimated_weight_kg) AS total_weight_kg
FROM pickup_request pr
JOIN item_category c ON c.category_id = pr.category_id
GROUP BY c.waste_type
ORDER BY total_weight_kg DESC;

-- G2. Categories residents request repeatedly (2 or more requests).
--    Rationale: recurring categories show steady demand; facilities accepting them
--               matter most for the platform.
--    Citation:  FR06, FR23
--    Concepts:  GROUP BY, HAVING, COUNT, SUM, join, ORDER BY two keys
SELECT c.name AS category,
       COUNT(*) AS requests,
       SUM(pr.quantity) AS items
FROM pickup_request pr
JOIN item_category c ON c.category_id = pr.category_id
GROUP BY c.name
HAVING COUNT(*) >= 2
ORDER BY requests DESC, category;

-- 8. SELECT queries with INNER JOIN

-- J1. Facilities that accept a category (where a volunteer can deliver phones).
--    Rationale: a volunteer must deliver to an eligible facility, one that accepts
--               the request's category (FR17).
--    Citation:  FR17 · App: 025_request_lists.sql:37 req_list_facilities
--    Concepts:  INNER JOIN across 3 tables (junction table), WHERE, ORDER BY
SELECT c.name AS category, f.name AS facility, f.street, f.postal_code,
       f.special_instructions
FROM facility_accepts fa
JOIN recycling_facility f ON f.facility_id = fa.facility_id
JOIN item_category c ON c.category_id = fa.category_id
WHERE fa.category_id = 'phones'
ORDER BY f.name;

-- J2. A resident's pickup requests with category, weight and current status.
--    Rationale: the resident's "My requests" list (FR09), newest first.
--    Citation:  FR09 · App: 028_request_list_mine.sql:13 req_list_mine
--    Concepts:  INNER JOIN (view + 2 tables), WHERE, ORDER BY ... DESC
--    Uses:      view request_current_status (op 0) for the owner and current status
-- (ids shown as their last 4 characters, see op 0)
SELECT RIGHT(pr.pickup_request_id::text, 4) AS request,
       c.name AS category, pr.quantity, pr.estimated_weight_kg, rcs.status
FROM request_current_status rcs
JOIN pickup_request pr ON pr.pickup_request_id = rcs.pickup_request_id
JOIN item_category c ON c.category_id = pr.category_id
WHERE rcs.resident_id = 'resident1'
ORDER BY pr.created_at DESC;

-- J3. Active assignments: which volunteer has which request, when, and whether
--     the items are already collected.
--    Rationale: volunteers track their current pickups (FR21); an assignment is active
--               until it ends (delivered, cancelled or missed).
--    Citation:  FR21, FR13, FR15
--    Concepts:  INNER JOIN across 5 tables, WHERE ... IS NULL, boolean expression, ORDER BY
-- (ids shown as their last 4 characters, see op 0)
SELECT ta.account_id AS volunteer,
       RIGHT(pr.pickup_request_id::text, 4) AS request,
       c.name AS category,
       pr.pickup_postal_code,
       w.pickup_date, w.start_hour,
       a.collected_at IS NOT NULL AS collected
FROM assignment a
JOIN terms_acceptance ta ON ta.terms_acceptance_id = a.terms_acceptance_id
JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
JOIN pickup_request pr ON pr.pickup_request_id = w.pickup_request_id
JOIN item_category c ON c.category_id = pr.category_id
WHERE a.ended_at IS NULL
ORDER BY volunteer, w.pickup_date, w.start_hour;

-- 9. SELECT queries with LEFT JOIN or RIGHT JOIN

-- L1. A volunteer's pickup history, with the facility for delivered ones.
--    Rationale: volunteers view their assigned, collected and delivered pickups (FR21);
--               only delivered assignments have a delivery record, but every
--               assignment must still appear.
--    Citation:  FR21, FR17 · App: 039_request_volunteer_history.sql:19 req_volunteer_history
--    Concepts:  LEFT JOIN (keeps rows without a match, NULL columns), INNER JOIN,
--               WHERE, ORDER BY ... DESC
-- (ids shown as their last 4 characters, see op 0)
SELECT RIGHT(pr.pickup_request_id::text, 4) AS request,
       a.accepted_at::date AS accepted,
       a.end_reason AS outcome,
       f.name AS delivered_to
FROM assignment a
JOIN terms_acceptance ta ON ta.terms_acceptance_id = a.terms_acceptance_id
JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
JOIN pickup_request pr ON pr.pickup_request_id = w.pickup_request_id
LEFT JOIN delivery d ON d.assignment_id = a.assignment_id
LEFT JOIN recycling_facility f ON f.facility_id = d.facility_id
WHERE ta.account_id = 'volunteer1'
ORDER BY a.accepted_at DESC;

-- L2. Every volunteer with their preferred postal codes, including volunteers with none.
--    Rationale: a volunteer without preferred codes gets no default discovery filter
--               and no area notifications (FR12, FR19); this shows who is in that case.
--    Citation:  FR12, FR04
--    Concepts:  LEFT JOIN (NULL for no match), INNER JOIN, ORDER BY two keys
SELECT v.account_id AS volunteer, a.public_name, p.postal_code
FROM volunteer v
JOIN account a ON a.account_id = v.account_id
LEFT JOIN volunteer_preferred_postal_code p ON p.account_id = v.account_id
ORDER BY v.account_id, p.postal_code;

-- 10. SELECT queries combining JOINs, aggregates, filtering or grouping

-- C1. EcoPoints earned per account and role, highest first.
--    Rationale: residents and volunteers earn EcoPoints on delivery (and volunteers on
--               late resident cancellations); this totals them per person and role (FR18).
--    Citation:  FR18, FR23
--    Concepts:  multi-table INNER JOIN, COUNT, SUM, GROUP BY, UNION ALL, ORDER BY
SELECT ta.account_id, 'resident' AS earned_as, COUNT(*) AS awards, SUM(e.points) AS points
FROM ecopoints_award e
JOIN resident_award ra ON ra.ecopoints_award_id = e.ecopoints_award_id
JOIN assignment a ON a.assignment_id = e.assignment_id
JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
JOIN pickup_request pr ON pr.pickup_request_id = w.pickup_request_id
JOIN terms_acceptance ta ON ta.terms_acceptance_id = pr.terms_acceptance_id
GROUP BY ta.account_id
UNION ALL
SELECT ta.account_id, 'volunteer' AS earned_as, COUNT(*) AS awards, SUM(e.points) AS points
FROM ecopoints_award e
JOIN volunteer_award va ON va.ecopoints_award_id = e.ecopoints_award_id
JOIN assignment a ON a.assignment_id = e.assignment_id
JOIN terms_acceptance ta ON ta.terms_acceptance_id = a.terms_acceptance_id
GROUP BY ta.account_id
ORDER BY points DESC, account_id;

-- 11. Stored procedures

-- P1. mark_all_read: mark all of an account's notifications as read.
--    Rationale: the "mark all as read" action in the notification list (FR19).
--    Citation:  FR19 · App: notification-store.js markAllRead (#103, same UPDATE)
--    Concepts:  stored procedure, IN parameter, UPDATE ... FROM (multi-table update), CALL
--    Mandate:   Lecture 12 - 3: data changes encapsulated in stored procedures, called with
--               CALL. Postgres syntax noted inline.
DROP PROCEDURE IF EXISTS mark_all_read(VARCHAR);    -- Postgres names a procedure by its parameter types

CREATE PROCEDURE mark_all_read(IN p_account_id VARCHAR(50))
LANGUAGE plpgsql    -- the body is Postgres's procedural language (BEGIN ... END)
AS $$               -- start of the quoted body; replaces Lecture 12's DELIMITER //
BEGIN
    UPDATE notification n
    SET is_read = TRUE
    FROM request_notification rn
    WHERE n.notification_id = rn.notification_id
      AND rn.account_id = p_account_id
      AND NOT n.is_read;
END;
$$;                 -- end of the body

-- Demo: before, CALL, after (rolled back).
BEGIN;

SELECT n.type, n.is_read
FROM request_notification rn
JOIN notification n ON n.notification_id = rn.notification_id
WHERE rn.account_id = 'resident1'
ORDER BY n.created_at DESC;

CALL mark_all_read('resident1');

SELECT n.type, n.is_read
FROM request_notification rn
JOIN notification n ON n.notification_id = rn.notification_id
WHERE rn.account_id = 'resident1'
ORDER BY n.created_at DESC;

ROLLBACK;

-- P2. mark_read: mark one notification read, only if it belongs to the account.
--    Rationale: tapping a notification marks it read (FR19); a user must not be able to
--               change someone else's notification, and the caller needs to know which
--               happened (the app answers 404 when nothing matched).
--    Citation:  FR19 · App: notification-store.js markRead (#103, same UPDATE;
--               "return rowCount > 0")
--    Concepts:  stored procedure, IN and OUT parameters, SELECT ... INTO, COUNT,
--               UPDATE ... FROM, CALL
--    Mandate:   Lecture 12 - 2.2: typed IN/OUT parameters; OUT set with SELECT ... INTO
--               (pattern 7, CountStudents). Postgres syntax noted inline (see P1).
DROP PROCEDURE IF EXISTS mark_read(VARCHAR, UUID, BOOLEAN);

CREATE PROCEDURE mark_read(
    IN  p_account_id      VARCHAR(50),
    IN  p_notification_id UUID,
    OUT p_found           BOOLEAN
)
LANGUAGE plpgsql    -- as in P1
AS $$               -- as in P1
BEGIN
    -- Does this notification belong to this account? (SELECT ... INTO the OUT parameter)
    SELECT COUNT(*) > 0 INTO p_found
    FROM request_notification
    WHERE account_id = p_account_id
      AND notification_id = p_notification_id;

    -- Mark it read (changes nothing when it isn't theirs).
    UPDATE notification n
    SET is_read = TRUE
    FROM request_notification rn
    WHERE n.notification_id = rn.notification_id
      AND rn.account_id = p_account_id
      AND n.notification_id = p_notification_id;
END;
$$;

-- Demo (rolled back):
BEGIN;

-- a) resident1 reads their own unread notification -> found = t
--    (NULL fills the OUT slot; Postgres prints the OUT value as a row, no @variable)
CALL mark_read('resident1', '0000000a-0000-4000-8000-000000000008', NULL);

-- b) resident1 tries resident2's notification -> found = f, nothing changes
CALL mark_read('resident1', '0000000a-0000-4000-8000-000000000002', NULL);

-- c) Show both notifications.
SELECT rn.account_id, n.type, n.is_read
FROM request_notification rn
JOIN notification n ON n.notification_id = rn.notification_id
WHERE n.notification_id IN ('0000000a-0000-4000-8000-000000000008',
                            '0000000a-0000-4000-8000-000000000002')
ORDER BY rn.account_id;

ROLLBACK;