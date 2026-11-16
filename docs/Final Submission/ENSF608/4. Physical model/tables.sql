BEGIN;
CREATE SCHEMA ecocollect608;
SET search_path TO ecocollect608, public;

CREATE TABLE account (
    account_id VARCHAR(50) NOT NULL,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    public_name VARCHAR(80) NOT NULL,
    date_of_birth DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    deactivated_at TIMESTAMPTZ NULL,
    CONSTRAINT account_pk PRIMARY KEY (account_id),
    CONSTRAINT account_ck1 CHECK (account_id ~ '^[a-z0-9_-]{3,50}$'),
    CONSTRAINT account_ck2 CHECK (TRIM(first_name) <> ''),
    CONSTRAINT account_ck3 CHECK (TRIM(last_name) <> ''),
    CONSTRAINT account_ck4 CHECK (TRIM(public_name) <> ''),
    CONSTRAINT account_ck5 CHECK (date_of_birth <= (created_at - INTERVAL '18 years')::date),
    CONSTRAINT account_ck6 CHECK (deactivated_at IS NULL OR deactivated_at >= created_at)
);

CREATE TABLE resident (
    account_id VARCHAR(50) NOT NULL,
    street VARCHAR(255) NOT NULL,
    postal_code CHAR(6) NOT NULL,
    CONSTRAINT resident_pk PRIMARY KEY (account_id),
    CONSTRAINT resident_fk1 FOREIGN KEY (account_id)
        REFERENCES account (account_id),
    CONSTRAINT resident_ck1 CHECK (TRIM(street) <> ''),
    CONSTRAINT resident_ck2 CHECK (postal_code ~ '^T[1-4][ABCEGHJKLMNPRSTVWXYZ][0-9][ABCEGHJKLMNPRSTVWXYZ][0-9]$')
);

CREATE TABLE volunteer (
    account_id VARCHAR(50) NOT NULL,
    CONSTRAINT volunteer_pk PRIMARY KEY (account_id),
    CONSTRAINT volunteer_fk1 FOREIGN KEY (account_id)
        REFERENCES account (account_id)
);

CREATE TABLE volunteer_preferred_postal_code (
    account_id VARCHAR(50) NOT NULL,
    postal_code CHAR(6) NOT NULL,
    CONSTRAINT volunteer_preferred_postal_code_pk PRIMARY KEY (account_id, postal_code),
    CONSTRAINT volunteer_preferred_postal_code_fk1 FOREIGN KEY (account_id)
        REFERENCES volunteer (account_id),
    CONSTRAINT volunteer_preferred_postal_code_ck1 CHECK (postal_code ~ '^T[1-4][ABCEGHJKLMNPRSTVWXYZ][0-9][ABCEGHJKLMNPRSTVWXYZ][0-9]$')
);

CREATE TABLE push_subscription (
    endpoint TEXT NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    expiration_time TIMESTAMPTZ NULL,
    user_agent TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT push_subscription_pk PRIMARY KEY (endpoint),
    CONSTRAINT push_subscription_fk1 FOREIGN KEY (account_id)
        REFERENCES account (account_id),
    CONSTRAINT push_subscription_ck1 CHECK (TRIM(endpoint) <> ''),
    CONSTRAINT push_subscription_ck2 CHECK (TRIM(p256dh) <> ''),
    CONSTRAINT push_subscription_ck3 CHECK (TRIM(auth) <> '')
);

CREATE TABLE terms_document (
    terms_document_id UUID NOT NULL,
    content TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT terms_document_pk PRIMARY KEY (terms_document_id),
    CONSTRAINT terms_document_ck1 CHECK (TRIM(content) <> '')
);

CREATE TABLE terms_acceptance (
    terms_acceptance_id UUID NOT NULL,
    terms_document_id UUID NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL,
    type VARCHAR(40) NOT NULL,
    CONSTRAINT terms_acceptance_pk PRIMARY KEY (terms_acceptance_id),
    CONSTRAINT terms_acceptance_fk1 FOREIGN KEY (account_id)
        REFERENCES account (account_id),
    CONSTRAINT terms_acceptance_fk2 FOREIGN KEY (terms_document_id)
        REFERENCES terms_document (terms_document_id),
    CONSTRAINT terms_acceptance_ck1 CHECK (type IN ('AT_RESIDENT_REGISTRATION_OR_ACTIVATION', 'AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION', 'AT_RESIDENT_REQUEST_CREATION', 'AT_VOLUNTEER_ACCEPTANCE'))
);

CREATE TABLE item_category (
    category_id TEXT NOT NULL,
    name VARCHAR(120) NOT NULL,
    waste_type VARCHAR(120) NOT NULL,
    standard_weight_kg NUMERIC(10,2) NOT NULL,
    CONSTRAINT item_category_pk PRIMARY KEY (category_id),
    CONSTRAINT item_category_ck1 CHECK (TRIM(category_id) <> ''),
    CONSTRAINT item_category_ck2 CHECK (TRIM(name) <> ''),
    CONSTRAINT item_category_ck3 CHECK (TRIM(waste_type) <> ''),
    CONSTRAINT item_category_ck4 CHECK (standard_weight_kg > 0)
);

CREATE TABLE photo (
    file_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    CONSTRAINT photo_pk PRIMARY KEY (file_id),
    CONSTRAINT photo_ck1 CHECK (TRIM(file_id) <> ''),
    CONSTRAINT photo_ck2 CHECK (TRIM(file_path) <> '')
);

CREATE TABLE pickup_request (
    pickup_request_id UUID NOT NULL,
    category_id TEXT NOT NULL,
    terms_acceptance_id UUID NOT NULL,
    quantity INTEGER NOT NULL,
    estimated_weight_kg NUMERIC(22,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    request_seq BIGINT NOT NULL,
    pickup_street VARCHAR(255) NOT NULL,
    pickup_postal_code CHAR(6) NOT NULL,
    notes TEXT NULL,
    file_id TEXT NULL,
    rescheduled_from_request_id UUID NULL,
    CONSTRAINT pickup_request_pk PRIMARY KEY (pickup_request_id),
    CONSTRAINT pickup_request_uq1 UNIQUE (rescheduled_from_request_id),
    CONSTRAINT pickup_request_fk1 FOREIGN KEY (category_id)
        REFERENCES item_category (category_id),
    CONSTRAINT pickup_request_fk2 FOREIGN KEY (file_id)
        REFERENCES photo (file_id),
    CONSTRAINT pickup_request_fk3 FOREIGN KEY (rescheduled_from_request_id)
        REFERENCES pickup_request (pickup_request_id),
    CONSTRAINT pickup_request_fk4 FOREIGN KEY (terms_acceptance_id)
        REFERENCES terms_acceptance (terms_acceptance_id),
    CONSTRAINT pickup_request_ck1 CHECK (quantity > 0),
    CONSTRAINT pickup_request_ck2 CHECK (estimated_weight_kg > 0),
    CONSTRAINT pickup_request_ck3 CHECK (request_seq > 0),
    CONSTRAINT pickup_request_ck4 CHECK (TRIM(pickup_street) <> ''),
    CONSTRAINT pickup_request_ck5 CHECK (pickup_postal_code ~ '^T[1-4][ABCEGHJKLMNPRSTVWXYZ][0-9][ABCEGHJKLMNPRSTVWXYZ][0-9]$'),
    CONSTRAINT pickup_request_ck6 CHECK (rescheduled_from_request_id IS NULL OR rescheduled_from_request_id <> pickup_request_id)
);

CREATE TABLE pickup_window (
    pickup_window_id UUID NOT NULL,
    pickup_request_id UUID NOT NULL,
    pickup_date DATE NOT NULL,
    start_hour SMALLINT NOT NULL,
    is_active BOOLEAN NOT NULL,
    CONSTRAINT pickup_window_pk PRIMARY KEY (pickup_window_id),
    CONSTRAINT pickup_window_fk1 FOREIGN KEY (pickup_request_id)
        REFERENCES pickup_request (pickup_request_id),
    CONSTRAINT pickup_window_ck1 CHECK (start_hour BETWEEN 0 AND 23)
);

CREATE TABLE status_change (
    pickup_request_id UUID NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL,
    reason TEXT NULL,
    CONSTRAINT status_change_pk PRIMARY KEY (pickup_request_id, changed_at),
    CONSTRAINT status_change_fk1 FOREIGN KEY (pickup_request_id)
        REFERENCES pickup_request (pickup_request_id),
    CONSTRAINT status_change_ck1 CHECK (status IN ('Open', 'Assigned', 'Collected', 'Delivered', 'Cancelled', 'Expired', 'Missed'))
);

CREATE TABLE assignment (
    assignment_id UUID NOT NULL,
    pickup_window_id UUID NOT NULL,
    terms_acceptance_id UUID NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL,
    collected_at TIMESTAMPTZ NULL,
    ended_at TIMESTAMPTZ NULL,
    end_reason VARCHAR(30) NULL,
    CONSTRAINT assignment_pk PRIMARY KEY (assignment_id),
    CONSTRAINT assignment_fk1 FOREIGN KEY (terms_acceptance_id)
        REFERENCES terms_acceptance (terms_acceptance_id),
    CONSTRAINT assignment_fk2 FOREIGN KEY (pickup_window_id)
        REFERENCES pickup_window (pickup_window_id),
    CONSTRAINT assignment_ck1 CHECK (collected_at IS NULL OR collected_at >= accepted_at),
    CONSTRAINT assignment_ck2 CHECK ((ended_at IS NULL AND end_reason IS NULL) OR (ended_at IS NOT NULL AND end_reason IS NOT NULL)),
    CONSTRAINT assignment_ck3 CHECK (ended_at IS NULL OR ended_at >= accepted_at),
    CONSTRAINT assignment_ck4 CHECK (ended_at IS NULL OR collected_at IS NULL OR ended_at >= collected_at),
    CONSTRAINT assignment_ck5 CHECK (end_reason IS NULL OR end_reason IN ('Delivered', 'Resident_Cancelled', 'Volunteer_Cancelled', 'Missed_Pickup')),
    CONSTRAINT assignment_ck6 CHECK (end_reason IS DISTINCT FROM 'Delivered' OR collected_at IS NOT NULL)
);

CREATE TABLE recycling_facility (
    facility_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    street VARCHAR(255) NOT NULL,
    postal_code CHAR(6) NOT NULL,
    special_instructions TEXT NULL,
    CONSTRAINT recycling_facility_pk PRIMARY KEY (facility_id),
    CONSTRAINT recycling_facility_ck1 CHECK (TRIM(name) <> ''),
    CONSTRAINT recycling_facility_ck2 CHECK (TRIM(street) <> ''),
    CONSTRAINT recycling_facility_ck3 CHECK (postal_code ~ '^T[1-4][ABCEGHJKLMNPRSTVWXYZ][0-9][ABCEGHJKLMNPRSTVWXYZ][0-9]$')
);

CREATE TABLE facility_accepts (
    facility_id UUID NOT NULL,
    category_id TEXT NOT NULL,
    CONSTRAINT facility_accepts_pk PRIMARY KEY (facility_id, category_id),
    CONSTRAINT facility_accepts_fk1 FOREIGN KEY (category_id)
        REFERENCES item_category (category_id),
    CONSTRAINT facility_accepts_fk2 FOREIGN KEY (facility_id)
        REFERENCES recycling_facility (facility_id)
);

CREATE TABLE delivery (
    delivery_id UUID NOT NULL,
    assignment_id UUID NOT NULL,
    facility_id UUID NOT NULL,
    file_id TEXT NOT NULL,
    CONSTRAINT delivery_pk PRIMARY KEY (delivery_id),
    CONSTRAINT delivery_uq1 UNIQUE (assignment_id),
    CONSTRAINT delivery_uq2 UNIQUE (file_id),
    CONSTRAINT delivery_fk1 FOREIGN KEY (assignment_id)
        REFERENCES assignment (assignment_id),
    CONSTRAINT delivery_fk2 FOREIGN KEY (facility_id)
        REFERENCES recycling_facility (facility_id),
    CONSTRAINT delivery_fk3 FOREIGN KEY (file_id)
        REFERENCES photo (file_id)
);

CREATE TABLE ecopoints_award (
    ecopoints_award_id UUID NOT NULL,
    assignment_id UUID NOT NULL,
    points NUMERIC(23,2) NOT NULL,
    formula TEXT NOT NULL,
    CONSTRAINT ecopoints_award_pk PRIMARY KEY (ecopoints_award_id),
    CONSTRAINT ecopoints_award_fk1 FOREIGN KEY (assignment_id)
        REFERENCES assignment (assignment_id),
    CONSTRAINT ecopoints_award_ck1 CHECK (points > 0),
    CONSTRAINT ecopoints_award_ck2 CHECK (TRIM(formula) <> '')
);

CREATE TABLE resident_award (
    ecopoints_award_id UUID NOT NULL,
    CONSTRAINT resident_award_pk PRIMARY KEY (ecopoints_award_id),
    CONSTRAINT resident_award_fk1 FOREIGN KEY (ecopoints_award_id)
        REFERENCES ecopoints_award (ecopoints_award_id)
);

CREATE TABLE volunteer_award (
    ecopoints_award_id UUID NOT NULL,
    CONSTRAINT volunteer_award_pk PRIMARY KEY (ecopoints_award_id),
    CONSTRAINT volunteer_award_fk1 FOREIGN KEY (ecopoints_award_id)
        REFERENCES ecopoints_award (ecopoints_award_id)
);

CREATE TABLE notification (
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

CREATE TABLE request_event (
    pickup_request_id UUID NOT NULL,
    request_seq BIGINT NOT NULL,
    transition_id UUID NOT NULL,
    CONSTRAINT request_event_pk PRIMARY KEY (pickup_request_id, request_seq),
    CONSTRAINT request_event_fk1 FOREIGN KEY (pickup_request_id)
        REFERENCES pickup_request (pickup_request_id),
    CONSTRAINT request_event_ck1 CHECK (request_seq > 0)
);

CREATE TABLE request_update_event (
    pickup_request_id UUID NOT NULL,
    request_seq BIGINT NOT NULL,
    reason VARCHAR(10) NOT NULL,
    CONSTRAINT request_update_event_pk PRIMARY KEY (pickup_request_id, request_seq),
    CONSTRAINT request_update_event_fk1 FOREIGN KEY (pickup_request_id, request_seq)
        REFERENCES request_event (pickup_request_id, request_seq),
    CONSTRAINT request_update_event_ck1 CHECK (reason IN ('edited', 'reopened'))
);

CREATE TABLE request_changed_field (
    pickup_request_id UUID NOT NULL,
    request_seq BIGINT NOT NULL,
    field_name VARCHAR(20) NOT NULL,
    CONSTRAINT request_changed_field_pk PRIMARY KEY (pickup_request_id, request_seq, field_name),
    CONSTRAINT request_changed_field_fk1 FOREIGN KEY (pickup_request_id, request_seq)
        REFERENCES request_update_event (pickup_request_id, request_seq),
    CONSTRAINT request_changed_field_ck1 CHECK (field_name IN ('category', 'quantity', 'notes', 'windows', 'photo'))
);

CREATE TABLE request_notification (
    notification_id UUID NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    pickup_request_id UUID NOT NULL,
    request_seq BIGINT NOT NULL,
    CONSTRAINT request_notification_pk PRIMARY KEY (notification_id),
    CONSTRAINT request_notification_fk1 FOREIGN KEY (notification_id)
        REFERENCES notification (notification_id),
    CONSTRAINT request_notification_fk2 FOREIGN KEY (account_id)
        REFERENCES account (account_id),
    CONSTRAINT request_notification_fk3 FOREIGN KEY (pickup_request_id, request_seq)
        REFERENCES request_event (pickup_request_id, request_seq)
);

CREATE TABLE award_notification (
    notification_id UUID NOT NULL,
    ecopoints_award_id UUID NOT NULL,
    CONSTRAINT award_notification_pk PRIMARY KEY (notification_id),
    CONSTRAINT award_notification_uq1 UNIQUE (ecopoints_award_id),
    CONSTRAINT award_notification_fk1 FOREIGN KEY (notification_id)
        REFERENCES notification (notification_id),
    CONSTRAINT award_notification_fk2 FOREIGN KEY (ecopoints_award_id)
        REFERENCES ecopoints_award (ecopoints_award_id)
);

COMMIT;
