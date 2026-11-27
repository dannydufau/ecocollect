-- Deliberate, repeatable live catalogue upgrade script.
-- Kept distinct from db/init/011_request_seed.sql so routine local reloads cannot
-- accidentally alter live facility eligibility.
--
-- Current state:
--   - Loads the three City of Calgary Eco Centres with stable UUIDs and is_enabled = FALSE
--     until City of Calgary (311) confirms third-party volunteer drop-offs, multi-household
--     consolidated loads, and TV size rules (<30", 30", >30").
--   - Preserves existing sample facilities and historical mappings so past deliveries and
--     in-progress staging requests remain valid.
--   - Runs requests.req_validate_catalogue() inside the transaction before COMMIT so an
--     incomplete matrix rolls back with zero partial changes.

BEGIN;

INSERT INTO requests.recycling_facility (facility_id, name, street, postal_code, special_instructions, is_enabled) VALUES
    ('00000006-0000-4000-8000-000000000101', 'East Calgary Landfill and Eco Centre', '3020 68 Street SE', 'T2B4R8',
     'Follow Eco Centre electronics drop-off signs. Keep electronics separate from garbage to avoid landfill fees. Wipe personal data before drop-off.', FALSE),
    ('00000006-0000-4000-8000-000000000102', 'Spyhill Landfill and Eco Centre', '11808 69 Street NW', 'T3R1J3',
     'Enter from 69 Street NW and follow Eco Centre electronics signs. Keep electronics separate from garbage to avoid landfill fees. Wipe personal data before drop-off.', FALSE),
    ('00000006-0000-4000-8000-000000000103', 'Shepard Landfill and Eco Centre', '12111 68 Street SE', 'T2Z5E7',
     'Follow Eco Centre electronics drop-off signs. Keep electronics separate from garbage to avoid landfill fees. Wipe personal data before drop-off.', FALSE)
ON CONFLICT (facility_id) DO UPDATE SET
    name = EXCLUDED.name,
    street = EXCLUDED.street,
    postal_code = EXCLUDED.postal_code,
    special_instructions = EXCLUDED.special_instructions;

-- Candidate mappings staged as disabled (is_enabled = FALSE) on initial insert until
-- 311 confirmation. ON CONFLICT DO NOTHING preserves any later activation.
-- Note: 'tvs' is intentionally omitted until 311 clarifies TVs under, at, and over 30 inches.
INSERT INTO requests.facility_accepts (facility_id, category_id, is_enabled)
SELECT f.facility_id, c.category_id, FALSE
FROM (VALUES
    ('00000006-0000-4000-8000-000000000101'::UUID),
    ('00000006-0000-4000-8000-000000000102'::UUID),
    ('00000006-0000-4000-8000-000000000103'::UUID)
) AS f(facility_id)
CROSS JOIN (VALUES
    ('laptops'),
    ('desktops'),
    ('monitors'),
    ('phones'),
    ('tablets'),
    ('printers'),
    ('small-appliances'),
    ('cables-chargers')
) AS c(category_id)
ON CONFLICT (facility_id, category_id) DO NOTHING;

-- Validate full catalogue coverage and in-progress request safety before committing.
SELECT requests.req_validate_catalogue();

COMMIT;
