SELECT c.name AS category,
       COUNT(*) AS delivered_requests,
       SUM(pr.quantity) AS items_delivered,
       SUM(pr.estimated_weight_kg) AS estimated_weight_kg
FROM delivery d
JOIN assignment a ON a.assignment_id = d.assignment_id
JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
JOIN pickup_request pr ON pr.pickup_request_id = w.pickup_request_id
JOIN item_category c ON c.category_id = pr.category_id
GROUP BY c.name
ORDER BY items_delivered DESC, category;
