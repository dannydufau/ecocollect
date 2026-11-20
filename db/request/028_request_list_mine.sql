-- req_list_mine: the Q5 list (MyRequest in openapi.yaml), a resident's own
-- requests. Called by TypeScript as
--   SELECT * FROM requests.req_list_mine($1, $2::text[])
-- Needs 022 (helpers). Created in "requests"; course tables are named without a
-- schema (see 020). Column names are qualified for the same reason as in 025.
--
-- p_statuses: only requests whose current status is in the array; NULL = all.
-- TypeScript checks the names against the seven statuses first, so an unknown
-- name here simply matches nothing.
--
-- Newest first. The requests of one Q4 call share created_at, so the id breaks
-- the tie: an arbitrary order, but the same one on every call.
CREATE OR REPLACE FUNCTION requests.req_list_mine(
    p_resident_id VARCHAR(50),
    p_statuses    TEXT[])
RETURNS TABLE (
    request_id          UUID,
    category_id         TEXT,
    category_name       TEXT,
    waste_type          TEXT,
    quantity            INT,
    estimated_weight_kg NUMERIC,
    status              TEXT,
    created_at          TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    has_photo           BOOLEAN
)
LANGUAGE plpgsql
STABLE
SET search_path TO requests, ecocollect608, pg_temp
AS $$
BEGIN
    -- A NULL resident would match nobody and hide a bug in the caller.
    IF p_resident_id IS NULL THEN
        RAISE EXCEPTION 'req_list_mine: p_resident_id must not be NULL';
    END IF;

    -- The LATERAL subquery names the current status once, so the SELECT list and
    -- the WHERE filter can both use s.current_status (a plain alias in the SELECT
    -- list isn't visible in WHERE, and "status" would clash with the output column).
    -- Postgres may still call the helper twice per row; it is STABLE, so both calls
    -- return the same value within this statement.
    RETURN QUERY
    SELECT p.pickup_request_id, c.category_id, c.name::TEXT, c.waste_type::TEXT,
           p.quantity, p.estimated_weight_kg,
           s.current_status,
           p.created_at,
           requests.req_expires_at(p.pickup_request_id),
           p.file_id IS NOT NULL
    FROM pickup_request p
    JOIN terms_acceptance ta ON ta.terms_acceptance_id = p.terms_acceptance_id
    JOIN item_category c     ON c.category_id = p.category_id
    CROSS JOIN LATERAL (
        SELECT requests.req_current_status(p.pickup_request_id)::TEXT AS current_status
    ) s
    WHERE ta.account_id = p_resident_id
      AND (p_statuses IS NULL OR s.current_status = ANY (p_statuses))
    ORDER BY p.created_at DESC, p.pickup_request_id;
END;
$$;
