-- check_request: the request-level rules of the model,
-- checked for one request at the end of every write function. Only a bug can
-- trip it: the write functions check everything before writing, so this is a
-- last line of defence. It raises check_violation, which rolls back the whole action.
--
-- Rules that depend on the current time (a window in the future, terms current
-- now) are checked by the write functions at the moment of the action: they
-- stop holding as time passes. Rules only for a new request (estimated weight,
-- address from the profile, reschedule copies) belong to the create functions.
-- Created in "requests"; course tables are named without a schema (see 020).
CREATE OR REPLACE FUNCTION requests.check_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_terms_resident     CONSTANT VARCHAR(40) := 'AT_RESIDENT_REQUEST_CREATION';
    k_terms_volunteer    CONSTANT VARCHAR(40) := 'AT_VOLUNTEER_ACCEPTANCE';
    k_status_open        CONSTANT VARCHAR(30) := 'Open';
    k_status_assigned    CONSTANT VARCHAR(30) := 'Assigned';
    k_status_collected   CONSTANT VARCHAR(30) := 'Collected';
    k_status_delivered   CONSTANT VARCHAR(30) := 'Delivered';
    k_status_missed      CONSTANT VARCHAR(30) := 'Missed';
    k_end_delivered      CONSTANT VARCHAR(30) := 'Delivered';      -- assignment end_reason
    k_max_period         CONSTANT INTERVAL    := INTERVAL '30 days'; -- FR07
    v_request pickup_request;   -- the whole row
    v_status  VARCHAR(30);
    v_owner   VARCHAR(50);
BEGIN
    SELECT * INTO v_request FROM pickup_request WHERE pickup_request_id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = format('check_request %s: request not found', p_request_id);
    END IF;
    v_status := requests.req_current_status(p_request_id);
    v_owner  := requests.req_owner_id(p_request_id);

    -- 1. The creation acceptance is the resident's AT_RESIDENT_REQUEST_CREATION, at created_at.
    IF NOT EXISTS (
        SELECT 1 FROM terms_acceptance t
        JOIN resident r ON r.account_id = t.account_id
        WHERE t.terms_acceptance_id = v_request.terms_acceptance_id
          AND t.type = k_terms_resident
          AND t.accepted_at = v_request.created_at
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = format('check_request %s: creation acceptance', p_request_id);
    END IF;

    -- 2. The history starts with Open at created_at, nothing earlier.
    IF NOT EXISTS (SELECT 1 FROM status_change s
                   WHERE s.pickup_request_id = p_request_id AND s.changed_at = v_request.created_at AND s.status = k_status_open)
       OR EXISTS (SELECT 1 FROM status_change s
                  WHERE s.pickup_request_id = p_request_id AND s.changed_at < v_request.created_at) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = format('check_request %s: history must start Open at creation', p_request_id);
    END IF;

    -- 3. 1-3 active windows, distinct (date, start hour).
    IF (SELECT count(*) FROM pickup_window w
        WHERE w.pickup_request_id = p_request_id AND w.is_active) NOT BETWEEN 1 AND 3
       OR (SELECT count(*) <> count(DISTINCT (w.pickup_date, w.start_hour)) FROM pickup_window w
           WHERE w.pickup_request_id = p_request_id AND w.is_active) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = format('check_request %s: 1-3 distinct active windows', p_request_id);
    END IF;

    -- 4. Every window starts after created_at and ends by created_at + 30 days (FR07, 12.2).
    IF EXISTS (
        SELECT 1 FROM pickup_window w
        WHERE w.pickup_request_id = p_request_id
          AND (requests.req_window_start(w.pickup_date, w.start_hour) <= v_request.created_at
               OR requests.req_window_end(w.pickup_date, w.start_hour) > v_request.created_at + k_max_period)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = format('check_request %s: window outside the 30-day period', p_request_id);
    END IF;

    -- 5. Each assignment: a volunteer's AT_VOLUNTEER_ACCEPTANCE at accepted_at, not
    -- before the request, with an Assigned status change at that same moment.
    IF EXISTS (
        SELECT 1 FROM assignment a
        JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
        JOIN terms_acceptance t ON t.terms_acceptance_id = a.terms_acceptance_id
        LEFT JOIN volunteer v ON v.account_id = t.account_id
        WHERE w.pickup_request_id = p_request_id
          AND (v.account_id IS NULL
               OR t.type <> k_terms_volunteer
               OR t.accepted_at <> a.accepted_at
               OR a.accepted_at < v_request.created_at
               OR NOT EXISTS (SELECT 1 FROM status_change s
                              WHERE s.pickup_request_id = p_request_id
                                AND s.changed_at = a.accepted_at AND s.status = k_status_assigned))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = format('check_request %s: assignment acceptance', p_request_id);
    END IF;

    -- 6. Every acceptance on this request (creation and assignments) was of the
    -- terms current at the time: no later terms published before accepted_at.
    IF EXISTS (
        SELECT 1 FROM terms_acceptance t
        JOIN terms_document d ON d.terms_document_id = t.terms_document_id
        WHERE t.terms_acceptance_id IN (
                SELECT v_request.terms_acceptance_id
                UNION
                SELECT a.terms_acceptance_id FROM assignment a
                JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
                WHERE w.pickup_request_id = p_request_id)
          AND (d.published_at > t.accepted_at
               OR EXISTS (SELECT 1 FROM terms_document later
                          WHERE later.published_at > d.published_at AND later.published_at <= t.accepted_at))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = format('check_request %s: terms not current when accepted', p_request_id);
    END IF;

    -- 7. Status matches the assignments: at most one unfinished; Assigned = one
    -- unfinished, not collected; Collected = one unfinished, collected; any other
    -- status = none unfinished.
    IF (SELECT count(*) FROM assignment a
        JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
        WHERE w.pickup_request_id = p_request_id AND a.ended_at IS NULL)
       -- in parentheses: inside IF, PL/pgSQL would take the CASE's THEN as the IF's own
       <> (CASE WHEN v_status IN (k_status_assigned, k_status_collected) THEN 1 ELSE 0 END)
       OR (v_status IN (k_status_assigned, k_status_collected) AND NOT EXISTS (
            SELECT 1 FROM assignment a
            JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
            WHERE w.pickup_request_id = p_request_id AND a.ended_at IS NULL
              AND (a.collected_at IS NOT NULL) = (v_status = k_status_collected))) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = format('check_request %s: status %s does not match its assignments', p_request_id, v_status);
    END IF;

    -- 8. Delivered <=> a delivery. Each delivery: the assignment ended Delivered after
    -- collection, at a facility that accepts the request's category.
    IF (v_status = k_status_delivered) <> EXISTS (
            SELECT 1 FROM delivery d
            JOIN assignment a ON a.assignment_id = d.assignment_id
            JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
            WHERE w.pickup_request_id = p_request_id)
       OR EXISTS (
            SELECT 1 FROM delivery d
            JOIN assignment a ON a.assignment_id = d.assignment_id
            JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
            WHERE w.pickup_request_id = p_request_id
              AND (a.end_reason IS DISTINCT FROM k_end_delivered OR a.collected_at IS NULL
                   OR NOT EXISTS (SELECT 1 FROM facility_accepts f
                                  WHERE f.facility_id = d.facility_id AND f.category_id = v_request.category_id))) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = format('check_request %s: delivery', p_request_id);
    END IF;

    -- 9. The item photo is never delivery evidence (any delivery).
    IF v_request.file_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM delivery d WHERE d.file_id = v_request.file_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = format('check_request %s: item photo used as delivery evidence', p_request_id);
    END IF;

    -- 10. No deactivated account keeps active work: the owner while the request is
    -- Open/Assigned/Collected, the volunteer while the assignment is unfinished.
    IF (v_status IN (k_status_open, k_status_assigned, k_status_collected) AND EXISTS (
            SELECT 1 FROM account acc
            WHERE acc.account_id = v_owner AND acc.deactivated_at IS NOT NULL))
       OR EXISTS (
            SELECT 1 FROM assignment a
            JOIN terms_acceptance t ON t.terms_acceptance_id = a.terms_acceptance_id
            JOIN account acc ON acc.account_id = t.account_id
            JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
            WHERE w.pickup_request_id = p_request_id AND a.ended_at IS NULL
              AND acc.deactivated_at IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = format('check_request %s: deactivated account with active work', p_request_id);
    END IF;

    -- 11. A reschedule points to the same resident's earlier, Missed request, with
    -- its own creation acceptance (12.5).
    IF v_request.rescheduled_from_request_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pickup_request old
        WHERE old.pickup_request_id = v_request.rescheduled_from_request_id
          AND requests.req_owner_id(old.pickup_request_id) = v_owner
          AND old.created_at < v_request.created_at
          AND old.terms_acceptance_id <> v_request.terms_acceptance_id
          AND requests.req_current_status(old.pickup_request_id) = k_status_missed
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = format('check_request %s: reschedule must follow the same resident''s Missed request', p_request_id);
    END IF;
END;
$$;
