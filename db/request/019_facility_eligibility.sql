-- Idempotent upgrade for existing databases created before facility eligibility flags
-- were added to db/init/010_request_tables.sql. Preserves all historical facility rows
-- and category mappings so past deliveries remain valid.

ALTER TABLE requests.recycling_facility
    ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE requests.facility_accepts
    ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE;
