-- Reward Service operational tables and login (contract 2.1, 8 and 9).
-- Loaded by backend/scripts/reward/load-db.sh after db/init, where
-- 012_reward_tables.sql creates the award tables. Safe to run again.

CREATE SCHEMA IF NOT EXISTS rewards;

-- Events pending publication.
CREATE TABLE IF NOT EXISTS rewards.outbox (
    event_id         UUID PRIMARY KEY,
    insertion_order  BIGINT GENERATED ALWAYS AS IDENTITY,
    event_type       TEXT NOT NULL,
    event_version    INTEGER NOT NULL DEFAULT 1 CHECK (event_version >= 1),
    routing_key      TEXT NOT NULL,
    payload          JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS rewards_outbox_unpublished_idx
    ON rewards.outbox (created_at, insertion_order) WHERE published_at IS NULL;

-- Event IDs already processed.
CREATE TABLE IF NOT EXISTS rewards.processed_events (
    event_id      UUID PRIMARY KEY,
    processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service login: writes its own schema, reads all schemas.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecocollect_reward') THEN
        CREATE ROLE ecocollect_reward NOLOGIN;
    END IF;
END $$;

GRANT pg_read_all_data TO ecocollect_reward;
GRANT USAGE ON SCHEMA rewards, requests, users TO ecocollect_reward;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rewards TO ecocollect_reward;