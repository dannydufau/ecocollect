-- Q14 report missed (contract 5.2 Q14, 12.4, 12.5; FR16): after the selected
-- window has ended, the owner reports that the volunteer didn't come. The
-- assignment ends Missed_Pickup and the request becomes Missed (final), E8. With
-- `reschedule`, the same transaction creates a new Open request linked to the
-- missed one, E1.
-- Needs 022 (helpers), 023 (req_enqueue_event), 024 (check_request).
-- Created in "requests"; course tables are named without a schema (see 020).

-- req_check_report_missed: the state checks of a missed-pickup report, shared by
-- req_report_missed and req_get_detail's allowed_actions. Read-only (STABLE),
-- takes no lock: req_report_missed locks the request row before calling it.
-- Internal, never called by TypeScript. The terms and the reschedule windows are
-- body checks: req_report_missed makes them after this one.
--   p_at  the moment to judge "window ended" at
--
-- Returns the first rule that fails, in this order:
--   'forbidden'         p_resident_id is not the request's owner, or the owner's
--                       account is deactivated
--   'not_assigned'      any other status than Assigned
--   'window_not_ended'  p_at < the selected window's end (12.4)
--   'ok'                the owner may report the pickup missed
-- A request that doesn't exist raises: callers answer 404 before calling this.
CREATE OR REPLACE FUNCTION requests.req_check_report_missed(
    p_request_id  UUID,
    p_resident_id VARCHAR(50),
    p_at          TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path TO requests, ecocollect608, pg_temp
AS $$
DECLARE
    k_code_ok               CONSTANT TEXT := 'ok';
    k_code_forbidden        CONSTANT TEXT := 'forbidden';
    k_code_not_assigned     CONSTANT TEXT := 'not_assigned';
    k_code_window_not_ended CONSTANT TEXT := 'window_not_ended';
    k_status_assigned       CONSTANT VARCHAR(30) := 'Assigned';
    v_status     VARCHAR(30);
    v_is_owner   BOOLEAN;        -- the caller owns the request
    v_is_active  BOOLEAN;        -- the caller's account is not deactivated
    v_window_end TIMESTAMPTZ;    -- end of the unfinished assignment's window
BEGIN
    IF p_request_id IS NULL OR p_resident_id IS NULL OR p_at IS NULL THEN
        RAISE EXCEPTION 'req_check_report_missed: missing argument';
    END IF;

    v_status := requests.req_current_status(p_request_id);
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'req_check_report_missed: request % not found', p_request_id;
    END IF;

    v_is_owner  := requests.req_owner_id(p_request_id) = p_resident_id;
    v_is_active := EXISTS (
        SELECT 1 FROM account ac
        WHERE ac.account_id = p_resident_id
          AND ac.deactivated_at IS NULL);

    -- 1. The owner, with an active account. First, so a non-owner never learns
    -- the request's state. A self-assignment (owner = volunteer) is allowed.
    IF NOT v_is_owner THEN
        RETURN k_code_forbidden;
    END IF;
    IF NOT v_is_active THEN
        RETURN k_code_forbidden;
    END IF;

    -- 2. Only an Assigned request: one unfinished assignment, not collected.
    IF v_status <> k_status_assigned THEN
        RETURN k_code_not_assigned;
    END IF;

    -- 3. Find the end of the unfinished assignment's window.
    SELECT requests.req_window_end(pw.pickup_date, pw.start_hour) INTO v_window_end
    FROM assignment a
    JOIN pickup_window pw ON pw.pickup_window_id = a.pickup_window_id
    WHERE pw.pickup_request_id = p_request_id
      AND a.ended_at IS NULL;

    -- 4. Allowed from the moment the selected window ends (12.4: at the exact
    -- end, cancelling is refused and reporting is allowed).
    IF p_at < v_window_end THEN
        RETURN k_code_window_not_ended;
    END IF;

    RETURN k_code_ok;
END;
$$;

-- req_report_missed: Q14, in one call and one transaction. Called by TypeScript as
--   SELECT * FROM requests.req_report_missed($1, $2, $3, $4, $5, $6, $7, $8, $9)
-- p_reason is already checked and normalised by TypeScript (at most 500
-- characters; blank -> NULL); SQL stores it as given, on the Missed row.
-- p_reschedule: the body has `reschedule`. Then p_dates / p_hours are its windows
-- (slot i = element i) and p_terms_document_id its terms id (NULL when not a
-- UUID). Without it, all three are NULL.
--
-- result_code:
--   'ok'                   reported; the request is now Missed.
--                          rescheduled_request_id is the new Open request, or NULL
--   'request_unavailable'  no such request (404)
--   'forbidden', 'not_assigned', 'window_not_ended'
--                          from req_check_report_missed
--   'terms_outdated'       rescheduling, and p_terms_document_id is not the
--                          current terms document
--   'validation_failed'    error_fields / error_messages: req_validate_windows'
--                          failures under 'reschedule.windows'. Nothing written.
-- Business failures are returned; a RAISE means a bug and rolls back everything.
CREATE OR REPLACE FUNCTION requests.req_report_missed(
    p_request_id        UUID,
    p_resident_id       VARCHAR(50),
    p_reason            TEXT,               -- NULL when none
    p_reschedule        BOOLEAN,            -- the body has `reschedule`
    p_terms_document_id UUID,               -- NULL when not rescheduling, or not a UUID
    p_dates             DATE[],             -- NULL when not rescheduling
    p_hours             SMALLINT[],
    p_demo              BOOLEAN,            -- DEMO_MODE (contract 2.4, 17.5): E1's matched volunteers
    p_trace_id          TEXT,
    OUT result_code            TEXT,
    OUT error_fields           TEXT[],
    OUT error_messages         TEXT[],
    OUT rescheduled_request_id UUID)
LANGUAGE plpgsql
SET search_path TO requests, ecocollect608, pg_temp
AS $$
DECLARE
    k_code_ok             CONSTANT TEXT := 'ok';
    k_code_unavailable    CONSTANT TEXT := 'request_unavailable';
    k_code_terms_outdated CONSTANT TEXT := 'terms_outdated';
    k_code_validation     CONSTANT TEXT := 'validation_failed';
    k_field_windows       CONSTANT TEXT := 'reschedule.windows';
    k_status_missed       CONSTANT VARCHAR(30) := 'Missed';
    k_status_open         CONSTANT VARCHAR(30) := 'Open';
    k_end_missed          CONSTANT VARCHAR(30) := 'Missed_Pickup';
    k_terms_resident      CONSTANT VARCHAR(40) := 'AT_RESIDENT_REQUEST_CREATION';
    k_event_missed        CONSTANT TEXT := 'RequestAssignmentMissed';
    k_event_created       CONSTANT TEXT := 'RequestCreated';
    v_at            TIMESTAMPTZ;            -- the action's one moment, taken after the lock
    v_check         TEXT;
    v_current_terms UUID;                   -- the latest terms document published by v_at
    v_win           RECORD;                 -- req_validate_windows' two OUT arrays
    v_assignment_id UUID;                   -- the assignment this call ends
    v_new_id        UUID;                   -- the rescheduled request, when there is one
    v_ta_id         UUID;                   -- its terms acceptance
    v_transition_id UUID := gen_random_uuid();
BEGIN
    -- 0. Arguments (TypeScript's job; a mismatch here is a bug).
    IF p_request_id IS NULL OR p_resident_id IS NULL OR p_reschedule IS NULL OR p_demo IS NULL THEN
        RAISE EXCEPTION 'req_report_missed: missing argument';
    END IF;
    IF p_reschedule AND p_dates IS NULL THEN
        RAISE EXCEPTION 'req_report_missed: reschedule without windows';
    END IF;
    IF NOT p_reschedule AND (p_dates IS NOT NULL OR p_terms_document_id IS NOT NULL) THEN
        RAISE EXCEPTION 'req_report_missed: windows or terms without reschedule';
    END IF;
    error_fields   := '{}';
    error_messages := '{}';

    -- 1. Lock the request row, then take the time (as in req_accept).
    PERFORM 1 FROM pickup_request p WHERE p.pickup_request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        result_code := k_code_unavailable;
        RETURN;
    END IF;
    v_at := clock_timestamp();

    -- 2. State checks: the owner, Assigned, the selected window has ended.
    v_check := requests.req_check_report_missed(p_request_id, p_resident_id, v_at);
    IF v_check <> k_code_ok THEN
        result_code := v_check;
        RETURN;
    END IF;

    -- 3. Rescheduling: the terms must be the current document at v_at, the new
    -- request's createdAt (FR22).
    IF p_reschedule THEN
        SELECT d.terms_document_id INTO v_current_terms
        FROM terms_document d
        WHERE d.published_at <= v_at
        ORDER BY d.published_at DESC
        LIMIT 1;
        IF p_terms_document_id IS DISTINCT FROM v_current_terms THEN
            result_code := k_code_terms_outdated;
            RETURN;
        END IF;
    END IF;

    -- 4. Rescheduling: windows in the future and within 30 days of the new
    -- request's createdAt (v_at), not the missed one's (12.5.2).
    IF p_reschedule THEN
        v_win := requests.req_validate_windows(k_field_windows, p_dates, p_hours, v_at, v_at);
        error_fields   := v_win.error_fields;
        error_messages := v_win.error_messages;
    END IF;
    IF cardinality(error_fields) > 0 THEN
        result_code := k_code_validation;
        RETURN;
    END IF;

    -- 5. End the unfinished assignment at v_at as Missed_Pickup (12.5.1).
    UPDATE assignment a
    SET ended_at   = v_at,
        end_reason = k_end_missed
    FROM pickup_window pw
    WHERE pw.pickup_window_id = a.pickup_window_id
      AND pw.pickup_request_id = p_request_id
      AND a.ended_at IS NULL
    RETURNING a.assignment_id INTO v_assignment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'req_report_missed: request % has no unfinished assignment', p_request_id;
    END IF;

    -- 6. Move the request to Missed, with the caller's reason.
    INSERT INTO status_change (pickup_request_id, changed_at, status, reason)
    VALUES (p_request_id, v_at, k_status_missed, p_reason);

    -- 7. Rescheduling (12.5.2): a new request, created at v_at, with its own terms
    -- acceptance (FR22). Before E8: E8's rescheduledAsRequestId is read from it.
    IF p_reschedule THEN
        v_new_id := gen_random_uuid();
        v_ta_id  := gen_random_uuid();

        -- Record the resident's acceptance of the current terms at v_at.
        INSERT INTO terms_acceptance (terms_acceptance_id, terms_document_id, account_id, accepted_at, type)
        VALUES (v_ta_id, p_terms_document_id, p_resident_id, v_at, k_terms_resident);

        -- Copy category, quantity, notes and photo from the missed request; weight
        -- from the current standard weight; address from the profile. request_seq
        -- starts at 1: RequestCreated uses it as it is (023).
        INSERT INTO pickup_request (pickup_request_id, category_id, terms_acceptance_id, quantity,
                                    estimated_weight_kg, created_at, request_seq, pickup_street,
                                    pickup_postal_code, notes, file_id, rescheduled_from_request_id)
        SELECT v_new_id, old.category_id, v_ta_id, old.quantity,
               old.quantity * c.standard_weight_kg, v_at, 1, r.street,
               r.postal_code, old.notes, old.file_id, old.pickup_request_id
        FROM pickup_request old
        JOIN item_category c ON c.category_id = old.category_id
        JOIN resident r      ON r.account_id = p_resident_id
        WHERE old.pickup_request_id = p_request_id;

        -- Insert the new windows, all active.
        INSERT INTO pickup_window (pickup_window_id, pickup_request_id, pickup_date, start_hour, is_active)
        SELECT gen_random_uuid(), v_new_id, w.d, w.h, TRUE
        FROM unnest(p_dates, p_hours) AS w(d, h);

        -- Open the new request at v_at.
        INSERT INTO status_change (pickup_request_id, changed_at, status, reason)
        VALUES (v_new_id, v_at, k_status_open, NULL);
    END IF;

    -- 8. Events, one transitionId: E8 for the missed request, then E1 for the new one.
    PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => k_event_missed,
                                       p_transition_id => v_transition_id, p_at => v_at,
                                       p_trace_id => p_trace_id, p_assignment_id => v_assignment_id);
    IF p_reschedule THEN
        PERFORM requests.req_enqueue_event(p_request_id => v_new_id, p_event_type => k_event_created,
                                           p_transition_id => v_transition_id, p_at => v_at,
                                           p_trace_id => p_trace_id, p_demo => p_demo);
    END IF;

    -- 9. Post-conditions: only a bug can trip them.
    PERFORM requests.check_request(p_request_id);
    IF p_reschedule THEN
        PERFORM requests.check_request(v_new_id);
    END IF;

    result_code := k_code_ok;
    rescheduled_request_id := v_new_id;
END;
$$;
