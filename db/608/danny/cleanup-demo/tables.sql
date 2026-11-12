-- Self-contained cleanup demo (#76). Uses its own schema so it never touches
-- the team's ecocollect608 tables. pickup_request and status_change are
-- simplified stand-ins for Krunali's and Saad's tables.
-- Rerunnable: drops and recreates only the cleanup_demo schema.
DROP SCHEMA IF EXISTS cleanup_demo CASCADE;
CREATE SCHEMA cleanup_demo;
SET search_path TO cleanup_demo;

-- PICKUP_REQUEST (stand-in): only the columns the demo needs.
CREATE TABLE pickup_request (
    request_id          UUID PRIMARY KEY,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    pickup_postal_code  CHAR(6) NOT NULL
);

-- STATUS_CHANGE (stand-in): one row per status a request has been in.
-- A request's current status is its newest row.
-- (The app numbers changes with change_no instead; changed_at keeps the demo simple.)
CREATE TABLE status_change (
    request_id  UUID NOT NULL
                REFERENCES pickup_request (request_id) ON DELETE CASCADE,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    status      VARCHAR(20) NOT NULL,          -- e.g. Open, Assigned, Expired
    PRIMARY KEY (request_id, changed_at)
);

-- CLEANUP_RECORD: same as db/608/danny/tables.sql.
-- Weak entity: request_id is both PK and FK, so at most one per request.
CREATE TABLE cleanup_record (
    request_id     UUID PRIMARY KEY
                   REFERENCES pickup_request (request_id) ON DELETE CASCADE,
    cleaned_up_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);