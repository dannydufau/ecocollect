SET search_path TO ecocollect608;

-- Rerunnable in development: drop this ticket's tables first, then recreate them.
DROP TABLE IF EXISTS push_subscription;
DROP TABLE IF EXISTS cleanup_record;
DROP TABLE IF EXISTS outbox;

-- =========================================
-- PUSH_SUBSCRIPTION (Notification service)
-- One row per browser/device on which a user enabled push notifications.
-- =========================================
CREATE TABLE push_subscription (
    endpoint         VARCHAR(2048) PRIMARY KEY,                       -- push service URL; unique per browser
    account_id       VARCHAR(50) NOT NULL
                     REFERENCES account (account_id) ON DELETE CASCADE, -- Satyam's account table
    p256dh           VARCHAR(100) NOT NULL,                           -- Keys (composite) flattened: browser public key
    auth             VARCHAR(32)  NOT NULL,                           -- Keys (composite) flattened: auth secret
    expiration_time  TIMESTAMPTZ,                                     -- set by the browser; often null
    user_agent       VARCHAR(255),                                    -- browser/device description
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()               -- last time the subscription was saved
);

-- Find all of a user's devices when sending a push.
CREATE INDEX push_subscription_account_idx ON push_subscription (account_id);

-- =========================================
-- CLEANUP_RECORD (Cleanup service)
-- Weak entity: at most one per pickup request, created when the request is cleaned up.
-- Request_Status and Expires_At are derived (status_change, created_at), so not stored.
-- =========================================
CREATE TABLE cleanup_record (
    request_id     UUID PRIMARY KEY
                   REFERENCES pickup_request (request_id) ON DELETE CASCADE,  -- Krunali's table: PK and FK
    cleaned_up_at  TIMESTAMPTZ NOT NULL DEFAULT now()                        -- when cleanup happened
);

-- =========================================
-- OUTBOX (messaging infrastructure; same as the app's public.outbox)
-- Events written in the same transaction as the data change; a relay publishes them
-- to RabbitMQ and sets published_at. Not an ER entity.
-- =========================================
CREATE TABLE outbox (
    event_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type     TEXT NOT NULL,                                     -- e.g. 'RequestExpired'
    event_version  INTEGER NOT NULL DEFAULT 1 CHECK (event_version >= 1),
    routing_key    TEXT NOT NULL,                                     -- e.g. 'request.expired'
    aggregate_id   UUID NOT NULL,                                     -- id of the thing the event is about (no FK)
    payload        JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at   TIMESTAMPTZ                                        -- null until the relay publishes it
);
CREATE INDEX outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL;