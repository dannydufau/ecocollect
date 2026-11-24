-- req_get_requests: the Q4 201 body (CreatedRequest in openapi.yaml), read after
-- req_create_requests returned 'ok' or 'replayed'. Called by TypeScript as
--   SELECT * FROM requests.req_get_requests($1::uuid[], $2)
-- Needs 022 (helpers). Created in "requests"; course tables are named without a
-- schema (see 020). Column names are qualified for the same reason as in 025.
--
-- One row per id, in the order of p_request_ids (the created_request_ids order,
-- which is the item order of the Q4 body). Only the viewer's own requests are
-- returned: an id that doesn't exist or belongs to someone else gives no row, so
-- the caller can compare the row count with the id count.
--
-- status is the current status, not a constant 'Open': on a replay within 24 h
-- the request may already have moved on, and the body shows what is stored now.
CREATE OR REPLACE FUNCTION requests.req_get_requests(
    p_request_ids UUID[],
    p_viewer_id   VARCHAR(50))
RETURNS TABLE (
    request_id          UUID,
    category_id         TEXT,
    category_name       TEXT,
    waste_type          TEXT,
    quantity            INT,
    estimated_weight_kg NUMERIC,
    status              TEXT,
    created_at          TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
BEGIN
    -- A NULL viewer would match nobody and hide a bug in the caller.
    IF p_viewer_id IS NULL THEN
        RAISE EXCEPTION 'req_get_requests: p_viewer_id must not be NULL';
    END IF;

    -- unnest ... WITH ORDINALITY numbers the ids 1, 2, 3 in array order, so
    -- ORDER BY ids.n keeps the caller's order. A repeated id gives a repeated row.
    RETURN QUERY
    SELECT p.pickup_request_id, c.category_id, c.name::TEXT, c.waste_type::TEXT,
           p.quantity, p.estimated_weight_kg,
           requests.req_current_status(p.pickup_request_id)::TEXT,
           p.created_at,
           requests.req_expires_at(p.pickup_request_id)
    FROM unnest(p_request_ids) WITH ORDINALITY AS ids(id, n)
    JOIN pickup_request p   ON p.pickup_request_id = ids.id
    JOIN terms_acceptance ta ON ta.terms_acceptance_id = p.terms_acceptance_id
    JOIN item_category c    ON c.category_id = p.category_id
    WHERE ta.account_id = p_viewer_id
    ORDER BY ids.n;
END;
$$;
