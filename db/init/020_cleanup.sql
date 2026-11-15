-- Cleanup Service tables (schema "cleanup").

CREATE SCHEMA IF NOT EXISTS cleanup;

-- One expiry job per request (contract 14).
-- run_at is null when the request has no job (it is no longer Open). The row is kept,
-- with its request_seq, so an older event arriving late can't bring the job back (section 11).
CREATE TABLE IF NOT EXISTS cleanup.expiry_job (
    request_id   UUID PRIMARY KEY,
    request_seq  INTEGER NOT NULL CHECK (request_seq >= 1),
    expires_at   TIMESTAMPTZ,
    run_at       TIMESTAMPTZ,
    fire_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS expiry_job_due_idx ON cleanup.expiry_job (run_at) WHERE run_at IS NOT NULL;

-- One row per Calgary day on which the daily notification cleanup was requested.
CREATE TABLE IF NOT EXISTS cleanup.daily_run (
    run_date  DATE PRIMARY KEY
);

-- Events waiting to be published to RabbitMQ.
CREATE TABLE IF NOT EXISTS cleanup.outbox (
    event_id       UUID PRIMARY KEY,
    seq            BIGINT GENERATED ALWAYS AS IDENTITY,
    event_type     TEXT NOT NULL,
    event_version  INTEGER NOT NULL DEFAULT 1 CHECK (event_version >= 1),
    routing_key    TEXT NOT NULL,
    payload        JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cleanup_outbox_unpublished_idx
    ON cleanup.outbox (created_at, seq) WHERE published_at IS NULL;

-- Events already handled, so a redelivered event is skipped.
CREATE TABLE IF NOT EXISTS cleanup.processed_events (
    event_id      UUID PRIMARY KEY,
    processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);