-- req_list_available: the Q6 list (AvailableRequest in openapi.yaml), the Open
-- requests any volunteer can accept. Called by TypeScript as
--   SELECT * FROM requests.req_list_available($1::text[])
-- Needs 022 (helpers). Created in "requests"; course tables are named without a
-- schema (see 020). Column names are qualified for the same reason as in 025.
--
-- The list is the same for every volunteer: the caller's own requests are
-- included (a resident who is also a volunteer may accept their own), so the
-- function takes no caller id. TypeScript checks the volunteer role.
--
-- p_postal_codes: only requests whose pickup postal code is in the array; NULL =
-- all. TypeScript checks each code against the contract's PostalCode pattern
-- first, so a code here is 6 characters like the CHAR(6) column.
--
-- Available = current status Open AND expiresAt > now(). expiresAt is the start
-- of the latest active window, so every listed request has at least one window
-- that hasn't started yet, and the window arrays are never empty.
--
-- Only those future windows are listed (a window that has started can't be
-- picked any more), earliest first. The three arrays have the same length and
-- order: element i of each describes one window. No street, notes, photo or
-- owner leaves this function.
--
-- Newest first, the id breaking ties, as in req_list_mine (028).
CREATE OR REPLACE FUNCTION requests.req_list_available(
    p_postal_codes TEXT[])
RETURNS TABLE (
    request_id          UUID,
    category_id         TEXT,
    category_name       TEXT,
    waste_type          TEXT,
    quantity            INT,
    estimated_weight_kg NUMERIC,
    postal_code         TEXT,
    window_ids          UUID[],
    window_dates        DATE[],
    window_hours        SMALLINT[],
    expires_at          TIMESTAMPTZ,
    has_photo           BOOLEAN
)
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_status_open CONSTANT VARCHAR(30) := 'Open';
BEGIN
    -- e names expiresAt once, for the SELECT list and the WHERE filter (see 028
    -- for why LATERAL). w gathers the future windows into the three arrays; the
    -- same ORDER BY inside each array_agg keeps them aligned. The pickup window
    -- id breaks a tie in start time, which the model doesn't rule out.
    RETURN QUERY
    SELECT p.pickup_request_id, c.category_id, c.name::TEXT, c.waste_type::TEXT,
           p.quantity, p.estimated_weight_kg,
           p.pickup_postal_code::TEXT,
           w.ids, w.dates, w.hours,
           e.expires_at,
           p.file_id IS NOT NULL
    FROM pickup_request p
    JOIN item_category c ON c.category_id = p.category_id
    CROSS JOIN LATERAL (
        SELECT requests.req_expires_at(p.pickup_request_id) AS expires_at
    ) e
    CROSS JOIN LATERAL (
        SELECT array_agg(pw.pickup_window_id ORDER BY pw.pickup_date, pw.start_hour, pw.pickup_window_id) AS ids,
               array_agg(pw.pickup_date      ORDER BY pw.pickup_date, pw.start_hour, pw.pickup_window_id) AS dates,
               array_agg(pw.start_hour       ORDER BY pw.pickup_date, pw.start_hour, pw.pickup_window_id) AS hours
        FROM pickup_window pw
        WHERE pw.pickup_request_id = p.pickup_request_id
          AND pw.is_active
          AND requests.req_window_start(pw.pickup_date, pw.start_hour) > now()
    ) w
    WHERE requests.req_current_status(p.pickup_request_id) = k_status_open
      AND e.expires_at > now()
      AND (p_postal_codes IS NULL OR p.pickup_postal_code = ANY (p_postal_codes))
    ORDER BY p.created_at DESC, p.pickup_request_id;
END;
$$;
