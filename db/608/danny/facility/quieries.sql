SET search_path TO ecocollect608;

-- Facilities that accept a given category (where can batteries go?).
-- Expected with the seed: 2 rows (Sample Battery Drop, Sample West Eco Centre).
SELECT f.facility_id, f.name, f.street, f.postal_code
FROM recycling_facility f
JOIN facility_accepts a ON a.facility_id = f.facility_id
WHERE a.category_id = 'batteries';

-- Eligible facilities for one pickup request: those that accept the request's category.
-- Uses Krunali's pickup_request; result depends on that request's category.
SELECT f.facility_id, f.name
FROM pickup_request p
JOIN facility_accepts a ON a.category_id = p.category_id
JOIN recycling_facility f ON f.facility_id = a.facility_id
WHERE p.request_id = '10000000-0000-4000-8000-000000000001';

-- How many categories each facility accepts (one side of the many-to-many).
-- Expected: North 3, South 2, Downtown 1, Battery Drop 1, West Eco Centre 3.
SELECT f.name, COUNT(a.category_id) AS categories_accepted
FROM recycling_facility f
LEFT JOIN facility_accepts a ON a.facility_id = f.facility_id
GROUP BY f.name
ORDER BY categories_accepted DESC, f.name;

-- Coverage gap: categories no facility accepts (requests in these couldn't be delivered).
-- Expected with the seed: 0 rows.
SELECT c.category_id, c.name
FROM item_category c
LEFT JOIN facility_accepts a ON a.category_id = c.category_id
WHERE a.facility_id IS NULL;