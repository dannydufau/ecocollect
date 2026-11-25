-- Request Service login (contract 2.1 and 8): writes the tables this service owns,
-- inserts terms acceptances, reads every schema. The service connects as this
-- role; the admin login only builds the database.
-- Keep this file last in name order, and load it after db/init: the grant on
-- "requests" covers only the tables that exist when it runs.
-- The password is set by backend/scripts/request/load-db.sh (REQUEST_DB_PASSWORD).
-- A role belongs to the whole Postgres server, so it is created once and reused by
-- every database load-db.sh builds; the grants belong to each database.

-- Create the role, without a login until load-db.sh sets its password.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecocollect_request') THEN
        CREATE ROLE ecocollect_request NOLOGIN;
    END IF;
END $$;

-- Read every table in every schema, including tables created later.
GRANT pg_read_all_data TO ecocollect_request;

-- Reach the service's own schema and the User Service's schema.
GRANT USAGE ON SCHEMA requests, users TO ecocollect_request;

-- Write every table in "requests": the course tables this service owns (contract 8,
-- "Who writes": pickup_request, assignment, ...) and its operational tables
-- (outbox, processed events, idempotency keys).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA requests TO ecocollect_request;

-- Insert terms acceptances, never update or delete them (shared with the User Service).
GRANT INSERT ON users.terms_acceptance TO ecocollect_request;
