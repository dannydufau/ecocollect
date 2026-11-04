-- FALLBACK DEMO: runs against the app's public schema (Oct 28 tables), not ecocollect608.
-- Rerunnable in development: drop this ticket's tables first, then recreate them.
-- (Only these two tables; nothing else depends on them.)
DROP TABLE IF EXISTS push_subscription;
DROP TABLE IF EXISTS cleanup_record;

-- =========================================
-- PUSH_SUBSCRIPTION (Notification service)
-- One row per browser/device on which a user enabled push notifications.
-- =========================================
CREATE TABLE push_subscription (
    endpoint         VARCHAR(2048) PRIMARY KEY,                     -- push service URL; unique per browser
    account_uid      TEXT NOT NULL
                     REFERENCES profiles (uid) ON DELETE CASCADE,   -- owning account (Firebase uid)
    p256dh           VARCHAR(100) NOT NULL,                         -- Keys (composite) flattened: browser public key
    auth             VARCHAR(32)  NOT NULL,                         -- Keys (composite) flattened: auth secret
    expiration_time  TIMESTAMPTZ,                                   -- set by the browser; often null
    user_agent       VARCHAR(255),                                  -- browser/device description
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()             -- last time the subscription was saved
);

-- Find all of a user's devices when sending a push.
CREATE INDEX push_subscription_account_idx ON push_subscription (account_uid);

-- =========================================
-- CLEANUP_RECORD (Cleanup service)
-- Weak entity: at most one per pickup request, created when the request is cleaned up.
-- Request_Status and Expires_At are derived from pickup_request, so they are not stored.
-- =========================================
CREATE TABLE cleanup_record (
    request_id     UUID PRIMARY KEY
                   REFERENCES pickup_request (request_id) ON DELETE CASCADE,  -- owner's key: PK and FK
    cleaned_up_at  TIMESTAMPTZ NOT NULL DEFAULT now()                        -- when cleanup happened
);
