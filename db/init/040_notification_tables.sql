-- Notification Service: browsers that turned on push, one row per browser.
CREATE SCHEMA IF NOT EXISTS notifications;

CREATE TABLE IF NOT EXISTS notifications.push_subscription (
    endpoint TEXT NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    expiration_time TIMESTAMPTZ NULL,
    user_agent TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT push_subscription_pk PRIMARY KEY (endpoint),
    CONSTRAINT push_subscription_fk1 FOREIGN KEY (account_id)
        REFERENCES users.account (account_id),
    CONSTRAINT push_subscription_ck1 CHECK (TRIM(endpoint) <> ''), -- TRIM = rm ws, <> '' = no empty strs
    CONSTRAINT push_subscription_ck2 CHECK (TRIM(p256dh) <> ''),
    CONSTRAINT push_subscription_ck3 CHECK (TRIM(auth) <> '')
);

-- Pushes look up all of one user's browsers. e.g. alice -> row 17, row 203..
-- Accessed in SELECT's 'WHERE account_id = $1'.  watch with "EXPLAIN SELECT * FROM notifications.push_subscription WHERE account_id = 'alice';"
CREATE INDEX IF NOT EXISTS push_subscription_account_idx
    ON notifications.push_subscription (account_id);
