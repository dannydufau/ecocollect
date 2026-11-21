-- Cleanup Service schema.

CREATE SCHEMA IF NOT EXISTS cleanup;

-- Expiry job per request (contract 14). A null run_at means no pending job.
-- The row keeps request_seq so that older events are ignored (contract 11).
CREATE TABLE IF NOT EXISTS cleanup.expiry_job (
    request_id   UUID PRIMARY KEY,
    request_seq  INTEGER NOT NULL CHECK (request_seq >= 1),
    expires_at   TIMESTAMPTZ,
    run_at       TIMESTAMPTZ,
    fire_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS expiry_job_due_idx ON cleanup.expiry_job (run_at) WHERE run_at IS NOT NULL;

-- Calgary dates on which the daily notification cleanup was requested.
CREATE TABLE IF NOT EXISTS cleanup.daily_run (
    run_date  DATE PRIMARY KEY
);

-- Events pending publication.
CREATE TABLE IF NOT EXISTS cleanup.outbox (
    event_id         UUID PRIMARY KEY,
    insertion_order  BIGINT GENERATED ALWAYS AS IDENTITY,
    event_type       TEXT NOT NULL,
    event_version    INTEGER NOT NULL DEFAULT 1 CHECK (event_version >= 1),
    routing_key      TEXT NOT NULL,
    payload          JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cleanup_outbox_unpublished_idx
    ON cleanup.outbox (created_at, insertion_order) WHERE published_at IS NULL;

-- Event IDs already processed.
CREATE TABLE IF NOT EXISTS cleanup.processed_events (
    event_id      UUID PRIMARY KEY,
    processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service login (contract 2.1 and 8): write access to the cleanup schema, read access to all schemas.
-- The password is set with backend/scripts/cleanup/set-password.sql.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecocollect_cleanup') THEN
        CREATE ROLE ecocollect_cleanup NOLOGIN;
    END IF;
END $$;

GRANT pg_read_all_data TO ecocollect_cleanup;
GRANT USAGE ON SCHEMA cleanup TO ecocollect_cleanup;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cleanup TO ecocollect_cleanup;