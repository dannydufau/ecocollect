-- EcoCollect schema for the Oct 28 demo flow:
-- a resident creates a pickup request; volunteers in the same FSA are notified.
-- Owned by the request service. The notification service has no tables for Oct 28.

BEGIN;

-- Seeded users, keyed by Firebase uid. Read-only for Oct 28 (seed script writes it).
CREATE TABLE profiles (
    uid           TEXT PRIMARY KEY,                 -- Firebase uid
    display_name  TEXT NOT NULL,
    roles         TEXT[] NOT NULL,                  -- mirrors the Firebase roles claim
    street        TEXT NOT NULL,
    city          TEXT NOT NULL DEFAULT 'Calgary',
    postal_code   CHAR(6) NOT NULL,                 -- normalized: uppercase, no space, e.g. T2P1J9
    fsa           CHAR(3) GENERATED ALWAYS AS (substring(postal_code FROM 1 FOR 3)) STORED,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT profiles_roles_valid
        CHECK (cardinality(roles) > 0 AND roles <@ ARRAY['resident', 'volunteer']),
    CONSTRAINT profiles_postal_code_format
        CHECK (postal_code ~ '^[A-Z][0-9][A-Z][0-9][A-Z][0-9]$')
);

-- Volunteer pooling: SELECT uid FROM profiles WHERE fsa = $1 AND 'volunteer' = ANY(roles) AND uid <> $2
CREATE INDEX profiles_fsa_idx ON profiles (fsa);

-- Seeded reference data. Ids must match the shared CategoryId list in contracts/.
CREATE TABLE categories (
    category_id         TEXT PRIMARY KEY,           -- e.g. 'laptops'
    name                TEXT NOT NULL,              -- e.g. 'Computers/Laptops'
    standard_weight_kg  NUMERIC(6,2) NOT NULL CHECK (standard_weight_kg > 0)
);

-- One row per pickup request (one category per request).
CREATE TABLE pickup_request (
    request_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_uid         TEXT NOT NULL REFERENCES profiles (uid),
    category_id          TEXT NOT NULL REFERENCES categories (category_id),
    quantity             INTEGER NOT NULL CHECK (quantity > 0),
    estimated_weight_kg  NUMERIC(8,2) NOT NULL CHECK (estimated_weight_kg >= 0),  -- quantity x standard weight, snapshot at creation
    notes                TEXT,
    status               TEXT NOT NULL DEFAULT 'Open'
        CHECK (status IN ('Open', 'Assigned', 'Collected', 'Delivered', 'Cancelled')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at           TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days'
);

CREATE INDEX pickup_request_resident_idx ON pickup_request (resident_uid, created_at DESC);  -- view=mine
CREATE INDEX pickup_request_open_idx ON pickup_request (created_at DESC) WHERE status = 'Open'; -- view=available

-- 1 to 3 one-hour windows per request, on distinct Calgary calendar dates.
-- The 1-3 count and "in the future" rules are enforced by the request service.
CREATE TABLE pickup_window (
    request_id   UUID NOT NULL REFERENCES pickup_request (request_id) ON DELETE CASCADE,
    window_date  DATE NOT NULL,                     -- Calgary local date, no time zone
    start_hour   SMALLINT NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
    PRIMARY KEY (request_id, window_date)
);

-- Transactional outbox: written in the same transaction as pickup_request,
-- published to RabbitMQ by the relay, marked published only after the broker confirms.
CREATE TABLE outbox (
    event_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),   -- sent as the AMQP messageId
    event_type    TEXT NOT NULL,                                -- e.g. 'RequestCreated'
    routing_key   TEXT NOT NULL,                                -- e.g. 'request.created'
    aggregate_id  UUID NOT NULL,                                -- request_id the event is about
    payload       JSONB NOT NULL,                               -- full event; never a street address
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at  TIMESTAMPTZ
);

-- Relay poll: SELECT ... WHERE published_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED
CREATE INDEX outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL;

COMMIT;