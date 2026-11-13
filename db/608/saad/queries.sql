-- SET
--     search_path TO ecocollect608;

-- Q1. What is the current status of each pickup request?
-- The current status is the latest status_change row, shown by the pickup_request_current_status view.
SELECT pickup_request_id, status, changed_at
FROM pickup_request_current_status
ORDER BY pickup_request_id;

-- Q2. Which requests can a volunteer accept right now?
-- A request is available when its current status is Open and it has no active assignment.
SELECT pr.pickup_request_id, c.name AS category, pr.quantity, pr.pickup_postal_code
FROM pickup_request pr
JOIN pickup_request_current_status s ON s.pickup_request_id = pr.pickup_request_id
JOIN item_category c ON c.category_id = pr.category_id
WHERE s.status = 'Open'
  AND NOT EXISTS (
      SELECT 1 FROM assignment a
      WHERE a.pickup_request_id = pr.pickup_request_id AND a.ended_at IS NULL
  )
ORDER BY pr.created_at;

-- Q3. How many deliveries and how much e-waste (kg) did each recycling facility receive?
SELECT f.name AS facility, COUNT(d.delivery_id) AS deliveries, SUM(pr.estimated_weight_kg) AS total_kg
FROM recycling_facility f
JOIN delivery d ON d.facility_id = f.facility_id
JOIN assignment a ON a.assignment_id = d.assignment_id
JOIN pickup_request pr ON pr.pickup_request_id = a.pickup_request_id
GROUP BY f.facility_id, f.name
ORDER BY total_kg DESC;
