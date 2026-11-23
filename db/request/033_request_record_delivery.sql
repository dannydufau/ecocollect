-- Q15 record delivery (contract 5.2 Q15, 6.5, 12.1; FR17): the assigned volunteer
-- records where the collected items were delivered, with an evidence photo.
-- Collected -> Delivered, E5.
-- Needs 022 (helpers), 023 (req_enqueue_event), 024 (check_request).
-- Created in "requests"; course tables are named without a schema (see 020).

-- req_check_record_delivery: the state checks of a delivery, shared by
-- req_record_delivery and req_get_detail's allowed_actions. Read-only (STABLE),
-- takes no lock: req_record_delivery locks the request row before calling it.
-- Internal, never called by TypeScript. No time parameter: delivering has no
-- timing rule.
--
-- Returns the first rule that fails, in this order:
--   'request_unavailable'  Q8 hides the request from the caller (req_viewer, 022)
--   'forbidden'          p_volunteer_id is not an active volunteer
--   'already_delivered'  they delivered this request already (a retry)
--   'forbidden'          they have no unfinished assignment on this request
--   'not_collected'      their assignment, but the request isn't Collected yet
--   'ok'                 the volunteer may record the delivery
-- A request that doesn't exist raises: callers answer 404 before calling this.
CREATE OR REPLACE FUNCTION requests.req_check_record_delivery(
    p_request_id   UUID,
    p_volunteer_id VARCHAR(50))
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_code_ok                CONSTANT TEXT := 'ok';
    k_code_forbidden         CONSTANT TEXT := 'forbidden';
    k_code_unavailable       CONSTANT TEXT := 'request_unavailable';
    k_code_already_delivered CONSTANT TEXT := 'already_delivered';
    k_code_not_collected     CONSTANT TEXT := 'not_collected';
    k_status_collected       CONSTANT VARCHAR(30) := 'Collected';
    k_end_delivered          CONSTANT VARCHAR(30) := 'Delivered';
    v_status        VARCHAR(30);
    v_is_volunteer  BOOLEAN;   -- an active volunteer account
    v_has_active    BOOLEAN;   -- has an unfinished assignment on this request
    v_has_delivered BOOLEAN;   -- has an assignment on this request that they delivered
    v_is_visible    BOOLEAN;   -- Q8 shows the request to the caller
BEGIN
    IF p_request_id IS NULL OR p_volunteer_id IS NULL THEN
        RAISE EXCEPTION 'req_check_record_delivery: missing argument';
    END IF;

    v_status := requests.req_current_status(p_request_id);
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'req_check_record_delivery: request % not found', p_request_id;
    END IF;

    -- 0. Hidden from the caller in Q8: the same 404 as Q8, never 403
    -- (contract Conventions, NFR03).
    v_is_visible := requests.req_viewer(p_request_id, p_volunteer_id) IS NOT NULL;
    IF NOT v_is_visible THEN
        RETURN k_code_unavailable;
    END IF;

    -- Read from the model tables (not from X-User-Roles), as req_check_accept does.
    v_is_volunteer := EXISTS (
        SELECT 1 FROM volunteer vo
        JOIN account ac ON ac.account_id = vo.account_id
        WHERE vo.account_id = p_volunteer_id
          AND ac.deactivated_at IS NULL);

    -- The caller's assignments on this request, found through the window and the
    -- volunteer's terms acceptance.
    v_has_active := EXISTS (
        SELECT 1 FROM assignment a
        JOIN pickup_window pw    ON pw.pickup_window_id = a.pickup_window_id
        JOIN terms_acceptance ta ON ta.terms_acceptance_id = a.terms_acceptance_id
        WHERE pw.pickup_request_id = p_request_id
          AND ta.account_id = p_volunteer_id
          AND a.ended_at IS NULL);
    v_has_delivered := EXISTS (
        SELECT 1 FROM assignment a
        JOIN pickup_window pw    ON pw.pickup_window_id = a.pickup_window_id
        JOIN terms_acceptance ta ON ta.terms_acceptance_id = a.terms_acceptance_id
        WHERE pw.pickup_request_id = p_request_id
          AND ta.account_id = p_volunteer_id
          AND a.end_reason = k_end_delivered);

    -- 1. Not an active volunteer.
    IF NOT v_is_volunteer THEN
        RETURN k_code_forbidden;
    END IF;

    -- 2. They delivered it already (a retry). Delivered is final, so the request
    -- is Delivered (check_request rule 8).
    IF v_has_delivered THEN
        RETURN k_code_already_delivered;
    END IF;

    -- 3. Not their request: no assignment, or theirs was cancelled or missed.
    -- Before any status check, so nobody else learns the request's state.
    IF NOT v_has_active THEN
        RETURN k_code_forbidden;
    END IF;

    -- 4. Their assignment, but not collected yet (the owner hasn't confirmed).
    IF v_status <> k_status_collected THEN
        RETURN k_code_not_collected;
    END IF;

    RETURN k_code_ok;
END;
$$;

-- req_record_delivery: Q15, in one call and one transaction. Called by
-- TypeScript as
--   SELECT * FROM requests.req_record_delivery($1, $2, $3, $4, $5, $6)
-- p_facility_id is NULL when the body's facilityId isn't a UUID. p_file_path is
-- the path ImageKit reported for p_file_id, or NULL when TypeScript's photo
-- verification failed (contract 6.5); both are field errors, after the state checks.
--
-- result_code:
--   'ok'                   delivered; the assignment ended Delivered
--   'request_unavailable'  no such request (404)
--   'forbidden', 'already_delivered', 'not_collected'   from req_check_record_delivery
--   'validation_failed'    error_fields / error_messages hold every failing field
-- Business failures are returned; a RAISE means a bug and rolls back everything.
CREATE OR REPLACE FUNCTION requests.req_record_delivery(
    p_request_id   UUID,
    p_volunteer_id VARCHAR(50),
    p_facility_id  UUID,
    p_file_id      TEXT,
    p_file_path    TEXT,
    p_trace_id     TEXT,
    OUT result_code    TEXT,
    OUT error_fields   TEXT[],
    OUT error_messages TEXT[])
LANGUAGE plpgsql
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_code_ok              CONSTANT TEXT := 'ok';
    k_code_unavailable     CONSTANT TEXT := 'request_unavailable';
    k_code_invalid         CONSTANT TEXT := 'validation_failed';
    k_status_delivered     CONSTANT VARCHAR(30) := 'Delivered';
    k_end_delivered        CONSTANT VARCHAR(30) := 'Delivered';
    k_event_delivered      CONSTANT TEXT := 'RequestAssignmentDelivered';
    k_field_facility       CONSTANT TEXT := 'facilityId';
    k_field_photo          CONSTANT TEXT := 'evidencePhoto.fileId';
    k_msg_unknown_facility CONSTANT TEXT := 'unknown facility';
    k_msg_not_accepted     CONSTANT TEXT := 'does not accept this category';
    k_msg_photo_failed     CONSTANT TEXT := 'photo check failed';
    k_msg_already_used     CONSTANT TEXT := 'already used';
    v_at            TIMESTAMPTZ;            -- the action's one moment, taken after the lock
    v_check         TEXT;
    v_category_id   TEXT;
    v_assignment_id UUID;
    v_transition_id UUID := gen_random_uuid();
BEGIN
    IF p_request_id IS NULL OR p_volunteer_id IS NULL THEN
        RAISE EXCEPTION 'req_record_delivery: missing argument';
    END IF;
    error_fields   := '{}';
    error_messages := '{}';

    -- 1. Lock the request row, then take the time (as in req_accept).
    SELECT p.category_id INTO v_category_id
    FROM pickup_request p WHERE p.pickup_request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        result_code := k_code_unavailable;
        RETURN;
    END IF;
    v_at := clock_timestamp();

    -- 2. State checks.
    v_check := requests.req_check_record_delivery(p_request_id, p_volunteer_id);
    IF v_check <> k_code_ok THEN
        result_code := v_check;
        RETURN;
    END IF;

    -- 3. Field checks, every failure collected. The facility must exist and accept
    -- the request's category (FR17).
    IF NOT EXISTS (SELECT 1 FROM recycling_facility f WHERE f.facility_id = p_facility_id) THEN
        error_fields   := array_append(error_fields, k_field_facility);
        error_messages := array_append(error_messages, k_msg_unknown_facility);
    ELSIF NOT EXISTS (
            SELECT 1 FROM facility_accepts fa
            WHERE fa.facility_id = p_facility_id
              AND fa.category_id = v_category_id) THEN
        error_fields   := array_append(error_fields, k_field_facility);
        error_messages := array_append(error_messages, k_msg_not_accepted);
    END IF;

    -- The photo: verified by TypeScript, and never used before (item photo or other
    -- evidence; every use is a photo row, and evidence is never shared, 6.7).
    IF p_file_id IS NULL OR p_file_path IS NULL THEN
        error_fields   := array_append(error_fields, k_field_photo);
        error_messages := array_append(error_messages, k_msg_photo_failed);
    ELSIF EXISTS (SELECT 1 FROM photo ph WHERE ph.file_id = p_file_id) THEN
        error_fields   := array_append(error_fields, k_field_photo);
        error_messages := array_append(error_messages, k_msg_already_used);
    END IF;

    IF cardinality(error_fields) > 0 THEN
        result_code := k_code_invalid;
        RETURN;
    END IF;

    -- 4. Writes, at v_at: end the collected assignment (Collected has exactly one
    -- unfinished, collected assignment, check_request rule 7), then the photo and
    -- the delivery. An evidence file belongs to one request (6.2 folder), so a
    -- second call with the same file waited on the row lock and stopped at 'already_delivered'.
    UPDATE assignment a
    SET ended_at = v_at, end_reason = k_end_delivered
    FROM pickup_window pw
    WHERE pw.pickup_window_id = a.pickup_window_id
      AND pw.pickup_request_id = p_request_id
      AND a.ended_at IS NULL
      AND a.collected_at IS NOT NULL
    RETURNING a.assignment_id INTO v_assignment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'req_record_delivery: request % is Collected without a collected assignment', p_request_id;
    END IF;

    INSERT INTO photo (file_id, file_path) VALUES (p_file_id, p_file_path);
    INSERT INTO delivery (delivery_id, assignment_id, facility_id, file_id)
    VALUES (gen_random_uuid(), v_assignment_id, p_facility_id, p_file_id);

    INSERT INTO status_change (pickup_request_id, changed_at, status, reason)
    VALUES (p_request_id, v_at, k_status_delivered, NULL);

    -- 5. RequestAssignmentDelivered (E5): req_enqueue_event reads the facility and
    -- deliveredAt (the assignment's ended_at) through the delivery just written.
    PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => k_event_delivered,
                                       p_transition_id => v_transition_id, p_at => v_at,
                                       p_trace_id => p_trace_id, p_assignment_id => v_assignment_id);

    -- 6. Post-condition: only a bug can trip it.
    PERFORM requests.check_request(p_request_id);

    result_code := k_code_ok;
END;
$$;
