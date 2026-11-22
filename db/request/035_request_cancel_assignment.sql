-- Q12 cancel assignment (contract 5.2 Q12, 12.2, 12.3, 12.4; FR11, FR14): the owner
-- or the assigned volunteer cancels the assignment before collection. The
-- assignment ends Resident_Cancelled (E6) or Volunteer_Cancelled (E7); then the
-- request reopens (Open, E2 'reopened') or, with no window left in the future,
-- expires (Expired, E10 'assignment_cancelled').
-- Needs 022 (helpers), 023 (req_enqueue_event), 024 (check_request).
-- Created in "requests"; course tables are named without a schema (see 020).

-- req_check_cancel_assignment: the state checks of an assignment cancellation,
-- shared by req_cancel_assignment and req_get_detail's allowed_actions. Read-only
-- (STABLE), takes no lock: req_cancel_assignment locks the request row before
-- calling it. Internal, never called by TypeScript.
--   p_actor_id  the caller
--   p_as        'resident', 'volunteer' or NULL (the body's `as`)
--   p_at        the moment to judge "window ended" at
--
-- The caller's sides on this request:
--   resident   the owner
--   volunteer  the volunteer of the request's latest assignment (by accepted_at),
--              with a volunteer row. Latest, not only unfinished: after their own
--              cancellation a repeat call gets 'no_active_assignment', not 'forbidden'.
--
-- Returns the first rule that fails, in this order:
--   'forbidden'             neither side, or the caller's account is deactivated
--   'as_required'           both sides and p_as is NULL (the write function turns
--                           it into a 400 under `as`)
--   'forbidden'             p_as names a side the caller doesn't have
--   'no_active_assignment'  no assignment
--   'already_collected'     the latest assignment was collected (Collected, Delivered)
--   'no_active_assignment'  the latest one has ended
--   'window_ended'          resident side, and p_at >= the selected window's end (12.4)
--   'ok'                    the caller may cancel the assignment on that side
-- A request that doesn't exist raises: callers answer 404 before calling this.
CREATE OR REPLACE FUNCTION requests.req_check_cancel_assignment(
    p_request_id UUID,
    p_actor_id   VARCHAR(50),
    p_as         TEXT,
    p_at         TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_code_ok              CONSTANT TEXT := 'ok';
    k_code_forbidden       CONSTANT TEXT := 'forbidden';
    k_code_as_required     CONSTANT TEXT := 'as_required';
    k_code_collected       CONSTANT TEXT := 'already_collected';
    k_code_no_active       CONSTANT TEXT := 'no_active_assignment';
    k_code_window_ended    CONSTANT TEXT := 'window_ended';
    k_as_resident          CONSTANT TEXT := 'resident';
    k_as_volunteer         CONSTANT TEXT := 'volunteer';
    v_latest        RECORD;      -- the latest assignment: volunteer, collected_at, ended_at, window end
    v_has_assignment BOOLEAN;    -- the request has at least one assignment
    v_is_owner      BOOLEAN;     -- resident side
    v_is_volunteer  BOOLEAN;     -- volunteer side
    v_is_active     BOOLEAN;     -- the caller's account is not deactivated
    v_side          TEXT;        -- the side this call acts on
BEGIN
    IF p_request_id IS NULL OR p_actor_id IS NULL OR p_at IS NULL THEN
        RAISE EXCEPTION 'req_check_cancel_assignment: missing argument';
    END IF;
    IF p_as IS NOT NULL AND p_as NOT IN (k_as_resident, k_as_volunteer) THEN
        RAISE EXCEPTION 'req_check_cancel_assignment: unknown p_as %', p_as;
    END IF;
    IF requests.req_current_status(p_request_id) IS NULL THEN
        RAISE EXCEPTION 'req_check_cancel_assignment: request % not found', p_request_id;
    END IF;

    -- The latest assignment, found through its window and the volunteer's terms
    -- acceptance. accepted_at is unique per request (it is an Assigned status change).
    SELECT ta.account_id AS volunteer_id, a.collected_at, a.ended_at,
           requests.req_window_end(pw.pickup_date, pw.start_hour) AS window_end
    INTO v_latest
    FROM assignment a
    JOIN pickup_window pw    ON pw.pickup_window_id = a.pickup_window_id
    JOIN terms_acceptance ta ON ta.terms_acceptance_id = a.terms_acceptance_id
    WHERE pw.pickup_request_id = p_request_id
    ORDER BY a.accepted_at DESC
    LIMIT 1;
    v_has_assignment := FOUND;   -- read FOUND at once: the next statement changes it

    -- Read from the model tables (not from X-User-Roles), as req_check_accept does.
    -- With no assignment, v_latest.volunteer_id is NULL and the comparison is NULL.
    v_is_owner     := requests.req_owner_id(p_request_id) = p_actor_id;
    v_is_volunteer := coalesce(v_latest.volunteer_id = p_actor_id, false)
                      AND EXISTS (SELECT 1 FROM volunteer vo WHERE vo.account_id = p_actor_id);
    v_is_active    := EXISTS (
        SELECT 1 FROM account ac
        WHERE ac.account_id = p_actor_id
          AND ac.deactivated_at IS NULL);

    -- 1. One of the two sides, with an active account. First, so a stranger never
    -- learns the request's state.
    IF NOT v_is_owner AND NOT v_is_volunteer THEN
        RETURN k_code_forbidden;
    END IF;
    IF NOT v_is_active THEN
        RETURN k_code_forbidden;
    END IF;

    -- 2. Which side. Both (a self-assignment): `as` is required.
    IF v_is_owner AND v_is_volunteer AND p_as IS NULL THEN
        RETURN k_code_as_required;
    END IF;
    IF p_as = k_as_resident AND NOT v_is_owner THEN
        RETURN k_code_forbidden;
    END IF;
    IF p_as = k_as_volunteer AND NOT v_is_volunteer THEN
        RETURN k_code_forbidden;
    END IF;
    IF p_as IS NOT NULL THEN
        v_side := p_as;
    ELSIF v_is_owner THEN
        v_side := k_as_resident;
    ELSE
        v_side := k_as_volunteer;
    END IF;

    -- 3. The latest assignment must be Active: unfinished and not collected. A
    -- cancelled or missed assignment is never collected, so collected_at alone
    -- means Collected or Delivered.
    IF NOT v_has_assignment THEN
        RETURN k_code_no_active;
    END IF;
    IF v_latest.collected_at IS NOT NULL THEN
        RETURN k_code_collected;
    END IF;
    IF v_latest.ended_at IS NOT NULL THEN
        RETURN k_code_no_active;
    END IF;

    -- 4. The resident cancels only until the selected window ends (12.4); the
    -- volunteer any time before collection (FR14).
    IF v_side = k_as_resident AND p_at >= v_latest.window_end THEN
        RETURN k_code_window_ended;
    END IF;

    RETURN k_code_ok;
END;
$$;

-- req_cancel_assignment: Q12, in one call and one transaction. Called by TypeScript as
--   SELECT * FROM requests.req_cancel_assignment($1, $2, $3, $4, $5, $6, $7, $8)
-- p_reason is already checked and normalised by TypeScript (at most 500
-- characters; blank -> NULL); SQL stores it as given, on the Open or Expired row.
-- p_dates / p_hours: the body's windows (slot i = element i), both NULL when none.
--
-- result_code:
--   'ok'                   cancelled; the request is now Open or Expired
--   'request_unavailable'  no such request (404)
--   'forbidden', 'already_collected', 'no_active_assignment', 'window_ended'
--                          from req_check_cancel_assignment
--   'validation_failed'    error_fields / error_messages say why: `as` missing for
--                          a caller on both sides, windows from the volunteer side,
--                          or req_validate_windows' failures. Nothing written.
-- Business failures are returned; a RAISE means a bug and rolls back everything.
CREATE OR REPLACE FUNCTION requests.req_cancel_assignment(
    p_request_id UUID,
    p_actor_id   VARCHAR(50),
    p_as         TEXT,                      -- 'resident', 'volunteer' or NULL
    p_reason     TEXT,                      -- NULL when none
    p_dates      DATE[],                    -- NULL when no windows were sent
    p_hours      SMALLINT[],
    p_demo       BOOLEAN,                   -- DEMO_MODE (contract 2.4, 17.5): E2's matched volunteers
    p_trace_id   TEXT,
    OUT result_code    TEXT,
    OUT error_fields   TEXT[],
    OUT error_messages TEXT[])
LANGUAGE plpgsql
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_code_ok              CONSTANT TEXT := 'ok';
    k_code_unavailable     CONSTANT TEXT := 'request_unavailable';
    k_code_as_required     CONSTANT TEXT := 'as_required';   -- from req_check_cancel_assignment
    k_code_validation      CONSTANT TEXT := 'validation_failed';
    k_as_resident          CONSTANT TEXT := 'resident';
    k_field_as             CONSTANT TEXT := 'as';
    k_field_windows        CONSTANT TEXT := 'windows';
    k_msg_required         CONSTANT TEXT := 'is required';
    k_msg_resident_only    CONSTANT TEXT := 'only the resident can send windows';
    k_status_open          CONSTANT VARCHAR(30) := 'Open';
    k_status_expired       CONSTANT VARCHAR(30) := 'Expired';
    k_end_resident         CONSTANT VARCHAR(30) := 'Resident_Cancelled';
    k_end_volunteer        CONSTANT VARCHAR(30) := 'Volunteer_Cancelled';
    k_event_cancelled_res  CONSTANT TEXT := 'RequestAssignmentCancelledResident';
    k_event_cancelled_vol  CONSTANT TEXT := 'RequestAssignmentCancelledVolunteer';
    k_event_updated        CONSTANT TEXT := 'RequestUpdated';
    k_event_expired        CONSTANT TEXT := 'RequestExpired';
    k_reason_reopened      CONSTANT TEXT := 'reopened';
    k_trigger_cancelled    CONSTANT VARCHAR(30) := 'assignment_cancelled';
    k_cancellation_window  CONSTANT INTERVAL := INTERVAL '24 hours';   -- before the window starts
    v_at            TIMESTAMPTZ;            -- the action's one moment, taken after the lock
    v_created_at    TIMESTAMPTZ;            -- the request's original createdAt (FR07)
    v_check         TEXT;
    v_is_resident   BOOLEAN;                -- this call acts on the resident side
    v_win           RECORD;                 -- req_validate_windows' two OUT arrays
    v_assignment_id UUID;                   -- the assignment this call ends
    v_start         TIMESTAMPTZ;            -- its window's start
    v_outside       BOOLEAN;                -- resident: cancelled less than 24 h before v_start
    v_reopens       BOOLEAN;                -- a window is still in the future after the change
    v_transition_id UUID := gen_random_uuid();
BEGIN
    IF p_request_id IS NULL OR p_actor_id IS NULL OR p_demo IS NULL THEN
        RAISE EXCEPTION 'req_cancel_assignment: missing argument';
    END IF;
    error_fields   := '{}';
    error_messages := '{}';

    -- 1. Lock the request row, then take the time (as in req_accept).
    SELECT p.created_at INTO v_created_at
    FROM pickup_request p WHERE p.pickup_request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        result_code := k_code_unavailable;
        RETURN;
    END IF;
    v_at := clock_timestamp();

    -- 2. State checks. 'as_required' is a field error of the body.
    v_check := requests.req_check_cancel_assignment(p_request_id, p_actor_id, p_as, v_at);
    IF v_check = k_code_as_required THEN
        error_fields   := array_append(error_fields, k_field_as);
        error_messages := array_append(error_messages, k_msg_required);
        result_code := k_code_validation;
        RETURN;
    ELSIF v_check <> k_code_ok THEN
        result_code := v_check;
        RETURN;
    END IF;

    -- The side. After 'ok', p_as is set whenever the caller is on both sides, so
    -- without it the caller is the owner exactly when they are on the resident side.
    IF p_as IS NOT NULL THEN
        v_is_resident := p_as = k_as_resident;
    ELSE
        v_is_resident := requests.req_owner_id(p_request_id) = p_actor_id;
    END IF;

    -- 3. Field checks: windows only from the resident, within 30 days of the
    -- original createdAt (FR07, 12.2).
    IF p_dates IS NOT NULL AND NOT v_is_resident THEN
        error_fields   := array_append(error_fields, k_field_windows);
        error_messages := array_append(error_messages, k_msg_resident_only);
    END IF;
    IF p_dates IS NOT NULL AND v_is_resident THEN
        v_win := requests.req_validate_windows(k_field_windows, p_dates, p_hours, v_at, v_created_at);
        error_fields   := error_fields   || v_win.error_fields;
        error_messages := error_messages || v_win.error_messages;
    END IF;
    IF cardinality(error_fields) > 0 THEN
        result_code := k_code_validation;
        RETURN;
    END IF;

    -- 4. End the unfinished assignment at v_at (exactly one, check_request rule 7),
    -- and get its window start back for outsideCancellationWindow (12.4).
    UPDATE assignment a
    SET ended_at   = v_at,
        end_reason = CASE WHEN v_is_resident THEN k_end_resident ELSE k_end_volunteer END
    FROM pickup_window pw
    WHERE pw.pickup_window_id = a.pickup_window_id
      AND pw.pickup_request_id = p_request_id
      AND a.ended_at IS NULL
    RETURNING a.assignment_id, requests.req_window_start(pw.pickup_date, pw.start_hour)
    INTO v_assignment_id, v_start;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'req_cancel_assignment: request % has no unfinished assignment', p_request_id;
    END IF;
    IF v_is_resident THEN
        v_outside := v_at > v_start - k_cancellation_window;
    END IF;

    -- 5. Resident windows replace the active ones. The old rows stay, inactive: the
    -- ended assignment still points at its window.
    IF p_dates IS NOT NULL THEN
        UPDATE pickup_window pw
        SET is_active = FALSE
        WHERE pw.pickup_request_id = p_request_id
          AND pw.is_active;

        INSERT INTO pickup_window (pickup_window_id, pickup_request_id, pickup_date, start_hour, is_active)
        SELECT gen_random_uuid(), p_request_id, w.d, w.h, TRUE
        FROM unnest(p_dates, p_hours) AS w(d, h);
    END IF;

    -- 6. Reopen or expire (12.3): Open while a window is still in the future
    -- (v_at < expiresAt, the same comparison as 12.6), otherwise Expired. The
    -- caller's reason goes on that row either way.
    v_reopens := v_at < requests.req_expires_at(p_request_id);
    IF v_reopens THEN
        INSERT INTO status_change (pickup_request_id, changed_at, status, reason)
        VALUES (p_request_id, v_at, k_status_open, p_reason);
    ELSE
        INSERT INTO status_change (pickup_request_id, changed_at, status, reason)
        VALUES (p_request_id, v_at, k_status_expired, p_reason);
    END IF;

    -- 7. Events, one transitionId: E6 or E7, then E2 'reopened' or E10.
    IF v_is_resident THEN
        PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => k_event_cancelled_res,
                                           p_transition_id => v_transition_id, p_at => v_at,
                                           p_trace_id => p_trace_id, p_assignment_id => v_assignment_id,
                                           p_outside_window => v_outside);
    ELSE
        PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => k_event_cancelled_vol,
                                           p_transition_id => v_transition_id, p_at => v_at,
                                           p_trace_id => p_trace_id, p_assignment_id => v_assignment_id);
    END IF;
    IF v_reopens THEN
        PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => k_event_updated,
                                           p_transition_id => v_transition_id, p_at => v_at,
                                           p_trace_id => p_trace_id, p_reason => k_reason_reopened,
                                           p_demo => p_demo);
    ELSE
        PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => k_event_expired,
                                           p_transition_id => v_transition_id, p_at => v_at,
                                           p_trace_id => p_trace_id, p_trigger => k_trigger_cancelled);
    END IF;

    -- 8. Post-condition: only a bug can trip it.
    PERFORM requests.check_request(p_request_id);

    result_code := k_code_ok;
END;
$$;
