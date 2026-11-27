-- Request Service internal helpers on the course tables.
-- Created in "requests"; course tables are named without a schema (see 020).
-- Called by the Request Service's other functions, never by TypeScript.
-- Requires the Request tables from db/init/010_request_tables.sql.
--
-- STABLE: the result depends only on the arguments and the database's contents
-- within one statement (AT TIME ZONE reads the time zone data, so not IMMUTABLE).
-- It lets PostgreSQL reuse a result inside one query.

-- Start of a pickup window as a real instant (contract Conventions, "Time rules"):
-- the window is a Calgary date + start hour, converted with the zone name, never a
-- fixed offset. date + interval gives a timestamp without time zone (local Calgary
-- time), and AT TIME ZONE 'America/Edmonton' turns it into a TIMESTAMPTZ.
CREATE OR REPLACE FUNCTION requests.req_window_start(p_date DATE, p_start_hour SMALLINT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_time_zone     CONSTANT TEXT     := 'America/Edmonton';
    k_window_length CONSTANT INTERVAL := INTERVAL '1 hour';   -- one start hour
BEGIN
    RETURN (p_date + p_start_hour * k_window_length) AT TIME ZONE k_time_zone;
END;
$$;

-- End of a pickup window: start + 1 hour on the instant (contract "Time rules"),
-- so startHour 23 ends at 00:00 the next day. "The selected window has ended"
-- means now() >= req_window_end(...).
CREATE OR REPLACE FUNCTION requests.req_window_end(p_date DATE, p_start_hour SMALLINT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_window_length CONSTANT INTERVAL := INTERVAL '1 hour';
BEGIN
    RETURN requests.req_window_start(p_date, p_start_hour) + k_window_length;
END;
$$;

-- The request's current status: its latest status change (the model stores no
-- status column). NULL if the request doesn't exist.
CREATE OR REPLACE FUNCTION requests.req_current_status(p_request_id UUID)
RETURNS VARCHAR(30)
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    v_status VARCHAR(30);
BEGIN
    SELECT s.status INTO v_status
    FROM status_change s
    WHERE s.pickup_request_id = p_request_id
    ORDER BY s.changed_at DESC
    LIMIT 1;

    RETURN v_status;                          -- NULL when no row was found
END;
$$;

-- expiresAt (contract 12.2): the start of the latest active window. Derived each
-- time, so it follows any change to the active windows. NULL if the request has no
-- active window (only a request that doesn't exist; the model always keeps 1-3).
CREATE OR REPLACE FUNCTION requests.req_expires_at(p_request_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    v_expires_at TIMESTAMPTZ;
BEGIN
    SELECT max(requests.req_window_start(w.pickup_date, w.start_hour)) INTO v_expires_at
    FROM pickup_window w
    WHERE w.pickup_request_id = p_request_id
      AND w.is_active;

    RETURN v_expires_at;
END;
$$;

-- The request's owner (resident): the account of the creation terms acceptance
-- (the model has no owner column). NULL if the request doesn't exist.
CREATE OR REPLACE FUNCTION requests.req_owner_id(p_request_id UUID)
RETURNS VARCHAR(50)
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    v_owner_id VARCHAR(50);
BEGIN
    SELECT ta.account_id INTO v_owner_id
    FROM pickup_request p
    JOIN terms_acceptance ta ON ta.terms_acceptance_id = p.terms_acceptance_id
    WHERE p.pickup_request_id = p_request_id;

    RETURN v_owner_id;
END;
$$;

-- How the caller relates to the request: the column of Q8's visibility table
-- (contract 5.2). NULL when Q8 hides the request from them, or it doesn't
-- exist. Q8 and every write's state check ask this one function, so a caller
-- Q8 answers with 404 gets 404 from every other endpoint too, never 403
-- (contract Conventions, NFR03).
--   'owner'               the request's resident; wins when also the volunteer
--   'assigned_volunteer'  the volunteer of an assignment that is unfinished or
--                         ended by their delivery
--   'volunteer'           any active volunteer, while the request is Open
CREATE OR REPLACE FUNCTION requests.req_viewer(p_request_id UUID, p_viewer_id VARCHAR(50))
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_viewer_owner     CONSTANT TEXT := 'owner';
    k_viewer_assigned  CONSTANT TEXT := 'assigned_volunteer';
    k_viewer_volunteer CONSTANT TEXT := 'volunteer';
    k_status_open      CONSTANT VARCHAR(30) := 'Open';
    k_end_delivered    CONSTANT VARCHAR(30) := 'Delivered';   -- assignment end_reason
    v_status       VARCHAR(30);
    v_is_owner     BOOLEAN;   -- the caller is the request's resident
    v_is_linked    BOOLEAN;   -- the caller has an unfinished or delivered assignment on it
    v_is_volunteer BOOLEAN;   -- the caller is a volunteer with an active account
BEGIN
    -- Read the current status; none means no such request.
    v_status := requests.req_current_status(p_request_id);
    IF v_status IS NULL THEN
        RETURN NULL;
    END IF;

    -- Compare the caller with the request's resident.
    v_is_owner := requests.req_owner_id(p_request_id) = p_viewer_id;

    -- Look for the caller's unfinished assignment (at most one per request, 12.7)
    -- or delivered one (Delivered is final).
    v_is_linked := EXISTS (
        SELECT 1 FROM assignment a
        JOIN pickup_window pw    ON pw.pickup_window_id = a.pickup_window_id
        JOIN terms_acceptance ta ON ta.terms_acceptance_id = a.terms_acceptance_id
        WHERE pw.pickup_request_id = p_request_id
          AND ta.account_id = p_viewer_id
          AND (a.ended_at IS NULL OR a.end_reason = k_end_delivered));

    -- Look up the caller's volunteer row with an active account.
    v_is_volunteer := EXISTS (
        SELECT 1 FROM volunteer vo
        JOIN account ac ON ac.account_id = vo.account_id
        WHERE vo.account_id = p_viewer_id
          AND ac.deactivated_at IS NULL);

    IF v_is_owner THEN
        RETURN k_viewer_owner;
    END IF;
    IF v_is_linked THEN
        RETURN k_viewer_assigned;
    END IF;
    IF v_status = k_status_open AND v_is_volunteer THEN
        RETURN k_viewer_volunteer;
    END IF;
    RETURN NULL;
END;
$$;

-- matchedVolunteerUids for E1 and E2 (contract 10.3): every volunteer whose
-- preferred postal codes include the request's postal code (exact 6-character
-- match), leaving out deactivated accounts and the request's own resident. In
-- demo mode the resident stays in (contract 17.5). Sorted, so the list is the
-- same every time; an empty array (not NULL) when nobody matches.
CREATE OR REPLACE FUNCTION requests.req_matched_volunteers(p_request_id UUID, p_demo BOOLEAN)
RETURNS VARCHAR(50)[]
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    v_owner_id VARCHAR(50);
    v_ids      VARCHAR(50)[];
BEGIN
    -- A missing flag is a bug in the caller: guessing could notify the wrong people.
    IF p_demo IS NULL THEN
        RAISE EXCEPTION 'req_matched_volunteers: p_demo must not be NULL';
    END IF;

    v_owner_id := requests.req_owner_id(p_request_id);

    -- array_agg over no rows gives NULL, so coalesce turns it into '{}'.
    SELECT coalesce(array_agg(v.account_id ORDER BY v.account_id), '{}') INTO v_ids
    FROM pickup_request p
    JOIN volunteer_preferred_postal_code v ON v.postal_code = p.pickup_postal_code
    JOIN account a ON a.account_id = v.account_id
    WHERE p.pickup_request_id = p_request_id
      AND a.deactivated_at IS NULL
      AND (p_demo OR v.account_id <> v_owner_id);

    RETURN v_ids;
END;
$$;

-- Field checks for new pickup windows: creating (Q4), editing (Q9), a resident's
-- assignment cancellation with windows (Q12) and a reschedule (Q14). Element i of
-- p_dates and p_hours is one slot. Every failure is returned, nothing is raised:
-- the write function adds them to its own lists and writes nothing if any.
--   p_field       path prefix in the error fields: 'windows' or 'reschedule.windows'
--   p_now         each window must start after this moment
--   p_created_at  ... and end by p_created_at + 30 days (FR07; the original
--                 createdAt when editing or reopening, the new one when creating)
-- One entry per window, for the first rule it breaks, in this order: in the
-- future, within 30 days, not a repeat of an earlier slot. Error paths are
-- zero-based (contract), PL/pgSQL arrays start at 1, so the path uses i - 1.
-- The shape (date format, hour 0-23, 1-3 items) is checked in TypeScript first;
-- the count is checked again here because 1-3 is a model rule. A NULL argument
-- or element, or arrays of different lengths, is a bug in the caller and raises.
CREATE OR REPLACE FUNCTION requests.req_validate_windows(
    p_field          TEXT,
    p_dates          DATE[],
    p_hours          SMALLINT[],
    p_now            TIMESTAMPTZ,
    p_created_at     TIMESTAMPTZ,
    OUT error_fields   TEXT[],
    OUT error_messages TEXT[])
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_max_period    CONSTANT INTERVAL := INTERVAL '30 days';   -- FR07
    k_msg_count     CONSTANT TEXT := 'must have 1 to 3 windows';
    k_msg_future    CONSTANT TEXT := 'must start in the future';
    k_msg_period    CONSTANT TEXT := 'must end within 30 days of the request''s creation';
    v_count INT := coalesce(cardinality(p_dates), 0);   -- cardinality(NULL) is NULL
    v_start TIMESTAMPTZ;
    v_end   TIMESTAMPTZ;
    v_first INT;                                         -- earlier slot repeated by i
BEGIN
    error_fields   := '{}';
    error_messages := '{}';

    -- array_position(a, NULL) finds a NULL element (it compares with IS NOT DISTINCT FROM).
    IF p_field IS NULL OR p_now IS NULL OR p_created_at IS NULL
       OR v_count <> coalesce(cardinality(p_hours), 0)
       OR array_position(p_dates, NULL) IS NOT NULL
       OR array_position(p_hours, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'req_validate_windows: NULL argument, NULL window or unpaired arrays';
    END IF;

    IF v_count NOT BETWEEN 1 AND 3 THEN
        error_fields   := array_append(error_fields, p_field);
        error_messages := array_append(error_messages, k_msg_count);
        RETURN;
    END IF;

    FOR i IN 1 .. v_count LOOP
        v_start := requests.req_window_start(p_dates[i], p_hours[i]);
        v_end   := requests.req_window_end(p_dates[i], p_hours[i]);

        SELECT min(j) INTO v_first
        FROM generate_subscripts(p_dates, 1) AS j
        WHERE j < i AND p_dates[j] = p_dates[i] AND p_hours[j] = p_hours[i];

        IF v_start <= p_now THEN
            error_fields   := array_append(error_fields, format('%s[%s]', p_field, i - 1));
            error_messages := array_append(error_messages, k_msg_future);
        ELSIF v_end > p_created_at + k_max_period THEN
            error_fields   := array_append(error_fields, format('%s[%s]', p_field, i - 1));
            error_messages := array_append(error_messages, k_msg_period);
        ELSIF v_first IS NOT NULL THEN
            error_fields   := array_append(error_fields, format('%s[%s]', p_field, i - 1));
            error_messages := array_append(error_messages, format('same slot as %s[%s]', p_field, v_first - 1));
        END IF;
    END LOOP;
END;
$$;
