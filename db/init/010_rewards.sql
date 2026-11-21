-- Reward Service tables (schema "rewards").

CREATE SCHEMA IF NOT EXISTS rewards;

DO $$
BEGIN
    CREATE TYPE rewards.earned_as AS ENUM ('resident', 'volunteer');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- One row per award. At most one award per assignment per role.
-- formula is a copy of the formula text used, e.g. '3 * quantity + 4 * estimatedWeightKg'.
CREATE TABLE IF NOT EXISTS rewards.ecopoints_award (
    award_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id  UUID NOT NULL,
    account_id     VARCHAR(50) NOT NULL,
    earned_as      rewards.earned_as NOT NULL,
    points         NUMERIC(10, 2) NOT NULL CHECK (points > 0),
    formula        TEXT NOT NULL CHECK (formula <> ''),
    CONSTRAINT ecopoints_award_one_per_role UNIQUE (assignment_id, earned_as)
);

CREATE INDEX IF NOT EXISTS ecopoints_award_account_idx ON rewards.ecopoints_award (account_id);

-- Events waiting to be published to RabbitMQ.
CREATE TABLE IF NOT EXISTS rewards.outbox (
    event_id       UUID PRIMARY KEY,
    seq            BIGINT GENERATED ALWAYS AS IDENTITY,
    event_type     TEXT NOT NULL,
    event_version  INTEGER NOT NULL DEFAULT 1 CHECK (event_version >= 1),
    routing_key    TEXT NOT NULL,
    payload        JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS rewards_outbox_unpublished_idx
    ON rewards.outbox (created_at, seq) WHERE published_at IS NULL;

-- Events already handled, so a redelivered event is skipped.
CREATE TABLE IF NOT EXISTS rewards.processed_events (
    event_id      UUID PRIMARY KEY,
    processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);