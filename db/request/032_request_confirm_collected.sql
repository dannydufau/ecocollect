-- Q13 confirm collected (contract 5.2 Q13, 12.1; FR15): the owner confirms that
-- the assigned volunteer has picked up the items. Assigned -> Collected, E4.
-- Needs 022 (helpers), 023 (req_enqueue_event), 024 (check_request).
-- Created in "requests"; course tables are named without a schema (see 020).

-- req_check_confirm_collected: the state checks of a confirmation, shared by
-- req_confirm_collected and req_get_detail's allowed_actions. Read-only (STABLE),
-- takes no lock: req_confirm_collected locks the request row before calling it.
-- Internal, never called by TypeScript. No time parameter: confirming has no
-- timing rule (before or after the selected window ends).
--
-- Returns the first rule that fails, in this order:
--   'forbidden'     p_resident_id is not the request's owner, or the owner's
--                   account is deactivated
--   'not_assigned'  any other status than Assigned (Collected already included)
--   'ok'            the owner may confirm
-- A request that doesn't exist raises: callers answer 404 before calling this.
CREATE OR REPLACE FUNCTION requests.req_check_confirm_collected(
    p_request_id  UUID,
    p_resident_id VARCHAR(50))
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path TO requests, ecocollect608, pg_temp
AS $$
DECLARE
    k_code_ok           CONSTANT TEXT := 'ok';
    k_code_forbidden    CONSTANT TEXT := 'forbidden';
    k_code_not_assigned CONSTANT TEXT := 'not_assigned';
    k_status_assigned   CONSTANT VARCHAR(30) := 'Assigned';
    v_status VARCHAR(30);
BEGIN
    IF p_request_id IS NULL OR p_resident_id IS NULL THEN
        RAISE EXCEPTION 'req_check_confirm_collected: missing argument';
    END IF;

    v_status := requests.req_current_status(p_request_id);
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'req_check_confirm_collected: request % not found', p_request_id;
    END IF;

    -- 1. The owner, with an active account. First, so a non-owner never learns
    -- the request's state.
    IF requests.req_owner_id(p_request_id) IS DISTINCT FROM p_resident_id
       OR NOT EXISTS (
            SELECT 1 FROM account ac
            WHERE ac.account_id = p_resident_id
              AND ac.deactivated_at IS NULL) THEN
        RETURN k_code_forbidden;
    END IF;

    -- 2. Only an Assigned request (one unfinished assignment, not collected).
    IF v_status <> k_status_assigned THEN
        RETURN k_code_not_assigned;
    END IF;

    RETURN k_code_ok;
END;
$$;

-- req_confirm_collected: Q13, in one call and one transaction. Called by
-- TypeScript as
--   SELECT * FROM requests.req_confirm_collected($1, $2, $3)
--
-- result_code:
--   'ok'                   collected; the assignment's collected_at is set
--   'request_unavailable'  no such request (404)
--   'forbidden', 'not_assigned'   from req_check_confirm_collected
-- Business failures are returned; a RAISE means a bug and rolls back everything.
CREATE OR REPLACE FUNCTION requests.req_confirm_collected(
    p_request_id  UUID,
    p_resident_id VARCHAR(50),
    p_trace_id    TEXT,
    OUT result_code TEXT)
LANGUAGE plpgsql
SET search_path TO requests, ecocollect608, pg_temp
AS $$
DECLARE
    k_code_ok          CONSTANT TEXT := 'ok';
    k_code_unavailable CONSTANT TEXT := 'request_unavailable';
    k_status_collected CONSTANT VARCHAR(30) := 'Collected';
    k_event_collected  CONSTANT TEXT := 'RequestAssignmentCollected';
    v_at            TIMESTAMPTZ;            -- the action's one moment, taken after the lock
    v_check         TEXT;
    v_assignment_id UUID;
    v_transition_id UUID := gen_random_uuid();
BEGIN
    IF p_request_id IS NULL OR p_resident_id IS NULL THEN
        RAISE EXCEPTION 'req_confirm_collected: missing argument';
    END IF;

    -- 1. Lock the request row, then take the time (as in req_accept).
    PERFORM 1 FROM pickup_request p WHERE p.pickup_request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        result_code := k_code_unavailable;
        RETURN;
    END IF;
    v_at := clock_timestamp();

    -- 2. State checks.
    v_check := requests.req_check_confirm_collected(p_request_id, p_resident_id);
    IF v_check <> k_code_ok THEN
        result_code := v_check;
        RETURN;
    END IF;

    -- 3. Writes, at v_at: the unfinished, not yet collected assignment (Assigned
    -- has exactly one, check_request rule 7). UPDATE ... RETURNING INTO raises if
    -- it matches more than one row; no row at all is checked below. Both are bugs.
    -- UPDATE ... FROM is PostgreSQL's join in an UPDATE: the assignment is found
    -- through its window (pickup_window_id is the window's key, so one match each).
    UPDATE assignment a
    SET collected_at = v_at
    FROM pickup_window pw
    WHERE pw.pickup_window_id = a.pickup_window_id
      AND pw.pickup_request_id = p_request_id
      AND a.ended_at IS NULL
      AND a.collected_at IS NULL
    RETURNING a.assignment_id INTO v_assignment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'req_confirm_collected: request % is Assigned without an active assignment', p_request_id;
    END IF;

    INSERT INTO status_change (pickup_request_id, changed_at, status, reason)
    VALUES (p_request_id, v_at, k_status_collected, NULL);

    -- 4. RequestAssignmentCollected (E4), with the assignment.
    PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => k_event_collected,
                                       p_transition_id => v_transition_id, p_at => v_at,
                                       p_trace_id => p_trace_id, p_assignment_id => v_assignment_id);

    -- 5. Post-condition: only a bug can trip it.
    PERFORM requests.check_request(p_request_id);

    result_code := k_code_ok;
END;
$$;
