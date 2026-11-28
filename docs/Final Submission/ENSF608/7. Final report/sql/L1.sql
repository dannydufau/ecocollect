SELECT RIGHT(pr.pickup_request_id::text, 4) AS request,
       a.accepted_at::date AS accepted,
       a.end_reason AS outcome,
       f.name AS delivered_to
FROM assignment a
JOIN terms_acceptance ta ON ta.terms_acceptance_id = a.terms_acceptance_id
JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
JOIN pickup_request pr ON pr.pickup_request_id = w.pickup_request_id
LEFT JOIN delivery d ON d.assignment_id = a.assignment_id
LEFT JOIN recycling_facility f ON f.facility_id = d.facility_id
WHERE ta.account_id = 'volunteer1'
ORDER BY a.accepted_at DESC;
