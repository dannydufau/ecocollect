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
CREATE OR REPLACE FUNCTION ecocollect608.req_validate_windows(
    p_field          TEXT,
    p_dates          DATE[],
    p_hours          SMALLINT[],
    p_now            TIMESTAMPTZ,
    p_created_at     TIMESTAMPTZ,
    OUT error_fields   TEXT[],
    OUT error_messages TEXT[])
LANGUAGE plpgsql
STABLE
SET search_path TO ecocollect608, pg_temp
AS $$
DECLARE
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
        error_messages := array_append(error_messages, 'must have 1 to 3 windows');
        RETURN;
    END IF;

    FOR i IN 1 .. v_count LOOP
        v_start := ecocollect608.req_window_start(p_dates[i], p_hours[i]);
        v_end   := ecocollect608.req_window_end(p_dates[i], p_hours[i]);

        SELECT min(j) INTO v_first
        FROM generate_subscripts(p_dates, 1) AS j
        WHERE j < i AND p_dates[j] = p_dates[i] AND p_hours[j] = p_hours[i];

        IF v_start <= p_now THEN
            error_fields   := array_append(error_fields, format('%s[%s]', p_field, i - 1));
            error_messages := array_append(error_messages, 'must start in the future');
        ELSIF v_end > p_created_at + INTERVAL '30 days' THEN
            error_fields   := array_append(error_fields, format('%s[%s]', p_field, i - 1));
            error_messages := array_append(error_messages, 'must end within 30 days of the request''s creation');
        ELSIF v_first IS NOT NULL THEN
            error_fields   := array_append(error_fields, format('%s[%s]', p_field, i - 1));
            error_messages := array_append(error_messages, format('same slot as %s[%s]', p_field, v_first - 1));
        END IF;
    END LOOP;
END;
$$;
