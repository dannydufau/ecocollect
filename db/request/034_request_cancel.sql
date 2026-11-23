-- Q10 cancel (contract 5.2 Q10, 12.4, 12.6; FR11): the owner cancels their request.
-- Open -> Cancelled, E9. Assigned (selected window not ended) -> the assignment
-- ends Resident_Cancelled, then Cancelled, E6 then E9.
-- Needs 022 (helpers), 023 (req_enqueue_event), 024 (check_request).
-- Created in "requests"; course tables are named without a schema (see 020).

-- req_check_cancel: the state checks of a cancellation, shared by req_cancel and
-- req_get_detail's allowed_actions. Read-only (STABLE), takes no lock: req_cancel
-- locks the request row before calling it. Internal, never called by TypeScript.
--   p_at  the moment to judge "overdue" and "window ended" at
--
-- Returns the first rule that fails, in this order:
--   'request_unavailable'  Q8 hides the request from the caller (req_viewer, 022)
--   'forbidden'        p_resident_id is not the request's owner, or the owner's
--                      account is deactivated
--   'overdue'          Open, but p_at >= expiresAt (12.6): req_cancel expires the
--                      request; for allowed_actions it is just "not ok"
--   'window_ended'     Assigned, and p_at >= the selected window's end (12.4)
--   'not_cancellable'  any other status (Collected, Delivered, Cancelled,
--                      Expired, Missed)
--   'ok'               the owner may cancel
-- 'overdue', 'window_ended' and 'not_cancellable' each belong to one status, so
-- they never compete.
-- A request that doesn't exist raises: callers answer 404 before calling this.
CREATE OR REPLACE FUNCTION requests.req_check_cancel(
    p_request_id  UUID,
    p_resident_id VARCHAR(50),
    p_at          TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_code_ok              CONSTANT TEXT := 'ok';
    k_code_forbidden       CONSTANT TEXT := 'forbidden';
    k_code_unavailable     CONSTANT TEXT := 'request_unavailable';
    k_code_overdue         CONSTANT TEXT := 'overdue';
    k_code_window_ended    CONSTANT TEXT := 'window_ended';
    k_code_not_cancellable CONSTANT TEXT := 'not_cancellable';
    k_status_open          CONSTANT VARCHAR(30) := 'Open';
    k_status_assigned      CONSTANT VARCHAR(30) := 'Assigned';
    v_status     VARCHAR(30);
    v_is_owner   BOOLEAN;       -- p_resident_id owns the request
    v_is_active  BOOLEAN;       -- and their account is not deactivated
    v_window_end TIMESTAMPTZ;   -- Assigned: the selected window's end
    v_is_visible BOOLEAN;       -- Q8 shows the request to the caller
BEGIN
    IF p_request_id IS NULL OR p_resident_id IS NULL OR p_at IS NULL THEN
        RAISE EXCEPTION 'req_check_cancel: missing argument';
    END IF;

    v_status := requests.req_current_status(p_request_id);
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'req_check_cancel: request % not found', p_request_id;
    END IF;

    -- 0. Hidden from the caller in Q8: the same 404 as Q8, never 403
    -- (contract Conventions, NFR03).
    v_is_visible := requests.req_viewer(p_request_id, p_resident_id) IS NOT NULL;
    IF NOT v_is_visible THEN
        RETURN k_code_unavailable;
    END IF;

    v_is_owner  := requests.req_owner_id(p_request_id) = p_resident_id;
    v_is_active := EXISTS (
        SELECT 1 FROM account ac
        WHERE ac.account_id = p_resident_id
          AND ac.deactivated_at IS NULL);

    -- 1. The owner, with an active account. First, so a non-owner never learns
    -- the request's state.
    IF NOT v_is_owner THEN
        RETURN k_code_forbidden;
    END IF;
    IF NOT v_is_active THEN
        RETURN k_code_forbidden;
    END IF;

    -- 2. Open: cancellable until it is overdue (the latest active window has started).
    IF v_status = k_status_open THEN
        IF requests.req_expires_at(p_request_id) <= p_at THEN
            RETURN k_code_overdue;
        END IF;
        RETURN k_code_ok;
    END IF;

    -- 3. Assigned: cancellable until the selected window ends. The selected window
    -- is the one of the unfinished assignment (exactly one, check_request rule 7).
    IF v_status = k_status_assigned THEN
        SELECT requests.req_window_end(pw.pickup_date, pw.start_hour) INTO STRICT v_window_end
        FROM assignment a
        JOIN pickup_window pw ON pw.pickup_window_id = a.pickup_window_id
        WHERE pw.pickup_request_id = p_request_id
          AND a.ended_at IS NULL;
        IF p_at >= v_window_end THEN
            RETURN k_code_window_ended;
        END IF;
        RETURN k_code_ok;
    END IF;

    -- 4. Every other status.
    RETURN k_code_not_cancellable;
END;
$$;

-- req_cancel: Q10, in one call and one transaction. Called by TypeScript as
--   SELECT * FROM requests.req_cancel($1, $2, $3, $4)
-- p_reason is already checked and normalised by TypeScript (at most 500
-- characters; blank -> NULL); SQL stores it as given.
--
-- result_code:
--   'ok'                   cancelled
--   'request_unavailable'  no such request (404)
--   'forbidden', 'window_ended', 'not_cancellable'   from req_check_cancel
--   'expired'              the request was overdue: it is now Expired, with its
--                          RequestExpired event, and that is committed (12.6)
-- Business failures are returned; a RAISE means a bug and rolls back everything.
CREATE OR REPLACE FUNCTION requests.req_cancel(
    p_request_id  UUID,
    p_resident_id VARCHAR(50),
    p_reason      TEXT,                     -- NULL when none
    p_trace_id    TEXT,
    OUT result_code TEXT)
LANGUAGE plpgsql
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_code_ok              CONSTANT TEXT := 'ok';
    k_code_unavailable     CONSTANT TEXT := 'request_unavailable';
    k_code_overdue         CONSTANT TEXT := 'overdue';      -- from req_check_cancel
    k_code_expired         CONSTANT TEXT := 'expired';
    k_status_assigned      CONSTANT VARCHAR(30) := 'Assigned';
    k_status_cancelled     CONSTANT VARCHAR(30) := 'Cancelled';
    k_status_expired       CONSTANT VARCHAR(30) := 'Expired';
    k_reason_no_window     CONSTANT TEXT := 'No window left in the future';
    k_end_resident         CONSTANT VARCHAR(30) := 'Resident_Cancelled';
    k_event_cancelled_res  CONSTANT TEXT := 'RequestAssignmentCancelledResident';
    k_event_cancelled      CONSTANT TEXT := 'RequestCancelled';
    k_event_expired        CONSTANT TEXT := 'RequestExpired';
    k_trigger_overdue      CONSTANT VARCHAR(30) := 'overdue_on_action';
    k_cancellation_window  CONSTANT INTERVAL := INTERVAL '24 hours';   -- before the window starts
    v_at            TIMESTAMPTZ;            -- the action's one moment, taken after the lock
    v_check         TEXT;
    v_was_assigned  BOOLEAN;                -- Assigned before this call
    v_assignment_id UUID;                   -- the assignment this call ends
    v_start         TIMESTAMPTZ;            -- its window's start
    v_outside       BOOLEAN;                -- cancelled less than 24 h before v_start
    v_transition_id UUID := gen_random_uuid();
BEGIN
    IF p_request_id IS NULL OR p_resident_id IS NULL THEN
        RAISE EXCEPTION 'req_cancel: missing argument';
    END IF;

    -- 1. Lock the request row, then take the time (as in req_accept).
    PERFORM 1 FROM pickup_request p WHERE p.pickup_request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        result_code := k_code_unavailable;
        RETURN;
    END IF;
    v_at := clock_timestamp();

    -- 2. State checks. Overdue: expire instead of cancelling, keep it, return
    -- 'expired' (as req_accept does). The resident's reason is not stored: the
    -- request was not cancelled.
    v_check := requests.req_check_cancel(p_request_id, p_resident_id, v_at);
    IF v_check = k_code_overdue THEN
        INSERT INTO status_change (pickup_request_id, changed_at, status, reason)
        VALUES (p_request_id, v_at, k_status_expired, k_reason_no_window);
        PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => k_event_expired,
                                           p_transition_id => v_transition_id, p_at => v_at,
                                           p_trace_id => p_trace_id, p_trigger => k_trigger_overdue);
        PERFORM requests.check_request(p_request_id);
        result_code := k_code_expired;
        RETURN;
    ELSIF v_check <> k_code_ok THEN
        result_code := v_check;
        RETURN;
    END IF;

    -- 3. Assigned: end the unfinished assignment at v_at (exactly one, check_request
    -- rule 7), and get its window start back for outsideCancellationWindow (12.4).
    v_was_assigned := requests.req_current_status(p_request_id) = k_status_assigned;
    IF v_was_assigned THEN
        UPDATE assignment a
        SET ended_at = v_at, end_reason = k_end_resident
        FROM pickup_window pw
        WHERE pw.pickup_window_id = a.pickup_window_id
          AND pw.pickup_request_id = p_request_id
          AND a.ended_at IS NULL
        RETURNING a.assignment_id, requests.req_window_start(pw.pickup_date, pw.start_hour)
        INTO v_assignment_id, v_start;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'req_cancel: request % is Assigned without an active assignment', p_request_id;
        END IF;
        v_outside := v_at > v_start - k_cancellation_window;
    END IF;

    -- 4. The Cancelled status change, with the resident's reason.
    INSERT INTO status_change (pickup_request_id, changed_at, status, reason)
    VALUES (p_request_id, v_at, k_status_cancelled, p_reason);

    -- 5. Events, one transitionId: E6 (Assigned only), then E9.
    IF v_was_assigned THEN
        PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => k_event_cancelled_res,
                                           p_transition_id => v_transition_id, p_at => v_at,
                                           p_trace_id => p_trace_id, p_assignment_id => v_assignment_id,
                                           p_outside_window => v_outside);
    END IF;
    PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => k_event_cancelled,
                                       p_transition_id => v_transition_id, p_at => v_at,
                                       p_trace_id => p_trace_id, p_reason => p_reason);

    -- 6. Post-condition: only a bug can trip it.
    PERFORM requests.check_request(p_request_id);

    result_code := k_code_ok;
END;
$$;
