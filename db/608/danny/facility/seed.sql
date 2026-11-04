-- Seed: recycling_facility, facility_accepts (ticket #72).
-- Run after Krunali's seed, which creates the item categories used here
-- (laptops, batteries, monitors, phones, cables).
-- Repeatable: ON CONFLICT DO NOTHING.
SET search_path TO ecocollect608;
BEGIN;

-- RECYCLING_FACILITY: five sample depots (fake names and addresses).
INSERT INTO recycling_facility (facility_id, name, street, postal_code, special_instructions) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Sample North Depot',     '1 Sample St NW',  'T3K2L7', NULL),
  ('30000000-0000-4000-8000-000000000002', 'Sample South Depot',     '2 Sample Ave SE', 'T2E5A8', 'Use side entrance'),
  ('30000000-0000-4000-8000-000000000003', 'Sample Downtown Depot',  '3 Sample St SW',  'T2P1J9', NULL),
  ('30000000-0000-4000-8000-000000000004', 'Sample Battery Drop',    '4 Sample Rd NE',  'T2N1N4', 'Tape battery terminals before drop-off'),
  ('30000000-0000-4000-8000-000000000005', 'Sample West Eco Centre', '5 Sample Blvd SW','T3A0B1', NULL)
ON CONFLICT (facility_id) DO NOTHING;

-- FACILITY_ACCEPTS: which categories each depot takes.
INSERT INTO facility_accepts (facility_id, category_id) VALUES
  ('30000000-0000-4000-8000-000000000001', 'laptops'),
  ('30000000-0000-4000-8000-000000000001', 'monitors'),
  ('30000000-0000-4000-8000-000000000001', 'phones'),
  ('30000000-0000-4000-8000-000000000002', 'phones'),
  ('30000000-0000-4000-8000-000000000002', 'cables'),
  ('30000000-0000-4000-8000-000000000003', 'laptops'),
  ('30000000-0000-4000-8000-000000000004', 'batteries'),
  ('30000000-0000-4000-8000-000000000005', 'laptops'),
  ('30000000-0000-4000-8000-000000000005', 'monitors'),
  ('30000000-0000-4000-8000-000000000005', 'batteries')
ON CONFLICT (facility_id, category_id) DO NOTHING;

COMMIT;