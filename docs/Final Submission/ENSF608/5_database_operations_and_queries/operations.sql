-- ENSF 608 Section 5: Database Operations and Queries
-- Runs on the physical model in "../4. Physical model/" (tables.sql, transactions.sql, seed.sql).
-- Sections follow the category table in the 608 project description.

SET search_path TO ecocollect608, public;

-- ===================================================================
-- Helper view used by later queries
-- ===================================================================

-- 0. Helper View: each request's owner and current status.
--    Rationale: status is stored as history (status_change); current = latest row.
--               Defined once so later queries can select from it like a table.
--    Citation:  supports FR09, FR12
--    Concepts:  view, 3-table join, correlated subquery, MAX
--    Used by:   F3 (filters to Open requests for a volunteer's codes),
--               J2 (shows each of a resident's requests with its current status)
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

-- Check: one row per request (11 in the seed), all seven statuses.
SELECT RIGHT(pickup_request_id::text, 4) AS request, resident_id, category_id,
       pickup_postal_code, status
FROM request_current_status
ORDER BY status, resident_id;
