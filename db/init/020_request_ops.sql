-- Request Service operational tables (schema "request_ops").
-- These are outside the course's logical model (contract section 8): the model's
-- tables live in "ecocollect608" (PR #198). Nothing here references them, so this
-- file loads with or without the course schema.

CREATE SCHEMA IF NOT EXISTS request_ops;

-- Events waiting to be published. Written in the same transaction as the change
-- they describe; the shared publisher (src/messaging/outbox.js, table option
-- 'request_ops.outbox') sends unpublished rows ORDER BY created_at, event_id.
-- payload is the whole contract 10.1 envelope, sent unchanged as the message body.
-- event_id and event_type repeat payload.eventId and payload.type because the
-- publisher sets them as AMQP messageId and type (contract 9.2); routing_key is
-- not in the envelope at all.
CREATE TABLE IF NOT EXISTS request_ops.outbox (
    event_id      UUID        NOT NULL,               -- AMQP messageId
    event_type    TEXT        NOT NULL,               -- AMQP type, e.g. 'RequestCreated'
    routing_key   TEXT        NOT NULL,               -- e.g. 'request.created'
    payload       JSONB       NOT NULL,               -- the envelope (contract 10.1)
    -- clock_timestamp(), not now(): now() is the same for every row in one
    -- transaction, so two events from one action (E6 then E9) would tie and be
    -- ordered by their random event_id. clock_timestamp() keeps insertion order.
    created_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    published_at  TIMESTAMPTZ NULL,
    CONSTRAINT outbox_pk PRIMARY KEY (event_id),
    CONSTRAINT outbox_payload_ck CHECK (jsonb_typeof(payload) = 'object'),
    -- The copies can't disagree with the envelope they came from.
    CONSTRAINT outbox_envelope_ck CHECK (
        payload->>'eventId' = event_id::text AND payload->>'type' = event_type
    )
);

-- Events this service has already handled (CleanupRequest). Inserted first in
-- the handler's transaction, so a redelivered message is skipped.
CREATE TABLE IF NOT EXISTS request_ops.processed_events (
    event_id     UUID        NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT processed_events_pk PRIMARY KEY (event_id)
);

-- Q4 Idempotency-Key: a repeat with the same key from the same resident within
-- 24 h gets the first 201 again (contract Q4, NFR06). Keys older than 24 h are
-- deleted by the service.
CREATE TABLE IF NOT EXISTS request_ops.idempotency_keys (
    resident_id     VARCHAR(50)  NOT NULL,           -- account_id (same type as the model)
    idempotency_key VARCHAR(200) NOT NULL,
    response        JSONB        NOT NULL,           -- the first 201 body
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT idempotency_keys_pk PRIMARY KEY (resident_id, idempotency_key)
);
