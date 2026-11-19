-- Request Service internal helpers on the course tables (schema "ecocollect608").
-- Called by the Request Service's other functions, never by TypeScript.
-- Needs PR #198's tables.sql loaded first (load-db.sh does that).
--
-- STABLE: the result depends only on the arguments and the database's contents
-- within one statement (AT TIME ZONE reads the time zone data, so not IMMUTABLE).
-- It lets PostgreSQL reuse a result inside one query.

-- Start of a pickup window as a real instant (contract Conventions, "Time rules"):
-- the window is a Calgary date + start hour, converted with the zone name, never a
-- fixed offset. date + interval gives a timestamp without time zone (local Calgary
-- time), and AT TIME ZONE 'America/Edmonton' turns it into a TIMESTAMPTZ.
CREATE OR REPLACE FUNCTION ecocollect608.req_window_start(p_date DATE, p_start_hour SMALLINT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path TO ecocollect608, pg_temp
AS $$
BEGIN
    RETURN (p_date + p_start_hour * INTERVAL '1 hour') AT TIME ZONE 'America/Edmonton';
END;
$$;

-- End of a pickup window: start + 1 hour on the instant (contract "Time rules"),
-- so startHour 23 ends at 00:00 the next day. "The selected window has ended"
-- means now() >= req_window_end(...).
CREATE OR REPLACE FUNCTION ecocollect608.req_window_end(p_date DATE, p_start_hour SMALLINT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path TO ecocollect608, pg_temp
AS $$
BEGIN
    RETURN ecocollect608.req_window_start(p_date, p_start_hour) + INTERVAL '1 hour';
END;
$$;

-- The request's current status: its latest status change (the model stores no
-- status column). NULL if the request doesn't exist.
CREATE OR REPLACE FUNCTION ecocollect608.req_current_status(p_request_id UUID)
RETURNS VARCHAR(30)
LANGUAGE plpgsql
STABLE
SET search_path TO ecocollect608, pg_temp
AS $$
DECLARE
    v_status VARCHAR(30);
BEGIN
    SELECT s.status INTO v_status
    FROM ecocollect608.status_change s
    WHERE s.pickup_request_id = p_request_id
    ORDER BY s.changed_at DESC
    LIMIT 1;

    RETURN v_status;                          -- NULL when no row was found
END;
$$;

-- expiresAt (contract 12.2): the start of the latest active window. Derived each
-- time, so it follows any change to the active windows. NULL if the request has no
-- active window (only a request that doesn't exist; the model always keeps 1-3).
CREATE OR REPLACE FUNCTION ecocollect608.req_expires_at(p_request_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path TO ecocollect608, pg_temp
AS $$
DECLARE
    v_expires_at TIMESTAMPTZ;
BEGIN
    SELECT max(ecocollect608.req_window_start(w.pickup_date, w.start_hour)) INTO v_expires_at
    FROM ecocollect608.pickup_window w
    WHERE w.pickup_request_id = p_request_id
      AND w.is_active;

    RETURN v_expires_at;
END;
$$;

-- The request's owner (resident): the account of the creation terms acceptance
-- (the model has no owner column). NULL if the request doesn't exist.
CREATE OR REPLACE FUNCTION ecocollect608.req_owner_id(p_request_id UUID)
RETURNS VARCHAR(50)
LANGUAGE plpgsql
STABLE
SET search_path TO ecocollect608, pg_temp
AS $$
DECLARE
    v_owner_id VARCHAR(50);
BEGIN
    SELECT ta.account_id INTO v_owner_id
    FROM ecocollect608.pickup_request p
    JOIN ecocollect608.terms_acceptance ta ON ta.terms_acceptance_id = p.terms_acceptance_id
    WHERE p.pickup_request_id = p_request_id;

    RETURN v_owner_id;
END;
$$;

-- matchedVolunteerUids for E1 and E2 (contract 10.3): every volunteer whose
-- preferred postal codes include the request's postal code (exact 6-character
-- match), leaving out deactivated accounts and the request's own resident. In
-- demo mode the resident stays in (contract 17.5). Sorted, so the list is the
-- same every time; an empty array (not NULL) when nobody matches.
CREATE OR REPLACE FUNCTION ecocollect608.req_matched_volunteers(p_request_id UUID, p_demo BOOLEAN)
RETURNS VARCHAR(50)[]
LANGUAGE plpgsql
STABLE
SET search_path TO ecocollect608, pg_temp
AS $$
DECLARE
    v_owner_id VARCHAR(50);
    v_ids      VARCHAR(50)[];
BEGIN
    -- A missing flag is a bug in the caller: guessing could notify the wrong people.
    IF p_demo IS NULL THEN
        RAISE EXCEPTION 'req_matched_volunteers: p_demo must not be NULL';
    END IF;

    v_owner_id := ecocollect608.req_owner_id(p_request_id);

    -- array_agg over no rows gives NULL, so coalesce turns it into '{}'.
    SELECT coalesce(array_agg(v.account_id ORDER BY v.account_id), '{}') INTO v_ids
    FROM ecocollect608.pickup_request p
    JOIN ecocollect608.volunteer_preferred_postal_code v ON v.postal_code = p.pickup_postal_code
    JOIN ecocollect608.account a ON a.account_id = v.account_id
    WHERE p.pickup_request_id = p_request_id
      AND a.deactivated_at IS NULL
      AND (p_demo OR v.account_id <> v_owner_id);

    RETURN v_ids;
END;
$$;
