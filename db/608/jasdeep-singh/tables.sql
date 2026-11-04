SET
    search_path TO ecocollect608;

-- Stub tables so FKs work
CREATE TYPE account_role AS ENUM ('resident', 'volunteer');

CREATE TABLE
    account (username VARCHAR(50) PRIMARY KEY);

CREATE TABLE
    assignment (id INT PRIMARY KEY);

CREATE TABLE
    pickup_request (id UUID PRIMARY KEY);

-- Normal tables (not stubs)
CREATE TABLE
    terms_document (
        id INT PRIMARY KEY,
        content TEXT NOT NULL,
        published_at TIMESTAMPTZ NOT NULL
    );

CREATE TYPE terms_acceptance_type AS ENUM (
    'AT_RESIDENT_REGISTRATION_OR_ACTIVATION',
    'AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION',
    'AT_RESIDENT_REQUEST_CREATION',
    'AT_VOLUNTEER_ACCEPTANCE'
);

CREATE TABLE
    terms_acceptance (
        id INT PRIMARY KEY,
        terms_doc_id INT NOT NULL,
        username VARCHAR(50) NOT NULL,
        accepted_at TIMESTAMPTZ NOT NULL,
        type terms_acceptance_type NOT NULL,
        FOREIGN KEY (terms_doc_id) REFERENCES terms_document (id),
        FOREIGN KEY (username) REFERENCES account (username)
    );

CREATE TYPE ecopoints_formula AS ENUM (
    '(3 x Quantity) + (4 x Estimated_Weight_Kg)', -- volunteer default formula
    '((3 x Quantity) + (4 x Estimated_Weight_Kg)) ÷ 2' -- resident default formula
);

CREATE TABLE
    ecopoints_award (
        id INT PRIMARY KEY,
        assignment_id INT NOT NULL,
        username VARCHAR(50) NOT NULL,
        points INT NOT NULL,
        formula ecopoints_formula NOT NULL,
        role account_role NOT NULL,
        FOREIGN KEY (assignment_id) REFERENCES assignment (id),
        FOREIGN KEY (username) REFERENCES account (username)
    );

CREATE TYPE notification_type AS ENUM (
    'REQUEST_CREATED', --  status: Open, recipient: resident (themself) (no push needed)
    'NEW_MATCHING_REQUEST', -- status: Open, recipient: matching volunteers (except the resident themselves)
    'REQUEST_ASSIGNED_RESIDENT', -- status: Assigned, recipient: resident
    'REQUEST_ASSIGNED_VOLUNTEER', -- status: Assigned, recipient: volunteer (no push needed, volunteer marked assigned)
    'REQUEST_COLLECTED_RESIDENT', -- status: Collected, recipient: resident (no push needed, resident marked collected)
    'REQUEST_COLLECTED_VOLUNTEER', -- status: Collected, recipient: volunteer
    'REQUEST_DELIVERED_RESIDENT', -- status: Delivered, recipient: resident
    'REQUEST_DELIVERED_VOLUNTEER', -- status: Delivered, recipient: volunteer (no push needed, volunteer marked delivered)
    'REQUEST_CANCELLED_RESIDENT', -- status: Cancelled, recipient: resident (no push needed, resident marked cancelled)
    'REQUEST_CANCELLED_VOLUNTEER', -- status: Cancelled, recipient: volunteer
    'REQUEST_EXPIRED_RESIDENT', -- status: Expired, recipient: resident
    -- no corresponding event for volunteer
    'ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT', -- assignment cancelled by resident, recipient: resident (no push needed for self action)
    'ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER', -- assignment cancelled by resident, recipient: volunteer
    'ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT', -- assignment cancelled by volunteer, recipient: resident
    'ASSIGNMENT_CANCELLED_BY_VOLUNTEER_VOLUNTEER', -- assignment cancelled by volunteer, recipient: volunteer (no push needed for self action)
    'ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT',
    'ECOPOINTS_AWARDED_ON_DELIVERY_VOLUNTEER',
    'ECOPOINTS_AWARDED_ON_ASSIGNMENT_CANCELLATION_VOLUNTEER'
);

CREATE TABLE
    notification (
        id INT PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        pickup_request_id UUID NOT NULL,
        ecopoints_award_id INT UNIQUE,
        type notification_type NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        metadata JSONB,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        FOREIGN KEY (username) REFERENCES account (username),
        FOREIGN KEY (pickup_request_id) REFERENCES pickup_request (id),
        FOREIGN KEY (ecopoints_award_id) REFERENCES ecopoints_award (id)
    );