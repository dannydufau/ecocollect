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

-- NOTIFICATION (physical model): what every notification has. Title, body and url are built when read.
CREATE TABLE IF NOT EXISTS notifications.notification (
    notification_id UUID NOT NULL,
    type VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    pushed_at TIMESTAMPTZ NULL,
    is_read BOOLEAN NOT NULL,
    is_expired BOOLEAN NOT NULL,
    CONSTRAINT notification_pk PRIMARY KEY (notification_id),
    CONSTRAINT notification_ck1 CHECK (type IN ('REQUEST_CREATED', 'NEW_MATCHING_REQUEST', 'REQUEST_UPDATED_RESIDENT', 'REQUEST_ASSIGNED_RESIDENT', 'REQUEST_ASSIGNED_VOLUNTEER', 'REQUEST_COLLECTED_RESIDENT', 'REQUEST_COLLECTED_VOLUNTEER', 'REQUEST_DELIVERED_RESIDENT', 'REQUEST_DELIVERED_VOLUNTEER', 'ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT', 'ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER', 'ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT', 'ASSIGNMENT_CANCELLED_BY_VOLUNTEER_VOLUNTEER', 'ASSIGNMENT_MISSED_RESIDENT', 'ASSIGNMENT_MISSED_VOLUNTEER', 'REQUEST_CANCELLED_RESIDENT', 'REQUEST_EXPIRED_RESIDENT', 'ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT', 'ECOPOINTS_AWARDED_ON_DELIVERY_VOLUNTEER', 'ECOPOINTS_AWARDED_ON_ASSIGNMENT_CANCELLATION_VOLUNTEER')),
    CONSTRAINT notification_ck2 CHECK (pushed_at IS NULL OR pushed_at >= created_at)
);

-- REQUEST_NOTIFICATION (physical model): a notification about a request, and who receives it.
CREATE TABLE IF NOT EXISTS notifications.request_notification (
    notification_id UUID NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    pickup_request_id UUID NOT NULL,
    request_seq BIGINT NOT NULL,
    CONSTRAINT request_notification_pk PRIMARY KEY (notification_id),
    CONSTRAINT request_notification_fk1 FOREIGN KEY (notification_id)
        REFERENCES notifications.notification (notification_id),
    CONSTRAINT request_notification_fk2 FOREIGN KEY (account_id)
        REFERENCES users.account (account_id)
    -- request_notification_fk3 (pickup_request_id, request_seq) -> request_event: add when the
    -- Request Service's tables are in db/init.
);

-- The notification list (N3) reads one account's notifications.
CREATE INDEX IF NOT EXISTS request_notification_account_idx
    ON notifications.request_notification (account_id);

