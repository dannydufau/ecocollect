BEGIN;

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

-- TERMS_DOCUMENT and the account acceptance relationship.
CREATE TABLE terms_document (
    terms_id         BIGSERIAL PRIMARY KEY,
    title            TEXT NOT NULL,
    version          TEXT NOT NULL,
    applies_to_role  TEXT NOT NULL CHECK (applies_to_role IN ('resident', 'volunteer')),
    UNIQUE (applies_to_role, version)
);

CREATE TABLE terms_acceptance (
    uid          TEXT NOT NULL REFERENCES profiles (uid) ON DELETE CASCADE,
    terms_id     BIGINT NOT NULL REFERENCES terms_document (terms_id),
    accepted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (uid, terms_id)
);

-- ITEM_CATEGORY
CREATE TABLE categories (
    category_id         TEXT PRIMARY KEY,           -- e.g. 'laptops'
    name                TEXT NOT NULL,              -- e.g. 'Computers/Laptops'
    standard_weight_kg  NUMERIC(6,2) NOT NULL CHECK (standard_weight_kg > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- RECYCLING_FACILITY and the categories it accepts (ACCEPTS, many-to-many).
CREATE TABLE recycling_facility (
    facility_id  BIGSERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    street       TEXT NOT NULL,
    city         TEXT NOT NULL DEFAULT 'Calgary',
    postal_code  CHAR(6) NOT NULL
        CHECK (postal_code ~ '^T[0-9][A-Z][0-9][A-Z][0-9]$')
);

CREATE TABLE recycling_facility_category (
    facility_id  BIGINT NOT NULL REFERENCES recycling_facility (facility_id) ON DELETE CASCADE,
    category_id  TEXT NOT NULL REFERENCES categories (category_id),
    PRIMARY KEY (facility_id, category_id)
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

-- ASSIGNMENT: a volunteer's commitment to one request and one of its windows.
CREATE TABLE assignment (
    assignment_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id                   UUID NOT NULL REFERENCES pickup_request (request_id),
    volunteer_uid                TEXT NOT NULL REFERENCES profiles (uid),
    window_no                    SMALLINT NOT NULL,
    accepted_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    volunteer_safety_acknowledged BOOLEAN NOT NULL CHECK (volunteer_safety_acknowledged),
    collected_at                 TIMESTAMPTZ,
    ended_at                     TIMESTAMPTZ,
    end_reason                   TEXT
        CHECK (end_reason IN ('VolunteerCancelled', 'ResidentCancelled', 'MissedPickup')),
    FOREIGN KEY (request_id, window_no) REFERENCES pickup_window (request_id, window_no),
    CONSTRAINT assignment_end_pair CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
    CONSTRAINT assignment_not_collected_and_ended CHECK (collected_at IS NULL OR ended_at IS NULL)
);

-- At most one active assignment per request.
CREATE UNIQUE INDEX assignment_one_active_uq ON assignment (request_id) WHERE ended_at IS NULL;
CREATE INDEX assignment_volunteer_idx ON assignment (volunteer_uid, accepted_at DESC);

-- A volunteer cannot accept their own request.
CREATE FUNCTION assignment_no_self_accept() RETURNS trigger AS $$
BEGIN
    IF NEW.volunteer_uid = (SELECT resident_uid FROM pickup_request WHERE request_id = NEW.request_id) THEN
        RAISE EXCEPTION 'A volunteer cannot accept their own pickup request';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assignment_no_self_accept_trg
    BEFORE INSERT ON assignment
    FOR EACH ROW EXECUTE FUNCTION assignment_no_self_accept();

-- DELIVERY: one per assignment, made to one recycling facility.
CREATE TABLE delivery (
    delivery_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id              UUID NOT NULL UNIQUE REFERENCES assignment (assignment_id),
    request_id                 UUID NOT NULL UNIQUE REFERENCES pickup_request (request_id),
    facility_id                BIGINT NOT NULL REFERENCES recycling_facility (facility_id),
    delivered_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    at_facility_confirmed      BOOLEAN NOT NULL CHECK (at_facility_confirmed),
    items_accepted_confirmed   BOOLEAN NOT NULL CHECK (items_accepted_confirmed),
    evidence_photo             TEXT
);


-- Match each delivery to the request attached to its assignment.
CREATE FUNCTION match_delivery_request() RETURNS trigger AS $$
DECLARE assigned_request UUID;
BEGIN
    SELECT request_id INTO assigned_request FROM assignment WHERE assignment_id = NEW.assignment_id;
    IF assigned_request IS NULL THEN RAISE EXCEPTION 'Assignment not found'; END IF;
    NEW.request_id := assigned_request;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER match_delivery_request_trg
    BEFORE INSERT OR UPDATE OF assignment_id ON delivery
    FOR EACH ROW EXECUTE FUNCTION match_delivery_request();

-- POINTS_AWARD: delivery points or volunteer compensation for a Resident cancellation
-- on the Calgary-local pickup day. The application must verify eligibility;
-- cancellation points amount has not yet been agreed.
CREATE TABLE points_award (
    award_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_uid  TEXT NOT NULL REFERENCES profiles (uid),
    role           TEXT NOT NULL CHECK (role IN ('resident', 'volunteer')),
    reason         TEXT NOT NULL CHECK (reason IN ('Delivery', 'EligibleCancellation')),
    points         NUMERIC(12,4) NOT NULL CHECK (points >= 0),
    delivery_id    UUID REFERENCES delivery (delivery_id),
    assignment_id  UUID REFERENCES assignment (assignment_id),
    awarded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT points_award_one_source CHECK (
        (reason = 'Delivery' AND delivery_id IS NOT NULL AND assignment_id IS NULL)
        OR (reason = 'EligibleCancellation' AND assignment_id IS NOT NULL AND delivery_id IS NULL)
    ),
    CONSTRAINT points_award_cancellation_volunteer_only CHECK (reason = 'Delivery' OR role = 'volunteer'),
    UNIQUE (delivery_id, role),
    UNIQUE (assignment_id, role)
);

CREATE INDEX points_award_recipient_idx ON points_award (recipient_uid);

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
