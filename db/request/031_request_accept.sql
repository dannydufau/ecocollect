-- Q11 accept (contract 5.2 Q11, 12.1, 12.6, 12.7; FR13, FR22).
-- Needs 022 (helpers), 023 (req_enqueue_event), 024 (check_request).
-- Created in "requests"; course tables are named without a schema (see 020).

-- req_check_accept: the state checks of an accept, shared by req_accept and
-- req_get_detail's allowed_actions. Read-only (STABLE), takes no lock: req_accept
-- locks the request row before calling it. Internal, never called by TypeScript.
--   p_at  the moment to judge "overdue" at (now() of the caller's transaction)
--
-- Returns the first rule that fails, in this order:
--   'forbidden'         p_volunteer_id is not an active volunteer (no volunteer
--                       row, or the account is deactivated)
--   'already_assigned'  the request has an unfinished assignment (Assigned or
--                       Collected), whoever holds it, the caller included
--   'not_open'          any other status than Open (Delivered, Cancelled,
--                       Expired, Missed)
--   'overdue'           Open, but p_at >= expiresAt (12.6): no window is left in
--                       the future. req_accept expires the request; for
--                       allowed_actions it is just "not ok"
--   'ok'                the volunteer may accept
-- The owner may accept their own request when they are also a volunteer (FR13),
-- and a volunteer whose earlier assignment here ended may accept again.
-- A request that doesn't exist raises: callers answer 404 before calling this.
CREATE OR REPLACE FUNCTION requests.req_check_accept(
    p_request_id   UUID,
    p_volunteer_id VARCHAR(50),
    p_at           TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path TO requests, ecocollect608, pg_temp
AS $$
DECLARE
    v_status VARCHAR(30);
BEGIN
    IF p_request_id IS NULL OR p_volunteer_id IS NULL OR p_at IS NULL THEN
        RAISE EXCEPTION 'req_check_accept: missing argument';
    END IF;

    v_status := requests.req_current_status(p_request_id);
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'req_check_accept: request % not found', p_request_id;
    END IF;

    -- 1. An active volunteer, read from the model tables (not from X-User-Roles).
    IF NOT EXISTS (
        SELECT 1 FROM volunteer vo
        JOIN account ac ON ac.account_id = vo.account_id
        WHERE vo.account_id = p_volunteer_id
          AND ac.deactivated_at IS NULL) THEN
        RETURN 'forbidden';
    END IF;

    -- 2. One unfinished assignment per request (12.7): found through its window,
    -- ended_at IS NULL. Checked on the rows, not only on the status.
    IF EXISTS (
        SELECT 1 FROM assignment a
        JOIN pickup_window pw ON pw.pickup_window_id = a.pickup_window_id
        WHERE pw.pickup_request_id = p_request_id
          AND a.ended_at IS NULL) THEN
        RETURN 'already_assigned';
    END IF;

    -- 3. Only an Open request can be accepted.
    IF v_status <> 'Open' THEN
        RETURN 'not_open';
    END IF;

    -- 4. Overdue: the latest active window has started (expiresAt, 12.2).
    IF requests.req_expires_at(p_request_id) <= p_at THEN
        RETURN 'overdue';
    END IF;

    RETURN 'ok';
END;
$$;

-- req_accept: Q11, a volunteer accepts an Open request for one of its windows,
-- in one call and one transaction. Called by TypeScript as
--   SELECT * FROM requests.req_accept($1, $2, $3, $4, $5)
-- TypeScript passes NULL for a windowId or termsDocumentId that is not a UUID,
-- so the checks below answer it in their usual order.
--
-- result_code:
--   'ok'                   accepted; assignment_id is the new assignment
--   'request_unavailable'  no such request (404)
--   'forbidden', 'already_assigned', 'not_open'   from req_check_accept
--   'expired'              the request was overdue: it is now Expired, with its
--                          RequestExpired event, and that is committed (12.6)
--   'terms_outdated'       p_terms_document_id is not the current terms document
--   'validation_failed'    windowId is not one of this request's active windows
--                          that start in the future; nothing written
-- Business failures are returned; a RAISE means a bug and rolls back everything.
CREATE OR REPLACE FUNCTION requests.req_accept(
    p_request_id        UUID,
    p_volunteer_id      VARCHAR(50),
    p_window_id         UUID,               -- NULL when not a UUID
    p_terms_document_id UUID,               -- NULL when not a UUID
    p_trace_id          TEXT,
    OUT result_code    TEXT,
    OUT error_fields   TEXT[],
    OUT error_messages TEXT[],
    OUT assignment_id  UUID)
LANGUAGE plpgsql
SET search_path TO requests, ecocollect608, pg_temp
AS $$
DECLARE
    v_at            TIMESTAMPTZ;            -- the action's one moment, taken after the lock
    v_check         TEXT;
    v_current_terms UUID;
    v_ta_id         UUID := gen_random_uuid();
    v_assignment_id UUID := gen_random_uuid();
    v_transition_id UUID := gen_random_uuid();
BEGIN
    error_fields   := '{}';
    error_messages := '{}';

    IF p_request_id IS NULL OR p_volunteer_id IS NULL THEN
        RAISE EXCEPTION 'req_accept: missing argument';
    END IF;

    -- 1. Lock the request row: actions on one request run one after another.
    PERFORM 1 FROM pickup_request p WHERE p.pickup_request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        result_code := 'request_unavailable';
        RETURN;
    END IF;
    -- The time once, after the lock: now() is when the transaction started, and a
    -- transaction that started later may have locked and written first. Used for
    -- every check and every write below, so status changes sort in the order the
    -- actions really ran.
    v_at := clock_timestamp();

    -- 2. State checks. Overdue: expire instead of accepting, keep it, return 'expired'.
    v_check := requests.req_check_accept(p_request_id, p_volunteer_id, v_at);
    IF v_check = 'overdue' THEN
        INSERT INTO status_change (pickup_request_id, changed_at, status, reason)
        VALUES (p_request_id, v_at, 'Expired', 'No window left in the future');
        PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => 'RequestExpired',
                                           p_transition_id => v_transition_id, p_at => v_at,
                                           p_trace_id => p_trace_id, p_trigger => 'overdue_on_action');
        PERFORM requests.check_request(p_request_id);
        result_code := 'expired';
        RETURN;
    ELSIF v_check <> 'ok' THEN
        result_code := v_check;
        RETURN;
    END IF;

    -- 3. The terms must be the current document at v_at (check_request compares
    -- the acceptance's accepted_at with the documents' published_at).
    SELECT d.terms_document_id INTO v_current_terms
    FROM terms_document d
    WHERE d.published_at <= v_at
    ORDER BY d.published_at DESC
    LIMIT 1;
    IF p_terms_document_id IS DISTINCT FROM v_current_terms THEN
        result_code := 'terms_outdated';
        RETURN;
    END IF;

    -- 4. Field check: an active window of this request that starts after v_at.
    IF NOT EXISTS (
        SELECT 1 FROM pickup_window pw
        WHERE pw.pickup_window_id = p_window_id      -- no match when NULL
          AND pw.pickup_request_id = p_request_id
          AND pw.is_active
          AND requests.req_window_start(pw.pickup_date, pw.start_hour) > v_at) THEN
        error_fields   := ARRAY['windowId'];
        error_messages := ARRAY['must be an active window of this request that has not started'];
        result_code    := 'validation_failed';
        RETURN;
    END IF;

    -- 5. Writes, all at v_at: the volunteer's terms acceptance (FR22), the
    -- assignment (its volunteer is the acceptance's account), the status change.
    INSERT INTO terms_acceptance (terms_acceptance_id, terms_document_id, account_id, accepted_at, type)
    VALUES (v_ta_id, p_terms_document_id, p_volunteer_id, v_at, 'AT_VOLUNTEER_ACCEPTANCE');

    INSERT INTO assignment (assignment_id, pickup_window_id, terms_acceptance_id, accepted_at,
                            collected_at, ended_at, end_reason)
    VALUES (v_assignment_id, p_window_id, v_ta_id, v_at, NULL, NULL, NULL);

    INSERT INTO status_change (pickup_request_id, changed_at, status, reason)
    VALUES (p_request_id, v_at, 'Assigned', NULL);

    -- 6. RequestAssigned (E3), with the new assignment.
    PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => 'RequestAssigned',
                                       p_transition_id => v_transition_id, p_at => v_at,
                                       p_trace_id => p_trace_id, p_assignment_id => v_assignment_id);

    -- 7. Post-condition: only a bug can trip it.
    PERFORM requests.check_request(p_request_id);

    result_code   := 'ok';
    assignment_id := v_assignment_id;
END;
$$;
