SET search_path TO ecocollect608;

-- Rerunnable in development: drop this ticket's tables first, then recreate them.
-- facility_accepts first, because it references recycling_facility.
DROP TABLE IF EXISTS facility_accepts;
DROP TABLE IF EXISTS recycling_facility;

-- =========================================
-- RECYCLING_FACILITY
-- Predefined depots; residents and volunteers can't create them.
-- Address composite (ER) flattened into street and postal_code. All facilities are in Calgary.
-- =========================================
CREATE TABLE recycling_facility (
    facility_id           UUID PRIMARY KEY,
    name                  VARCHAR(100) NOT NULL,
    street                VARCHAR(100) NOT NULL,
    postal_code           CHAR(6) NOT NULL
        CHECK (postal_code ~ '^T[0-9][A-Z][0-9][A-Z][0-9]$'),   -- Calgary format, e.g. T2P1J9
    special_instructions  TEXT                                   -- may be empty
);

-- =========================================
-- FACILITY_ACCEPTS
-- ACCEPTS (M:N between ITEM_CATEGORY and RECYCLING_FACILITY) mapped to a junction table.
-- Composite PK: each facility–category pair appears once.
-- =========================================
CREATE TABLE facility_accepts (
    facility_id  UUID NOT NULL
                 REFERENCES recycling_facility (facility_id) ON DELETE CASCADE,
    category_id  TEXT NOT NULL
                 REFERENCES item_category (category_id),          -- Krunali's table
    PRIMARY KEY (facility_id, category_id)
);