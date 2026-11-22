-- Request Service course tables, in its own schema "requests" (contract 2.1 and 8:
-- the Request Service is the only writer of these tables). The definitions are the
-- 608 physical model's (docs/Final Submission/ENSF608/4. Physical model/tables.sql),
-- with the same names and constraints. Only the schema changes: the two foreign
-- keys to terms_acceptance point at "users", which 005_user_tables.sql creates.
-- The service's operational tables, functions and login are in db/request/.

CREATE SCHEMA IF NOT EXISTS requests;
SET search_path TO requests, pg_catalog;

CREATE TABLE IF NOT EXISTS item_category (
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

CREATE TABLE IF NOT EXISTS photo (
    file_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    CONSTRAINT photo_pk PRIMARY KEY (file_id),
    CONSTRAINT photo_ck1 CHECK (TRIM(file_id) <> ''),
    CONSTRAINT photo_ck2 CHECK (TRIM(file_path) <> '')
);

CREATE TABLE IF NOT EXISTS pickup_request (
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
        REFERENCES users.terms_acceptance (terms_acceptance_id),
    CONSTRAINT pickup_request_ck1 CHECK (quantity > 0),
    CONSTRAINT pickup_request_ck2 CHECK (estimated_weight_kg > 0),
    CONSTRAINT pickup_request_ck3 CHECK (request_seq > 0),
    CONSTRAINT pickup_request_ck4 CHECK (TRIM(pickup_street) <> ''),
    CONSTRAINT pickup_request_ck5 CHECK (pickup_postal_code ~ '^T[0-9][A-Z][0-9][A-Z][0-9]$'),
    CONSTRAINT pickup_request_ck6 CHECK (rescheduled_from_request_id IS NULL OR rescheduled_from_request_id <> pickup_request_id)
);

CREATE TABLE IF NOT EXISTS pickup_window (
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

CREATE TABLE IF NOT EXISTS status_change (
    pickup_request_id UUID NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL,
    reason TEXT NULL,
    CONSTRAINT status_change_pk PRIMARY KEY (pickup_request_id, changed_at),
    CONSTRAINT status_change_fk1 FOREIGN KEY (pickup_request_id)
        REFERENCES pickup_request (pickup_request_id),
    CONSTRAINT status_change_ck1 CHECK (status IN ('Open', 'Assigned', 'Collected', 'Delivered', 'Cancelled', 'Expired', 'Missed'))
);

CREATE TABLE IF NOT EXISTS assignment (
    assignment_id UUID NOT NULL,
    pickup_window_id UUID NOT NULL,
    terms_acceptance_id UUID NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL,
    collected_at TIMESTAMPTZ NULL,
    ended_at TIMESTAMPTZ NULL,
    end_reason VARCHAR(30) NULL,
    CONSTRAINT assignment_pk PRIMARY KEY (assignment_id),
    CONSTRAINT assignment_fk1 FOREIGN KEY (terms_acceptance_id)
        REFERENCES users.terms_acceptance (terms_acceptance_id),
    CONSTRAINT assignment_fk2 FOREIGN KEY (pickup_window_id)
        REFERENCES pickup_window (pickup_window_id),
    CONSTRAINT assignment_ck1 CHECK (collected_at IS NULL OR collected_at >= accepted_at),
    CONSTRAINT assignment_ck2 CHECK ((ended_at IS NULL AND end_reason IS NULL) OR (ended_at IS NOT NULL AND end_reason IS NOT NULL)),
    CONSTRAINT assignment_ck3 CHECK (ended_at IS NULL OR ended_at >= accepted_at),
    CONSTRAINT assignment_ck4 CHECK (ended_at IS NULL OR collected_at IS NULL OR ended_at >= collected_at),
    CONSTRAINT assignment_ck5 CHECK (end_reason IS NULL OR end_reason IN ('Delivered', 'Resident_Cancelled', 'Volunteer_Cancelled', 'Missed_Pickup')),
    CONSTRAINT assignment_ck6 CHECK (end_reason IS DISTINCT FROM 'Delivered' OR collected_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS recycling_facility (
    facility_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    street VARCHAR(255) NOT NULL,
    postal_code CHAR(6) NOT NULL,
    special_instructions TEXT NULL,
    CONSTRAINT recycling_facility_pk PRIMARY KEY (facility_id),
    CONSTRAINT recycling_facility_ck1 CHECK (TRIM(name) <> ''),
    CONSTRAINT recycling_facility_ck2 CHECK (TRIM(street) <> ''),
    CONSTRAINT recycling_facility_ck3 CHECK (postal_code ~ '^T[0-9][A-Z][0-9][A-Z][0-9]$')
);

CREATE TABLE IF NOT EXISTS facility_accepts (
    facility_id UUID NOT NULL,
    category_id TEXT NOT NULL,
    CONSTRAINT facility_accepts_pk PRIMARY KEY (facility_id, category_id),
    CONSTRAINT facility_accepts_fk1 FOREIGN KEY (category_id)
        REFERENCES item_category (category_id),
    CONSTRAINT facility_accepts_fk2 FOREIGN KEY (facility_id)
        REFERENCES recycling_facility (facility_id)
);

CREATE TABLE IF NOT EXISTS delivery (
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
