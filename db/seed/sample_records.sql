
-- Step 6: Sample Data
-- Tables: item_category, pickup_request, pickup_window

-- 6.1 Sample records for item_category
-- These five category IDs were assigned by our team.

INSERT INTO krunali_issue71.item_category
    (category_id, name, waste_type, standard_weight_kg)
VALUES
    ('laptops', 'Laptops', 'E-waste', 2.50),
    ('batteries', 'Batteries', 'E-waste', 0.50),
    ('monitors', 'Monitors', 'E-waste', 4.00),
    ('phones', 'Phones', 'E-waste', 0.25),
    ('cables', 'Cables', 'E-waste', 0.10);

-- 6.2 Sample records for pickup_request
-- Pending confirmation of parent records.

-- 6.3 Sample records for pickup_window
-- Will be added after pickup_request records.
