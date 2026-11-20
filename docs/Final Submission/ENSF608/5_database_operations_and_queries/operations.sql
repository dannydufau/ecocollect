SET search_path TO ecocollect608, public;

-- 0. View: each request's owner and current status (latest status_change row).
-- A view giving each request’s owner and current status. 
-- Most later queries need “current status”, and the schema keeps status as history 
-- (status_change), so writing it once as a view keeps every later query short. 
-- It uses the owner path through terms_acceptance.
CREATE OR REPLACE VIEW request_current_status AS
SELECT pr.pickup_request_id,
       ta.account_id AS resident_id,
       pr.category_id,
       pr.pickup_postal_code,
       sc.status,
       sc.changed_at AS status_since
FROM pickup_request pr
JOIN terms_acceptance ta ON ta.terms_acceptance_id = pr.terms_acceptance_id
JOIN status_change sc ON sc.pickup_request_id = pr.pickup_request_id
WHERE sc.changed_at = (SELECT MAX(s2.changed_at)
                       FROM status_change s2
                       WHERE s2.pickup_request_id = pr.pickup_request_id);

SELECT RIGHT(pickup_request_id::text, 4) AS request, resident_id, category_id,
       pickup_postal_code, status
FROM request_current_status
ORDER BY status, resident_id;