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

-- REQUEST_EVENT (physical model): one row per request event received: which request, which step,
-- which user action. Several notifications can point at the same event.
CREATE TABLE IF NOT EXISTS notifications.request_event (
    pickup_request_id UUID NOT NULL,
    request_seq BIGINT NOT NULL,
    transition_id UUID NOT NULL,
    CONSTRAINT request_event_pk PRIMARY KEY (pickup_request_id, request_seq),
    CONSTRAINT request_event_fk1 FOREIGN KEY (pickup_request_id)
        REFERENCES requests.pickup_request (pickup_request_id),
    CONSTRAINT request_event_ck1 CHECK (request_seq > 0)
);

-- REQUEST_UPDATE_EVENT (physical model): why a request was edited or reopened.
CREATE TABLE IF NOT EXISTS notifications.request_update_event (
    pickup_request_id UUID NOT NULL,
    request_seq BIGINT NOT NULL,
    reason VARCHAR(10) NOT NULL,
    CONSTRAINT request_update_event_pk PRIMARY KEY (pickup_request_id, request_seq),
    CONSTRAINT request_update_event_fk1 FOREIGN KEY (pickup_request_id, request_seq)
        REFERENCES notifications.request_event (pickup_request_id, request_seq),
    CONSTRAINT request_update_event_ck1 CHECK (reason IN ('edited', 'reopened'))
);

-- REQUEST_CHANGED_FIELD (physical model): one row per field an edit changed.
CREATE TABLE IF NOT EXISTS notifications.request_changed_field (
    pickup_request_id UUID NOT NULL,
    request_seq BIGINT NOT NULL,
    field_name VARCHAR(20) NOT NULL,
    CONSTRAINT request_changed_field_pk PRIMARY KEY (pickup_request_id, request_seq, field_name),
    CONSTRAINT request_changed_field_fk1 FOREIGN KEY (pickup_request_id, request_seq)
        REFERENCES notifications.request_update_event (pickup_request_id, request_seq),
    CONSTRAINT request_changed_field_ck1 CHECK (field_name IN ('category', 'quantity', 'notes', 'windows', 'photo'))
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
        REFERENCES users.account (account_id),
    CONSTRAINT request_notification_fk3 FOREIGN KEY (pickup_request_id, request_seq)
        REFERENCES notifications.request_event (pickup_request_id, request_seq)
);

-- The notification list (N3) reads one account's notifications.
CREATE INDEX IF NOT EXISTS request_notification_account_idx
    ON notifications.request_notification (account_id);

-- AWARD_NOTIFICATION (physical model): a notification about an EcoPoints award. The recipient is
-- found through the award, so it isn't stored here.
CREATE TABLE IF NOT EXISTS notifications.award_notification (
    notification_id UUID NOT NULL,
    ecopoints_award_id UUID NOT NULL,
    CONSTRAINT award_notification_pk PRIMARY KEY (notification_id),
    CONSTRAINT award_notification_uq1 UNIQUE (ecopoints_award_id),
    CONSTRAINT award_notification_fk1 FOREIGN KEY (notification_id)
        REFERENCES notifications.notification (notification_id)
);

-- Apply the award reference on both fresh databases and existing volumes.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'notifications.award_notification'::regclass
          AND conname = 'award_notification_fk2'
    ) THEN
        ALTER TABLE notifications.award_notification
            ADD CONSTRAINT award_notification_fk2 FOREIGN KEY (ecopoints_award_id)
            REFERENCES rewards.ecopoints_award (ecopoints_award_id);
    END IF;
END;
$$;
