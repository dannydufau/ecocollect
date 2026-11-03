-- PUSH_SUBSCRIPTION: one row per browser/device a user enabled push on.
CREATE TABLE push_subscription (
    endpoint         VARCHAR(2048) PRIMARY KEY,          -- push service URL, unique per browser
    account_uid      TEXT NOT NULL
                     REFERENCES profiles (uid) ON DELETE CASCADE,
    p256dh           VARCHAR(100) NOT NULL,              -- composite Keys, flattened (1NF)
    auth             VARCHAR(32)  NOT NULL,
    expiration_time  TIMESTAMPTZ,                        -- set by the browser, often null
    user_agent       VARCHAR(255),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX push_subscription_account_idx ON push_subscription (account_uid);

