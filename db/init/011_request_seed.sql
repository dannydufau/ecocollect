-- Request Service reference data, needed in every database: the item categories,
-- the recycling facilities and which categories each facility accepts (Q1, Q2,
-- contract 17.4). This seed is also used by the ENSF 608 test database.
-- Every category has at least one
-- accepting facility (Q2). ON CONFLICT DO NOTHING: safe to run again.

INSERT INTO requests.item_category (category_id, name, waste_type, standard_weight_kg) VALUES
    ('laptops', 'Computers/Laptops', 'Computers', 2.50),
    ('desktops', 'Computers/Desktops', 'Computers', 8.00),
    ('monitors', 'Monitors', 'Displays', 5.00),
    ('tvs', 'Televisions', 'Displays', 12.00),
    ('phones', 'Phones', 'Mobile Devices', 0.20),
    ('tablets', 'Tablets', 'Mobile Devices', 0.50),
    ('printers', 'Printers', 'Printers', 6.00),
    ('small-appliances', 'Small Appliances', 'Small Appliances', 3.00),
    ('cables-chargers', 'Cables and Chargers', 'Accessories', 0.30)
ON CONFLICT (category_id) DO NOTHING;

INSERT INTO requests.recycling_facility (facility_id, name, street, postal_code, special_instructions) VALUES
    ('00000006-0000-4000-8000-000000000001', 'Sample electronics depot', '10 Example Road SE', 'T2P1J9', 'Use the electronics drop-off area.'),
    ('00000006-0000-4000-8000-000000000002', 'Sample appliance depot', '20 Example Avenue NW', 'T2N1N4', NULL),
    ('00000006-0000-4000-8000-000000000003', 'Sample community depot', '30 Example Way SW', 'T2T4M3', NULL)
ON CONFLICT (facility_id) DO NOTHING;

INSERT INTO requests.facility_accepts (facility_id, category_id) VALUES
    ('00000006-0000-4000-8000-000000000001', 'laptops'),
    ('00000006-0000-4000-8000-000000000001', 'desktops'),
    ('00000006-0000-4000-8000-000000000001', 'phones'),
    ('00000006-0000-4000-8000-000000000001', 'tablets'),
    ('00000006-0000-4000-8000-000000000001', 'monitors'),
    ('00000006-0000-4000-8000-000000000001', 'tvs'),
    ('00000006-0000-4000-8000-000000000001', 'printers'),
    ('00000006-0000-4000-8000-000000000001', 'cables-chargers'),
    ('00000006-0000-4000-8000-000000000002', 'small-appliances'),
    ('00000006-0000-4000-8000-000000000003', 'phones'),
    ('00000006-0000-4000-8000-000000000003', 'cables-chargers')
ON CONFLICT (facility_id, category_id) DO NOTHING;
