CREATE SCHEMA IF NOT EXISTS ecocollect608;

SET
    search_path TO ecocollect608;

-- account_id is the key. It is the username the person picks, which is also their Firebase uid.
-- It is readable, unique and never changes, so there is no second id to keep in sync.
CREATE TABLE
    account (
        account_id TEXT PRIMARY KEY CHECK (
            btrim(account_id) <> ''
            AND char_length(account_id) <= 50
        ),
        public_name VARCHAR(50) NOT NULL CHECK (btrim(public_name) <> ''),
        first_name VARCHAR(50) NOT NULL CHECK (btrim(first_name) <> ''),
        last_name VARCHAR(50) NOT NULL CHECK (btrim(last_name) <> ''),
        date_of_birth DATE NOT NULL CHECK (date_of_birth <= CURRENT_DATE - INTERVAL '18 years')
    );

-- A resident is an account with the Resident role. Having a row here is what "active" means.
-- Accounts are deactivated, not deleted, so there is no cascade from account.
CREATE TABLE
    resident (
        account_id TEXT PRIMARY KEY REFERENCES account (account_id) ON DELETE RESTRICT,
        street VARCHAR(100) NOT NULL CHECK (btrim(street) <> ''),
        postal_code CHAR(6) NOT NULL CHECK (postal_code ~ '^T[0-9][A-Z][0-9][A-Z][0-9]$')
    );

-- Same idea for the Volunteer role. An account with both roles has a row in both tables.
CREATE TABLE
    volunteer (
        account_id TEXT PRIMARY KEY REFERENCES account (account_id) ON DELETE RESTRICT
    );

-- Preferred_Postal_Code is multivalued, so it gets its own table.
-- The slot (1 to 3) is what limits a volunteer to three codes.
CREATE TABLE
    volunteer_preferred_postal_code (
        account_id TEXT NOT NULL REFERENCES volunteer (account_id) ON DELETE CASCADE,
        postal_code CHAR(6) NOT NULL CHECK (postal_code ~ '^T[0-9][A-Z][0-9][A-Z][0-9]$'),
        preference_slot SMALLINT NOT NULL CHECK (preference_slot BETWEEN 1 AND 3),
        PRIMARY KEY (account_id, postal_code),
        UNIQUE (account_id, preference_slot)
    );
