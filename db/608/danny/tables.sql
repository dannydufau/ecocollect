-- =========================================
-- OUTBOX (messaging infrastructure; same as the app's public.outbox)
-- Events written in the same transaction as the data change; a relay publishes them
-- to RabbitMQ and sets published_at.
-- =========================================
DROP TABLE IF EXISTS outbox;
CREATE TABLE outbox (
    event_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type     TEXT NOT NULL,                                     -- e.g. 'RequestExpired'
    event_version  INTEGER NOT NULL DEFAULT 1 CHECK (event_version >= 1),
    routing_key    TEXT NOT NULL,                                     -- e.g. 'request.expired'
    aggregate_id   UUID NOT NULL,                                     -- id of the thing the event is about
    payload        JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at   TIMESTAMPTZ                                        -- null until the relay publishes it
);
CREATE INDEX outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL;