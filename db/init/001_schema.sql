BEGIN;

-- Oct 28 RequestCreated flow only. 
-- ACCOUNT (with RESIDENT / VOLUNTEER roles). One row per Firebase user.
CREATE TABLE profiles (
    uid            TEXT PRIMARY KEY,                -- Firebase uid
    first_name     TEXT NOT NULL,
    last_name      TEXT NOT NULL,
    public_name    TEXT NOT NULL,                   -- name shown publicly
    username       TEXT NOT NULL UNIQUE,
    email          TEXT NOT NULL UNIQUE,
    date_of_birth  DATE NOT NULL,
    roles          TEXT[] NOT NULL,                 -- mirrors the Firebase roles claim
    street         TEXT NOT NULL,
    city           TEXT NOT NULL DEFAULT 'Calgary',
    postal_code    CHAR(6) NOT NULL,                -- uppercase, no space, e.g. T2P1J9
    fsa            CHAR(3) GENERATED ALWAYS AS (substring(postal_code FROM 1 FOR 3)) STORED,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT profiles_roles_valid
        CHECK (cardinality(roles) BETWEEN 1 AND 2 AND roles <@ ARRAY['resident', 'volunteer']
               AND roles <> ARRAY['resident','resident'] AND roles <> ARRAY['volunteer','volunteer']),
    CONSTRAINT profiles_postal_code_format
        CHECK (postal_code ~ '^T[0-9][A-Z][0-9][A-Z][0-9]$'),
    CONSTRAINT profiles_adult
        CHECK (date_of_birth <= CURRENT_DATE - INTERVAL '18 years')
);

CREATE INDEX profiles_fsa_idx ON profiles (fsa);

-- VOLUNTEER preferred postal codes: at most three distinct full Calgary postal codes.
CREATE TABLE volunteer_preferred_postal_codes (
    uid          TEXT NOT NULL REFERENCES profiles (uid) ON DELETE CASCADE,
    postal_code  CHAR(6) NOT NULL
        CHECK (postal_code ~ '^T[0-9][A-Z][0-9][A-Z][0-9]$'),
    preference_slot SMALLINT NOT NULL CHECK (preference_slot BETWEEN 1 AND 3),
    PRIMARY KEY (uid, postal_code),
    UNIQUE (uid, preference_slot)
);

-- ITEM_CATEGORY
CREATE TABLE categories (
    category_id         TEXT PRIMARY KEY,           -- e.g. 'laptops'
    name                TEXT NOT NULL,              -- e.g. 'Computers/Laptops'
    standard_weight_kg  NUMERIC(6,2) NOT NULL CHECK (standard_weight_kg > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- PICKUP_REQUEST: one category per request, owned by one resident.
CREATE TABLE pickup_request (
    request_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_uid          TEXT NOT NULL REFERENCES profiles (uid),
    category_id           TEXT NOT NULL REFERENCES categories (category_id),
    quantity              INTEGER NOT NULL CHECK (quantity > 0),
    estimated_weight_kg   NUMERIC(8,2) NOT NULL CHECK (estimated_weight_kg > 0),
    item_description      TEXT,
    photo_url             TEXT,
    pickup_street         TEXT NOT NULL,
    pickup_city           TEXT NOT NULL DEFAULT 'Calgary',
    pickup_postal_code    CHAR(6) NOT NULL
        CHECK (pickup_postal_code ~ '^T[0-9][A-Z][0-9][A-Z][0-9]$'),
    pickup_instructions   TEXT,
    notes                 TEXT,
    safety_acknowledged   BOOLEAN NOT NULL CHECK (safety_acknowledged),
    status                TEXT NOT NULL DEFAULT 'Open'
        CHECK (status IN ('Open', 'Assigned', 'Collected', 'Delivered', 'Cancelled', 'Expired')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at            TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
    CONSTRAINT pickup_request_original_expiry CHECK (expires_at = created_at + INTERVAL '30 days'),
    CONSTRAINT pickup_request_other_description CHECK (category_id <> 'other-electronics' OR NULLIF(BTRIM(item_description), '') IS NOT NULL)
);


-- Estimate weight from the seeded category; never trust a weight supplied by the client.
-- Preserve the original 30-day expiry when requests are edited or reopened.
CREATE FUNCTION set_pickup_request_calculations() RETURNS trigger AS $$
DECLARE
    unit_weight NUMERIC(6,2);
BEGIN
    SELECT standard_weight_kg INTO unit_weight
    FROM categories WHERE category_id = NEW.category_id;
    IF unit_weight IS NULL THEN
        RAISE EXCEPTION 'Category does not have a standard weight: %', NEW.category_id;
    END IF;
    NEW.estimated_weight_kg := NEW.quantity * unit_weight;
    IF TG_OP = 'INSERT' THEN
        NEW.expires_at := NEW.created_at + INTERVAL '30 days';
    ELSE
        NEW.created_at := OLD.created_at;
        NEW.expires_at := OLD.expires_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pickup_request_calculations_trg
    BEFORE INSERT OR UPDATE ON pickup_request
    FOR EACH ROW EXECUTE FUNCTION set_pickup_request_calculations();

CREATE INDEX pickup_request_resident_idx ON pickup_request (resident_uid, created_at DESC);
CREATE INDEX pickup_request_open_idx ON pickup_request (created_at DESC) WHERE status = 'Open';
CREATE INDEX pickup_request_postal_idx ON pickup_request (pickup_postal_code) WHERE status = 'Open';

-- PICKUP_WINDOW (weak entity): identified by request_id + window_no.
-- Replaced windows stay as history with is_active = false.
CREATE TABLE pickup_window (
    request_id   UUID NOT NULL REFERENCES pickup_request (request_id) ON DELETE CASCADE,
    window_no    SMALLINT NOT NULL CHECK (window_no > 0),
    window_date  DATE NOT NULL,                     -- Calgary local date
    start_hour   SMALLINT NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (request_id, window_no)
);

CREATE UNIQUE INDEX pickup_window_active_date_uq
    ON pickup_window (request_id, window_date) WHERE is_active;

-- STATUS_CHANGE (weak entity): identified by request_id + change_no.
CREATE TABLE status_change (
    request_id  UUID NOT NULL REFERENCES pickup_request (request_id) ON DELETE CASCADE,
    change_no   SMALLINT NOT NULL CHECK (change_no > 0),
    status      TEXT NOT NULL
        CHECK (status IN ('Open', 'Assigned', 'Collected', 'Delivered', 'Cancelled', 'Expired')),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (request_id, change_no)
);

-- Messaging infrastructure. The notification service has no database for Oct 28, so
-- there are no notification tables here.
CREATE TABLE outbox (
    event_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type    TEXT NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1 CHECK (event_version >= 1),
    routing_key   TEXT NOT NULL,
    aggregate_id  UUID NOT NULL,
    payload       JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at  TIMESTAMPTZ
);

CREATE INDEX outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL;

-- Browser push subscriptions omitted: the project uses in-app notifications only.

COMMIT;
