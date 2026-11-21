-- Reward Service operational tables and login (contract 2.1, 8 and 9).
-- Loaded by backend/scripts/reward/load-db.sh after the 608 physical model,
-- whose ecopoints_award, resident_award and volunteer_award tables hold the awards.

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

-- Service login: writes its own schema and the award tables, reads all schemas.
-- The password is set by backend/scripts/reward/load-db.sh.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecocollect_reward') THEN
        CREATE ROLE ecocollect_reward NOLOGIN;
    END IF;
END $$;

GRANT pg_read_all_data TO ecocollect_reward;
GRANT USAGE ON SCHEMA rewards, ecocollect608 TO ecocollect_reward;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rewards TO ecocollect_reward;
GRANT INSERT ON ecocollect608.ecopoints_award, ecocollect608.resident_award, ecocollect608.volunteer_award TO ecocollect_reward;