SELECT c.name AS category,
       COUNT(*) AS requests,
       SUM(pr.quantity) AS items
FROM pickup_request pr
JOIN item_category c ON c.category_id = pr.category_id
GROUP BY c.name
HAVING COUNT(*) >= 2
ORDER BY requests DESC, category;
