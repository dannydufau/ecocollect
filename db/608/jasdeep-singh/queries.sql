SET
    search_path TO ecocollect608;

-- Query 1
-- select all notifications for the current user, identified by account_id
SELECT
    *
FROM
    notification
WHERE
    account_id = 'resident2';

-- Query 2
-- select the latest terms document to show on the front-end
SELECT
    *
FROM
    terms_document
ORDER BY
    published_at DESC
LIMIT
    1;

-- Query 3 (not possible without pickup_request table)
-- get when was terms accepted by the resident for a pickup_request
-- Query 4 (not possible without assignment table)
-- get when was terms accepted by the volunteer for a assignment
-- Query 5 (not possible without assignment and pickup_request tables)
-- get pickup_request id for a notification needed by volunteer to show pickup request details for a matched pickup request.
-- Query 6 
-- Show data for the public community page showing app impact. needs to show total EcoPoints awarded, total e-waste weight delivered (not possible without assignment and pickup_request tables), number of volunteers and residents participating (needs account table (roles)), average contribution by volunteers in terms of points and weight delivered (not possible without assignment and pickup_request tables) etc.
SELECT
    SUM(points) AS "Total Community Points"
FROM
    ecopoints_award;