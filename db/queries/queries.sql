
-- Step 7: SQL queries (execution evidence recorded separately)
-- ENSF 608 - EcoCollect
-- Tables: item_category, pickup_request, pickup_window
--
-- Run these queries after the Step 6 sample records
-- have been successfully inserted into PostgreSQL.


-- Query 1: Display pickup requests with category details.
-- INNER JOIN connects each request to its item category.

SELECT
    krunali_issue71.pickup_request.request_id,
    krunali_issue71.item_category.name AS category_name,
    krunali_issue71.pickup_request.quantity,
    krunali_issue71.pickup_request.estimated_weight_kg,
    krunali_issue71.pickup_request.pickup_postal_code
FROM krunali_issue71.pickup_request
INNER JOIN krunali_issue71.item_category
    ON krunali_issue71.pickup_request.category_id =
       krunali_issue71.item_category.category_id
ORDER BY krunali_issue71.pickup_request.request_id;


-- Query 2: Count active pickup windows for each request.
-- LEFT JOIN includes requests even if no active window exists.
-- COUNT counts the active windows.
-- MIN finds the earliest available pickup date.

SELECT
    krunali_issue71.pickup_request.request_id,
    COUNT(krunali_issue71.pickup_window.window_id)
        AS active_window_count,
    MIN(krunali_issue71.pickup_window.pickup_date)
        AS earliest_pickup_date
FROM krunali_issue71.pickup_request
LEFT JOIN krunali_issue71.pickup_window
    ON krunali_issue71.pickup_request.request_id =
       krunali_issue71.pickup_window.request_id
    AND krunali_issue71.pickup_window.is_active = TRUE
GROUP BY
    krunali_issue71.pickup_request.request_id
ORDER BY
    krunali_issue71.pickup_request.request_id;


-- Query 3: Show request count and total weight by category.
-- LEFT JOIN includes categories without pickup requests.
-- GROUP BY calculates results for each category.

SELECT
    krunali_issue71.item_category.category_id,
    krunali_issue71.item_category.name AS category_name,
    COUNT(krunali_issue71.pickup_request.request_id)
        AS total_requests,
    COALESCE(
        SUM(krunali_issue71.pickup_request.estimated_weight_kg),
        0
    ) AS total_weight_kg
FROM krunali_issue71.item_category
LEFT JOIN krunali_issue71.pickup_request
    ON krunali_issue71.item_category.category_id =
       krunali_issue71.pickup_request.category_id
GROUP BY
    krunali_issue71.item_category.category_id,
    krunali_issue71.item_category.name
ORDER BY
    krunali_issue71.item_category.category_id;


-- Verification 1: Count item categories.
-- Expected count after a successful fresh Step 6 seed: 5

SELECT
    COUNT(*) AS total_categories
FROM krunali_issue71.item_category;


-- Verification 2: Count pickup requests.
-- Expected count after a successful fresh Step 6 seed: 5

SELECT
    COUNT(*) AS total_requests
FROM krunali_issue71.pickup_request;


-- Verification 3: Count pickup windows.
-- Expected count after a successful fresh Step 6 seed: 8

SELECT
    COUNT(*) AS total_windows
FROM krunali_issue71.pickup_window;
