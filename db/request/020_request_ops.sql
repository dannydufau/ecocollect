-- Request Service operational tables (schema "requests").
-- "requests" is the Request Service's own schema (contract 2.1): these tables and
-- all of the service's functions live here. The course tables are still in
-- "ecocollect608" (the 608 physical model) until integration; then the ones this
-- service writes move into "requests" too.
-- Convention for every function in db/request/: it is created in "requests";
-- its body names the course tables WITHOUT a schema (pickup_request, not
-- ecocollect608.pickup_request) and calls the service's own functions as
-- requests.req_...; its SET search_path TO requests, ecocollect608, pg_temp
-- finds the tables.
-- At integration: create this service's course tables (pickup_request, assignment,
-- ...) in "requests" first, then change ecocollect608 to users in every
-- SET search_path line. Function bodies stay as they are.
-- These tables are outside the course's logical model (contract section 8) and
-- reference none of its tables, so this file loads with or without the course
-- schema. The service reaches them only through functions, never directly.

CREATE SCHEMA IF NOT EXISTS requests;

-- One row per event waiting to be published. A write function inserts it (through
-- req_enqueue_event) in the same transaction as the change it describes.
-- Plain columns, no JSON: the publisher (TypeScript) builds the contract 10.1
-- envelope from them at send time. Column types copy the ecocollect608 columns
-- they come from. Columns an event doesn't use are NULL (contract 10.3 lists
-- which fields each event carries).
CREATE TABLE IF NOT EXISTS requests.outbox (
    -- Envelope (contract 10.1)
    event_id      UUID          NOT NULL,              -- also the AMQP messageId
    event_type    TEXT          NOT NULL,              -- e.g. 'RequestCreated', also AMQP type
    event_version INTEGER       NOT NULL,              -- RequestCreated 2, others 1
    routing_key   TEXT          NOT NULL,              -- e.g. 'request.created'
    occurred_at   TIMESTAMPTZ   NOT NULL,              -- the action's time (p_at)
    trace_id      TEXT          NULL,                  -- X-Request-Id; NULL for CleanupRequest

    -- Request snapshot after the change (contract 10.2)
    pickup_request_id   UUID          NOT NULL,
    request_seq         BIGINT        NOT NULL,
    transition_id       UUID          NOT NULL,       -- shared by one action's events
    status              VARCHAR(30)   NOT NULL,
    resident_id         VARCHAR(50)   NOT NULL,
    category_id         TEXT          NOT NULL,
    category_name       VARCHAR(120)  NOT NULL,
    waste_type          VARCHAR(120)  NOT NULL,
    quantity            INTEGER       NOT NULL,
    estimated_weight_kg NUMERIC(22,2) NOT NULL,
    postal_code         CHAR(6)       NOT NULL,
    window_ids          UUID[]        NOT NULL,       -- active windows, as parallel arrays
    window_dates        DATE[]        NOT NULL,
    window_start_hours  SMALLINT[]    NOT NULL,
    request_created_at  TIMESTAMPTZ   NOT NULL,
    expires_at          TIMESTAMPTZ   NOT NULL,       -- start of the latest active window (12.2)

    -- Assignment snapshot (E3-E8)
    assignment_id                UUID        NULL,
    volunteer_id                 VARCHAR(50) NULL,
    assignment_window_id         UUID        NULL,
    assignment_window_date       DATE        NULL,
    assignment_window_start_hour SMALLINT    NULL,
    accepted_at                  TIMESTAMPTZ NULL,
    collected_at                 TIMESTAMPTZ NULL,
    ended_at                     TIMESTAMPTZ NULL,
    end_reason                   VARCHAR(30) NULL,

    -- Fields only some events carry (contract 10.3)
    facility_id                 UUID          NULL,   -- E5
    facility_name               VARCHAR(120)  NULL,   -- E5
    delivered_at                TIMESTAMPTZ   NULL,   -- E5
    cancelled_at                TIMESTAMPTZ   NULL,   -- E6, E7
    outside_cancellation_window BOOLEAN       NULL,   -- E6
    reported_at                 TIMESTAMPTZ   NULL,   -- E8
    rescheduled_as_request_id   UUID          NULL,   -- E8
    rescheduled_from_request_id UUID          NULL,   -- E1
    matched_volunteer_ids       VARCHAR(50)[] NULL,   -- E1, E2
    changed                     TEXT[]        NULL,   -- E2 (edited)
    reason                      TEXT          NULL,   -- E2 'edited'/'reopened', E9 resident's text
    expiry_trigger              VARCHAR(30)   NULL,   -- E10

    -- Publishing
    -- clock_timestamp(), not now(): now() is the same for every row in one
    -- transaction, so one action's events (E6 then E9) would tie. This keeps
    -- insertion order; the claim function sends the oldest unsent row first.
    enqueued_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    claimed_until TIMESTAMPTZ NULL,                   -- lease: a publisher is sending it
    published_at  TIMESTAMPTZ NULL,                   -- set after RabbitMQ confirms

    CONSTRAINT outbox_pk PRIMARY KEY (event_id),
    CONSTRAINT outbox_seq_ck CHECK (request_seq >= 1),
    -- Each event type has exactly one routing key and version (contract 10.1, 10.3).
    CONSTRAINT outbox_type_ck CHECK ((event_type, routing_key, event_version) IN (
        ('RequestCreated',                      'request.created',                       2),  -- E1
        ('RequestUpdated',                      'request.updated',                       1),  -- E2
        ('RequestAssigned',                     'request.assigned',                      1),  -- E3
        ('RequestAssignmentCollected',          'request.assignment.collected',          1),  -- E4
        ('RequestAssignmentDelivered',          'request.assignment.delivered',          1),  -- E5
        ('RequestAssignmentCancelledResident',  'request.assignment.cancelled.resident', 1),  -- E6
        ('RequestAssignmentCancelledVolunteer', 'request.assignment.cancelled.volunteer', 1), -- E7
        ('RequestAssignmentMissed',             'request.assignment.missed',             1),  -- E8
        ('RequestCancelled',                    'request.cancelled',                     1),  -- E9
        ('RequestExpired',                      'request.expired',                       1)   -- E10
    )),
    -- 1-3 active windows, and the three arrays line up.
    CONSTRAINT outbox_windows_ck CHECK (
        cardinality(window_ids) BETWEEN 1 AND 3
        AND cardinality(window_dates) = cardinality(window_ids)
        AND cardinality(window_start_hours) = cardinality(window_ids)
    ),

    -- What each event carries (contract 10.3), one CHECK per event:
    --   "event_type <> 'X' OR (...)" reads "if this is event X, then ...".
    --   num_nonnulls(...) counts the arguments that are not NULL, so
    --     num_nonnulls(required columns) = how many there are  -> all filled
    --     num_nonnulls(columns not allowed) = 0                -> all NULL
    --   A column in neither list is optional for that event.
    -- The 21 event-specific columns: 6 assignment (assignment_id ... accepted_at),
    -- 3 assignment progress (collected_at, ended_at, end_reason), 12 others.

    -- E1 RequestCreated: matched volunteers (an empty array is fine: nobody matched).
    -- Optional: rescheduled_from_request_id (only for a reschedule, Q14).
    CONSTRAINT outbox_e1_ck CHECK (event_type <> 'RequestCreated' OR (
        num_nonnulls(matched_volunteer_ids) = 1
        AND num_nonnulls(assignment_id, volunteer_id, assignment_window_id, assignment_window_date,
                         assignment_window_start_hour, accepted_at, collected_at, ended_at, end_reason,
                         facility_id, facility_name, delivered_at, cancelled_at,
                         outside_cancellation_window, reported_at, rescheduled_as_request_id,
                         changed, reason, expiry_trigger) = 0
    )),
    -- E2 RequestUpdated: matched volunteers and reason 'edited' or 'reopened';
    -- `changed` is listed for an edit only.
    CONSTRAINT outbox_e2_ck CHECK (event_type <> 'RequestUpdated' OR (
        num_nonnulls(matched_volunteer_ids, reason) = 2
        AND reason IN ('edited', 'reopened')
        AND (changed IS NOT NULL) = (reason = 'edited')
        AND num_nonnulls(assignment_id, volunteer_id, assignment_window_id, assignment_window_date,
                         assignment_window_start_hour, accepted_at, collected_at, ended_at, end_reason,
                         facility_id, facility_name, delivered_at, cancelled_at,
                         outside_cancellation_window, reported_at, rescheduled_as_request_id,
                         rescheduled_from_request_id, expiry_trigger) = 0
    )),
    -- E3 RequestAssigned: the new assignment, not collected or ended yet.
    CONSTRAINT outbox_e3_ck CHECK (event_type <> 'RequestAssigned' OR (
        num_nonnulls(assignment_id, volunteer_id, assignment_window_id, assignment_window_date,
                     assignment_window_start_hour, accepted_at) = 6
        AND num_nonnulls(collected_at, ended_at, end_reason,
                         facility_id, facility_name, delivered_at, cancelled_at,
                         outside_cancellation_window, reported_at, rescheduled_as_request_id,
                         rescheduled_from_request_id, matched_volunteer_ids, changed, reason,
                         expiry_trigger) = 0
    )),
    -- E4 RequestAssignmentCollected: the assignment, collected, not ended.
    CONSTRAINT outbox_e4_ck CHECK (event_type <> 'RequestAssignmentCollected' OR (
        num_nonnulls(assignment_id, volunteer_id, assignment_window_id, assignment_window_date,
                     assignment_window_start_hour, accepted_at, collected_at) = 7
        AND num_nonnulls(ended_at, end_reason,
                         facility_id, facility_name, delivered_at, cancelled_at,
                         outside_cancellation_window, reported_at, rescheduled_as_request_id,
                         rescheduled_from_request_id, matched_volunteer_ids, changed, reason,
                         expiry_trigger) = 0
    )),
    -- E5 RequestAssignmentDelivered: the assignment, collected and ended; facility; deliveredAt.
    CONSTRAINT outbox_e5_ck CHECK (event_type <> 'RequestAssignmentDelivered' OR (
        num_nonnulls(assignment_id, volunteer_id, assignment_window_id, assignment_window_date,
                     assignment_window_start_hour, accepted_at, collected_at, ended_at, end_reason,
                     facility_id, facility_name, delivered_at) = 12
        AND num_nonnulls(cancelled_at, outside_cancellation_window, reported_at,
                         rescheduled_as_request_id, rescheduled_from_request_id,
                         matched_volunteer_ids, changed, reason, expiry_trigger) = 0
    )),
    -- E6 RequestAssignmentCancelledResident: the assignment, ended before collection;
    -- cancelledAt; outsideCancellationWindow.
    CONSTRAINT outbox_e6_ck CHECK (event_type <> 'RequestAssignmentCancelledResident' OR (
        num_nonnulls(assignment_id, volunteer_id, assignment_window_id, assignment_window_date,
                     assignment_window_start_hour, accepted_at, ended_at, end_reason,
                     cancelled_at, outside_cancellation_window) = 10
        AND num_nonnulls(collected_at, facility_id, facility_name, delivered_at, reported_at,
                         rescheduled_as_request_id, rescheduled_from_request_id,
                         matched_volunteer_ids, changed, reason, expiry_trigger) = 0
    )),
    -- E7 RequestAssignmentCancelledVolunteer: the assignment, ended before collection; cancelledAt.
    CONSTRAINT outbox_e7_ck CHECK (event_type <> 'RequestAssignmentCancelledVolunteer' OR (
        num_nonnulls(assignment_id, volunteer_id, assignment_window_id, assignment_window_date,
                     assignment_window_start_hour, accepted_at, ended_at, end_reason,
                     cancelled_at) = 9
        AND num_nonnulls(collected_at, facility_id, facility_name, delivered_at,
                         outside_cancellation_window, reported_at, rescheduled_as_request_id,
                         rescheduled_from_request_id, matched_volunteer_ids, changed, reason,
                         expiry_trigger) = 0
    )),
    -- E8 RequestAssignmentMissed: the assignment, ended without collection; reportedAt.
    -- Optional: rescheduled_as_request_id (only when Q14 rescheduled).
    CONSTRAINT outbox_e8_ck CHECK (event_type <> 'RequestAssignmentMissed' OR (
        num_nonnulls(assignment_id, volunteer_id, assignment_window_id, assignment_window_date,
                     assignment_window_start_hour, accepted_at, ended_at, end_reason,
                     reported_at) = 9
        AND num_nonnulls(collected_at, facility_id, facility_name, delivered_at, cancelled_at,
                         outside_cancellation_window, rescheduled_from_request_id,
                         matched_volunteer_ids, changed, reason, expiry_trigger) = 0
    )),
    -- E9 RequestCancelled: nothing required. Optional: reason (the resident's text).
    CONSTRAINT outbox_e9_ck CHECK (event_type <> 'RequestCancelled' OR (
        num_nonnulls(assignment_id, volunteer_id, assignment_window_id, assignment_window_date,
                     assignment_window_start_hour, accepted_at, collected_at, ended_at, end_reason,
                     facility_id, facility_name, delivered_at, cancelled_at,
                     outside_cancellation_window, reported_at, rescheduled_as_request_id,
                     rescheduled_from_request_id, matched_volunteer_ids, changed,
                     expiry_trigger) = 0
    )),
    -- E10 RequestExpired: what triggered the expiry.
    CONSTRAINT outbox_e10_ck CHECK (event_type <> 'RequestExpired' OR (
        num_nonnulls(expiry_trigger) = 1
        AND expiry_trigger IN ('cleanup_job', 'assignment_cancelled', 'overdue_on_action')
        AND num_nonnulls(assignment_id, volunteer_id, assignment_window_id, assignment_window_date,
                         assignment_window_start_hour, accepted_at, collected_at, ended_at, end_reason,
                         facility_id, facility_name, delivered_at, cancelled_at,
                         outside_cancellation_window, reported_at, rescheduled_as_request_id,
                         rescheduled_from_request_id, matched_volunteer_ids, changed, reason) = 0
    ))
);

-- Events this service has already handled (CleanupRequest). Inserted first in
-- the handler's transaction, so a redelivered message is skipped.
CREATE TABLE IF NOT EXISTS requests.processed_events (
    event_id     UUID        NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT processed_events_pk PRIMARY KEY (event_id)
);

-- Q4 Idempotency-Key: a repeat with the same key from the same resident within
-- 24 h returns the requests the first call created (contract Q4, NFR06). The
-- response is rebuilt from these ids by reading the requests again. A key older
-- than 24 h is overwritten when the same resident uses it again (contract section 8).
CREATE TABLE IF NOT EXISTS requests.idempotency_keys (
    resident_id     VARCHAR(50)  NOT NULL,           -- account_id (same type as the model)
    idempotency_key VARCHAR(200) NOT NULL,
    request_ids     UUID[]       NOT NULL,           -- the requests the first call created
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT idempotency_keys_pk PRIMARY KEY (resident_id, idempotency_key),
    CONSTRAINT idempotency_keys_ids_ck CHECK (cardinality(request_ids) >= 1)
);
