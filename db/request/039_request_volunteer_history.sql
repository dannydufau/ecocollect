-- req_volunteer_history: the Q7 list (VolunteerAssignment in openapi.yaml), one
-- row per assignment the volunteer ever had, including cancelled and missed
-- ones. Called by TypeScript as
--   SELECT * FROM requests.req_volunteer_history($1, $2::text[])
-- Needs 022 (helpers). Created in "requests"; course tables are named without a
-- schema (see 020). Column names are qualified for the same reason as in 025.
--
-- p_statuses: only assignments whose status is in the array; NULL = all.
-- TypeScript checks the names against the six assignment statuses first, so an
-- unknown name here simply matches nothing. No role check: TypeScript checks the
-- volunteer role, and the rows are the caller's own.
--
-- An assignment that ended as Volunteer_Cancelled, Resident_Cancelled or
-- Missed_Pickup no longer links the volunteer to the request (Q8), so its
-- request fields are NULL; only the request id and the assignment are filled.
--
-- Newest first by accepted_at; the assignment id breaks a tie: an arbitrary
-- order, but the same one on every call.
CREATE OR REPLACE FUNCTION requests.req_volunteer_history(
    p_volunteer_id VARCHAR(50),
    p_statuses     TEXT[])
RETURNS TABLE (
    request_id          UUID,
    category_id         TEXT,
    category_name       TEXT,
    waste_type          TEXT,
    quantity            INT,
    estimated_weight_kg NUMERIC,
    postal_code         TEXT,
    status              TEXT,
    assignment_id       UUID,
    window_id           UUID,
    window_date         DATE,
    window_hour         SMALLINT,
    assignment_status   TEXT,
    accepted_at         TIMESTAMPTZ,
    collected_at        TIMESTAMPTZ,
    ended_at            TIMESTAMPTZ,
    end_reason          TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path TO requests, ecocollect608, pg_temp
AS $$
DECLARE
    k_assignment_active    CONSTANT TEXT := 'Active';      -- assignment status (no column)
    k_assignment_collected CONSTANT TEXT := 'Collected';
    k_end_delivered        CONSTANT TEXT := 'Delivered';   -- assignment end_reason
BEGIN
    -- A NULL volunteer would match nobody and hide a bug in the caller.
    IF p_volunteer_id IS NULL THEN
        RAISE EXCEPTION 'req_volunteer_history: p_volunteer_id must not be NULL';
    END IF;

    -- The LATERAL subquery names the assignment status and whether the volunteer
    -- is still linked once, so the SELECT list and the WHERE filter can use them.
    -- Still linked: the assignment has not ended, or it ended as Delivered.
    -- The window comes from the join: it may be inactive by now.
    RETURN QUERY
    SELECT pw.pickup_request_id,
           CASE WHEN s.linked THEN c.category_id END,
           CASE WHEN s.linked THEN c.name::TEXT END,
           CASE WHEN s.linked THEN c.waste_type::TEXT END,
           CASE WHEN s.linked THEN p.quantity END,
           CASE WHEN s.linked THEN p.estimated_weight_kg END,
           CASE WHEN s.linked THEN p.pickup_postal_code::TEXT END,
           CASE WHEN s.linked THEN requests.req_current_status(p.pickup_request_id)::TEXT END,
           a.assignment_id,
           pw.pickup_window_id, pw.pickup_date, pw.start_hour,
           s.status_now,
           a.accepted_at, a.collected_at, a.ended_at, a.end_reason::TEXT
    FROM assignment a
    JOIN terms_acceptance ta ON ta.terms_acceptance_id = a.terms_acceptance_id
    JOIN pickup_window pw    ON pw.pickup_window_id = a.pickup_window_id
    JOIN pickup_request p    ON p.pickup_request_id = pw.pickup_request_id
    JOIN item_category c     ON c.category_id = p.category_id
    CROSS JOIN LATERAL (
        SELECT CASE WHEN a.end_reason IS NOT NULL   THEN a.end_reason::TEXT
                    WHEN a.collected_at IS NOT NULL THEN k_assignment_collected
                    ELSE k_assignment_active END        AS status_now,
               (a.end_reason IS NULL OR a.end_reason = k_end_delivered) AS linked
    ) s
    WHERE ta.account_id = p_volunteer_id
      AND (p_statuses IS NULL OR s.status_now = ANY (p_statuses))
    ORDER BY a.accepted_at DESC, a.assignment_id;
END;
$$;
