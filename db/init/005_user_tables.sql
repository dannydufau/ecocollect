CREATE SCHEMA IF NOT EXISTS users;
SET search_path TO users, pg_catalog;

CREATE TABLE IF NOT EXISTS account (
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
    CONSTRAINT account_ck5 CHECK (date_of_birth <= ((created_at AT TIME ZONE 'America/Edmonton') - INTERVAL '18 years')::date),
    CONSTRAINT account_ck6 CHECK (deactivated_at IS NULL OR deactivated_at >= created_at)
);

CREATE TABLE IF NOT EXISTS resident (
    account_id VARCHAR(50) NOT NULL,
    street VARCHAR(255) NOT NULL,
    postal_code CHAR(6) NOT NULL,
    CONSTRAINT resident_pk PRIMARY KEY (account_id),
    CONSTRAINT resident_fk1 FOREIGN KEY (account_id)
        REFERENCES account (account_id),
    CONSTRAINT resident_ck1 CHECK (TRIM(street) <> ''),
    CONSTRAINT resident_ck2 CHECK (postal_code ~ '^T[0-9][A-Z][0-9][A-Z][0-9]$')
);

CREATE TABLE IF NOT EXISTS volunteer (
    account_id VARCHAR(50) NOT NULL,
    CONSTRAINT volunteer_pk PRIMARY KEY (account_id),
    CONSTRAINT volunteer_fk1 FOREIGN KEY (account_id)
        REFERENCES account (account_id)
);

CREATE TABLE IF NOT EXISTS volunteer_preferred_postal_code (
    account_id VARCHAR(50) NOT NULL,
    postal_code CHAR(6) NOT NULL,
    CONSTRAINT volunteer_preferred_postal_code_pk PRIMARY KEY (account_id, postal_code),
    CONSTRAINT volunteer_preferred_postal_code_fk1 FOREIGN KEY (account_id)
        REFERENCES volunteer (account_id),
    CONSTRAINT volunteer_preferred_postal_code_ck1 CHECK (postal_code ~ '^T[0-9][A-Z][0-9][A-Z][0-9]$')
);

CREATE TABLE IF NOT EXISTS terms_document (
    terms_document_id UUID NOT NULL,
    content TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT terms_document_pk PRIMARY KEY (terms_document_id),
    CONSTRAINT terms_document_ck1 CHECK (TRIM(content) <> '')
);

CREATE TABLE IF NOT EXISTS terms_acceptance (
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

