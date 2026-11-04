-- EcoCollect - Issue #71: PostgreSQL tables
-- Run after the team's public.resident and public.terms_acceptance tables exist.
-- These tables stay in a separate schema until team integration.

BEGIN;

-- Check required tables and ID types before creating anything.
DO $preflight$
DECLARE
    resident_id_type TEXT;
    acceptance_id_type TEXT;
BEGIN
    IF to_regnamespace('krunali_issue71') IS NOT NULL THEN
        RAISE EXCEPTION 'krunali_issue71 already exists; no changes made';
    END IF;

    IF to_regclass('public.resident') IS NULL THEN
        RAISE EXCEPTION 'Missing public.resident; no changes made';
    END IF;

    IF to_regclass('public.terms_acceptance') IS NULL THEN
        RAISE EXCEPTION 'Missing public.terms_acceptance; no changes made';
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod)
      INTO resident_id_type
      FROM pg_attribute a
     WHERE a.attrelid = 'public.resident'::regclass
       AND a.attname = 'account_id'
       AND a.attnum > 0 AND NOT a.attisdropped;

    SELECT format_type(a.atttypid, a.atttypmod)
      INTO acceptance_id_type
      FROM pg_attribute a
     WHERE a.attrelid = 'public.terms_acceptance'::regclass
       AND a.attname = 'acceptance_id'
       AND a.attnum > 0 AND NOT a.attisdropped;

    IF resident_id_type IS DISTINCT FROM 'text' THEN
        RAISE EXCEPTION 'Expected resident.account_id TEXT; found %', resident_id_type;
    END IF;

    IF acceptance_id_type IS NULL THEN
        RAISE EXCEPTION 'Missing terms_acceptance.acceptance_id';
    END IF;

END;
$preflight$;

CREATE SCHEMA krunali_issue71;

-- Item categories and their standard weights.
CREATE TABLE krunali_issue71.item_category (
    category_id         TEXT PRIMARY KEY,
    name                VARCHAR(120) NOT NULL UNIQUE,
    waste_type          VARCHAR(120) NOT NULL,
    standard_weight_kg  NUMERIC(10,2) NOT NULL
                        CHECK (standard_weight_kg > 0)
);

-- Use the same acceptance ID type as the team's table.
DO $create_pickup_request$
DECLARE
    acceptance_id_type TEXT;
BEGIN
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO acceptance_id_type
      FROM pg_attribute a
     WHERE a.attrelid = 'public.terms_acceptance'::regclass
       AND a.attname = 'acceptance_id'
       AND a.attnum > 0 AND NOT a.attisdropped;

    EXECUTE format($ddl$
        CREATE TABLE krunali_issue71.pickup_request (
            request_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id           TEXT NOT NULL
                                 REFERENCES public.resident(account_id),
            category_id          TEXT NOT NULL
                                 REFERENCES krunali_issue71.item_category(category_id),
            acceptance_id        %s NOT NULL UNIQUE
                                 REFERENCES public.terms_acceptance(acceptance_id),
            quantity             INTEGER NOT NULL CHECK (quantity > 0),
            estimated_weight_kg  NUMERIC(22,2) NOT NULL
                                 CHECK (estimated_weight_kg > 0),
            created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            pickup_street        VARCHAR(255) NOT NULL,
            pickup_postal_code   VARCHAR(6) NOT NULL
                                 CHECK (pickup_postal_code ~ '^T[0-9][A-Z][0-9][A-Z][0-9]$'),
            notes                TEXT,
            photo_url            TEXT
        )
    $ddl$, acceptance_id_type);
END;
$create_pickup_request$;

-- Keep old pickup windows as inactive records.
CREATE TABLE krunali_issue71.pickup_window (
    window_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id   UUID NOT NULL
                 REFERENCES krunali_issue71.pickup_request(request_id),
    pickup_date  DATE NOT NULL,
    slot         SMALLINT NOT NULL CHECK (slot BETWEEN 0 AND 23),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX pickup_window_active_date_uq
    ON krunali_issue71.pickup_window(request_id, pickup_date)
    WHERE is_active;

CREATE INDEX pickup_request_account_idx
    ON krunali_issue71.pickup_request(account_id);

CREATE INDEX pickup_window_request_idx
    ON krunali_issue71.pickup_window(request_id);

-- Save the calculated weight when a request is created or its items change.
CREATE FUNCTION krunali_issue71.calculate_request_weight()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
    unit_weight NUMERIC(10,2);
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.request_id IS DISTINCT FROM OLD.request_id
           OR NEW.account_id IS DISTINCT FROM OLD.account_id
           OR NEW.acceptance_id IS DISTINCT FROM OLD.acceptance_id
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
           OR NEW.pickup_street IS DISTINCT FROM OLD.pickup_street
           OR NEW.pickup_postal_code IS DISTINCT FROM OLD.pickup_postal_code THEN
            RAISE EXCEPTION 'Request owner, acceptance, creation time and pickup address cannot change';
        END IF;

        IF NEW.quantity IS NOT DISTINCT FROM OLD.quantity
           AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id THEN
            IF NEW.estimated_weight_kg IS DISTINCT FROM OLD.estimated_weight_kg THEN
                RAISE EXCEPTION 'Estimated weight cannot be changed directly';
            END IF;
            RETURN NEW;
        END IF;
    END IF;

    SELECT standard_weight_kg INTO unit_weight
      FROM krunali_issue71.item_category
     WHERE category_id = NEW.category_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown category_id: %', NEW.category_id;
    END IF;

    NEW.estimated_weight_kg := NEW.quantity * unit_weight;
    RETURN NEW;
END;
$fn$;

CREATE TRIGGER pickup_request_weight_trg
BEFORE INSERT OR UPDATE ON krunali_issue71.pickup_request
FOR EACH ROW EXECUTE FUNCTION krunali_issue71.calculate_request_weight();

-- Check future dates and the maximum of three active windows.
CREATE FUNCTION krunali_issue71.validate_pickup_window()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
    request_created TIMESTAMPTZ;
    active_count INTEGER;
    slot_start TIMESTAMPTZ;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Keep pickup-window history; deactivate the window instead';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.window_id IS DISTINCT FROM OLD.window_id
           OR NEW.request_id IS DISTINCT FROM OLD.request_id THEN
            RAISE EXCEPTION 'Window ID and request ID cannot change';
        END IF;
        IF NOT OLD.is_active THEN
            RAISE EXCEPTION 'Inactive pickup-window history cannot be edited';
        END IF;
        IF NEW.pickup_date IS DISTINCT FROM OLD.pickup_date
           OR NEW.slot IS DISTINCT FROM OLD.slot THEN
            RAISE EXCEPTION 'Deactivate the old window and insert a replacement';
        END IF;
    END IF;

    SELECT created_at INTO request_created
      FROM krunali_issue71.pickup_request
     WHERE request_id = NEW.request_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown request_id: %', NEW.request_id;
    END IF;

    IF NEW.is_active THEN
        IF NEW.pickup_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::date THEN
            RAISE EXCEPTION 'Active pickup dates must be in the future';
        END IF;

        slot_start := (NEW.pickup_date::timestamp + NEW.slot * INTERVAL '1 hour')
                      AT TIME ZONE 'America/Edmonton';

        IF slot_start >= request_created + INTERVAL '30 days' THEN
            RAISE EXCEPTION 'Pickup slot must start before the 30-day expiry';
        END IF;

        SELECT COUNT(*) INTO active_count
          FROM krunali_issue71.pickup_window
         WHERE request_id = NEW.request_id
           AND is_active
           AND window_id <> NEW.window_id;

        IF active_count >= 3 THEN
            RAISE EXCEPTION 'A request can have at most 3 active pickup windows';
        END IF;
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER pickup_window_validation_trg
BEFORE INSERT OR UPDATE OR DELETE ON krunali_issue71.pickup_window
FOR EACH ROW EXECUTE FUNCTION krunali_issue71.validate_pickup_window();

-- Check that each request has 1 to 3 active windows when the transaction ends.
CREATE FUNCTION krunali_issue71.check_active_window_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
    parent_request_id UUID;
    active_count INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'pickup_request' THEN
        parent_request_id := NEW.request_id;
    ELSIF TG_OP = 'DELETE' THEN
        parent_request_id := OLD.request_id;
    ELSE
        parent_request_id := NEW.request_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM krunali_issue71.pickup_request
         WHERE request_id = parent_request_id
    ) THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*) INTO active_count
      FROM krunali_issue71.pickup_window
     WHERE request_id = parent_request_id AND is_active;

    IF active_count NOT BETWEEN 1 AND 3 THEN
        RAISE EXCEPTION 'Request % must have 1 to 3 active pickup windows', parent_request_id;
    END IF;
    RETURN NULL;
END;
$fn$;

CREATE CONSTRAINT TRIGGER request_active_window_count_trg
AFTER INSERT OR UPDATE ON krunali_issue71.pickup_request
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION krunali_issue71.check_active_window_count();

CREATE CONSTRAINT TRIGGER window_active_count_trg
AFTER INSERT OR UPDATE OR DELETE ON krunali_issue71.pickup_window
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION krunali_issue71.check_active_window_count();

-- Expiry is calculated from the original creation time.
CREATE VIEW krunali_issue71.pickup_request_expiry AS
SELECT request_id, created_at + INTERVAL '30 days' AS expires_at
FROM krunali_issue71.pickup_request;

-- Team integration: check acceptance ownership/type and Open-only edits
-- using the team's terms_acceptance and status_change tables.
COMMIT;

