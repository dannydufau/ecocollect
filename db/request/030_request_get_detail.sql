-- req_get_detail: Q8, one request as the viewer may see it (RequestDetail in
-- openapi.yaml, contract 5.2 visibility table). Called by TypeScript as
--   SELECT * FROM requests.req_get_detail($1, $2)
-- Needs 022 (helpers) and the req_check_<action> functions (031 onwards; PL/pgSQL
-- looks them up when called, so loading them after this file is fine).
-- Created in "requests"; course tables are named without a
-- schema (see 020). The OUT parameters share names with columns (status, notes,
-- quantity, ...), so every column in the queries is qualified.
--
-- Always one row. result_code:
--   'ok'                   the fields the viewer may see; the hidden ones are NULL
--   'request_unavailable'  no such request, or the viewer may not see it. Both
--                          look the same to the caller (never 403, NFR03)
--
-- viewer (the column of the visibility table the row follows):
--   'owner'               the request's resident; wins when also the volunteer
--   'assigned_volunteer'  the volunteer of an assignment that is unfinished or
--                         ended by their delivery
--   'volunteer'           any active volunteer, while the request is Open
-- Anyone else gets 'request_unavailable': a resident-only account on another
-- resident's request, and, once the request leaves Open, every volunteer except
-- the assigned or delivering one (so a cancelled or missed volunteer too).
--
-- photo_path (item photo) and evidence_path (delivery photo) are ImageKit paths,
-- set only when the viewer may see them; TypeScript signs them. The assignment_*
-- columns are all NULL when no assignment is shown, the delivery ones when that
-- assignment has no delivery. allowed_actions lists each action whose
-- req_check_<action> answers 'ok' for the viewer at now(), in the order of the
-- contract's enum; an overdue Open request gets none (12.6).
CREATE OR REPLACE FUNCTION requests.req_get_detail(
    p_request_id UUID,
    p_viewer_id  VARCHAR(50),
    OUT result_code          TEXT,
    OUT viewer               TEXT,
    OUT request_id           UUID,
    OUT status               TEXT,
    OUT category_id          TEXT,
    OUT category_name        TEXT,
    OUT waste_type           TEXT,
    OUT quantity             INT,
    OUT estimated_weight_kg  NUMERIC,
    OUT postal_code          TEXT,
    OUT window_ids           UUID[],
    OUT window_dates         DATE[],
    OUT window_hours         SMALLINT[],
    OUT created_at           TIMESTAMPTZ,
    OUT expires_at           TIMESTAMPTZ,
    OUT notes                TEXT,
    OUT street               TEXT,       -- address = street + postal_code
    OUT photo_path           TEXT,
    OUT resident_id          TEXT,
    OUT resident_public_name TEXT,
    OUT assignment_id                 UUID,
    OUT assignment_volunteer_id       TEXT,
    OUT assignment_volunteer_name     TEXT,
    OUT assignment_window_id          UUID,
    OUT assignment_window_date        DATE,
    OUT assignment_window_hour        SMALLINT,
    OUT assignment_status             TEXT,
    OUT assignment_accepted_at        TIMESTAMPTZ,
    OUT assignment_collected_at       TIMESTAMPTZ,
    OUT assignment_ended_at           TIMESTAMPTZ,
    OUT assignment_end_reason         TEXT,
    OUT assignment_outside_window     BOOLEAN,
    OUT delivery_facility_id          UUID,
    OUT delivery_facility_name        TEXT,
    OUT delivered_at                  TIMESTAMPTZ,
    OUT evidence_path                 TEXT,
    OUT rescheduled_from_id           UUID,
    OUT rescheduled_as_id             UUID,
    OUT history_at          TIMESTAMPTZ[],
    OUT history_status       TEXT[],
    OUT history_reason       TEXT[],
    OUT allowed_actions      TEXT[],
    OUT refresh_at           TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_code_ok                CONSTANT TEXT := 'ok';
    k_code_unavailable       CONSTANT TEXT := 'request_unavailable';
    k_viewer_owner           CONSTANT TEXT := 'owner';
    k_viewer_assigned        CONSTANT TEXT := 'assigned_volunteer';
    k_viewer_volunteer       CONSTANT TEXT := 'volunteer';
    k_action_edit            CONSTANT TEXT := 'edit';
    k_action_cancel          CONSTANT TEXT := 'cancel';
    k_action_cancel_assignment CONSTANT TEXT := 'cancel_assignment';
    k_as_resident            CONSTANT TEXT := 'resident';    -- req_check_cancel_assignment's p_as
    k_as_volunteer           CONSTANT TEXT := 'volunteer';
    k_action_confirm_collected CONSTANT TEXT := 'confirm_collected';
    k_action_report_missed   CONSTANT TEXT := 'report_missed';
    k_action_accept          CONSTANT TEXT := 'accept';
    k_action_record_delivery CONSTANT TEXT := 'record_delivery';
    k_status_open            CONSTANT VARCHAR(30) := 'Open';
    k_status_assigned        CONSTANT VARCHAR(30) := 'Assigned';
    k_end_delivered          CONSTANT VARCHAR(30) := 'Delivered';   -- assignment end_reason
    k_assignment_active      CONSTANT TEXT := 'Active';      -- assignment status (no column)
    k_assignment_collected   CONSTANT TEXT := 'Collected';
    k_cancellation_window    CONSTANT INTERVAL := INTERVAL '24 hours';   -- before the window starts
    v_now          TIMESTAMPTZ := now();
    v_owner_id     VARCHAR(50);
    v_linked       BOOLEAN;     -- the viewer has an assignment that still links them
    v_linked_id    UUID;        -- that assignment
    v_collected_at TIMESTAMPTZ;
    v_ended_at     TIMESTAMPTZ;
    v_start        TIMESTAMPTZ; -- the shown assignment's window start
    v_end          TIMESTAMPTZ; -- and end
    v_full        BOOLEAN;     -- notes and address visible
BEGIN
    IF p_request_id IS NULL OR p_viewer_id IS NULL THEN
        RAISE EXCEPTION 'req_get_detail: missing argument';
    END IF;

    status := requests.req_current_status(p_request_id);
    IF status IS NULL THEN
        result_code := k_code_unavailable;
        RETURN;
    END IF;
    v_owner_id := requests.req_owner_id(p_request_id);

    -- 1. How the viewer relates to the request. The linking assignment is the
    -- unfinished one (at most one per request, 12.7) or the delivered one
    -- (Delivered is final), so at most one row matches.
    SELECT a.assignment_id, a.collected_at, a.ended_at
    INTO v_linked_id, v_collected_at, v_ended_at
    FROM assignment a
    JOIN pickup_window pw     ON pw.pickup_window_id = a.pickup_window_id
    JOIN terms_acceptance ta  ON ta.terms_acceptance_id = a.terms_acceptance_id
    WHERE pw.pickup_request_id = p_request_id
      AND ta.account_id = p_viewer_id
      AND (a.ended_at IS NULL OR a.end_reason = k_end_delivered);
    v_linked := FOUND;

    IF p_viewer_id = v_owner_id THEN
        viewer := k_viewer_owner;
    ELSIF v_linked THEN
        viewer := k_viewer_assigned;
    ELSIF status = k_status_open AND EXISTS (
            SELECT 1 FROM volunteer vo
            JOIN account ac ON ac.account_id = vo.account_id
            WHERE vo.account_id = p_viewer_id
              AND ac.deactivated_at IS NULL) THEN
        viewer := k_viewer_volunteer;
    ELSE
        result_code := k_code_unavailable;
        RETURN;
    END IF;
    result_code     := k_code_ok;

    -- The actions the viewer may take now: the same checks the write functions
    -- run. The owner gets 'accept' too when also an active volunteer (FR13).
    allowed_actions := '{}';
    IF requests.req_check_edit(p_request_id, p_viewer_id, v_now) = k_code_ok THEN
        allowed_actions := array_append(allowed_actions, k_action_edit);
    END IF;
    IF requests.req_check_cancel(p_request_id, p_viewer_id, v_now) = k_code_ok THEN
        allowed_actions := array_append(allowed_actions, k_action_cancel);
    END IF;
    -- Asked once per side, with `as` given, so a viewer on both sides (a
    -- self-assignment) gets the action when either side may cancel.
    IF requests.req_check_cancel_assignment(p_request_id, p_viewer_id, k_as_resident, v_now) = k_code_ok THEN
        allowed_actions := array_append(allowed_actions, k_action_cancel_assignment);
    ELSIF requests.req_check_cancel_assignment(p_request_id, p_viewer_id, k_as_volunteer, v_now) = k_code_ok THEN
        allowed_actions := array_append(allowed_actions, k_action_cancel_assignment);
    END IF;
    IF requests.req_check_confirm_collected(p_request_id, p_viewer_id) = k_code_ok THEN
        allowed_actions := array_append(allowed_actions, k_action_confirm_collected);
    END IF;
    IF requests.req_check_report_missed(p_request_id, p_viewer_id, v_now) = k_code_ok THEN
        allowed_actions := array_append(allowed_actions, k_action_report_missed);
    END IF;
    IF requests.req_check_accept(p_request_id, p_viewer_id, v_now) = k_code_ok THEN
        allowed_actions := array_append(allowed_actions, k_action_accept);
    END IF;
    IF requests.req_check_record_delivery(p_request_id, p_viewer_id) = k_code_ok THEN
        allowed_actions := array_append(allowed_actions, k_action_record_delivery);
    END IF;

    -- 2. Core fields (every viewer) and the photo path. Notes and address: the
    -- owner, and the volunteer while their assignment is Active (not collected,
    -- not ended).
    v_full := viewer = k_viewer_owner
              OR (viewer = k_viewer_assigned AND v_collected_at IS NULL AND v_ended_at IS NULL);
    SELECT p.pickup_request_id, c.category_id, c.name, c.waste_type, p.quantity,
           p.estimated_weight_kg, p.pickup_postal_code, p.created_at, ph.file_path,
           CASE WHEN v_full THEN p.notes END,
           CASE WHEN v_full THEN p.pickup_street END
    INTO request_id, category_id, category_name, waste_type, quantity,
         estimated_weight_kg, postal_code, created_at, photo_path, notes, street
    FROM pickup_request p
    JOIN item_category c ON c.category_id = p.category_id
    LEFT JOIN photo ph   ON ph.file_id = p.file_id
    WHERE p.pickup_request_id = p_request_id;
    expires_at := requests.req_expires_at(p_request_id);

    -- Active windows, earliest first, as three aligned arrays (see 029). A
    -- volunteer viewing an Open request sees only the windows not yet started.
    SELECT coalesce(array_agg(pw.pickup_window_id ORDER BY pw.pickup_date, pw.start_hour, pw.pickup_window_id), '{}'),
           coalesce(array_agg(pw.pickup_date      ORDER BY pw.pickup_date, pw.start_hour, pw.pickup_window_id), '{}'),
           coalesce(array_agg(pw.start_hour       ORDER BY pw.pickup_date, pw.start_hour, pw.pickup_window_id), '{}')
    INTO window_ids, window_dates, window_hours
    FROM pickup_window pw
    WHERE pw.pickup_request_id = p_request_id
      AND pw.is_active
      AND (viewer <> k_viewer_volunteer OR requests.req_window_start(pw.pickup_date, pw.start_hour) > v_now);

    -- 3. The resident's public name: the owner and the linked volunteer.
    IF viewer <> k_viewer_volunteer THEN
        resident_id := v_owner_id;
        SELECT ac.public_name INTO resident_public_name
        FROM account ac WHERE ac.account_id = v_owner_id;
    END IF;

    -- 4. The assignment: the owner sees the current or last one (latest accepted;
    -- an earlier one always ended before the next was accepted), the linked
    -- volunteer their own. Its window may be inactive by now (replaced after a
    -- cancellation), so it comes from the join, not from the windows above.
    -- outside_window: less than 24 h before the selected window starts, measured
    -- at the end of an ended assignment (for a cancellation, the value E6 carried,
    -- 12.4) and at now() otherwise. A delivered assignment brings its delivery.
    IF viewer <> k_viewer_volunteer THEN
        SELECT a.assignment_id, ta.account_id, ac.public_name,
               pw.pickup_window_id, pw.pickup_date, pw.start_hour,
               CASE WHEN a.end_reason IS NOT NULL   THEN a.end_reason
                    WHEN a.collected_at IS NOT NULL THEN k_assignment_collected
                    ELSE k_assignment_active END,
               a.accepted_at, a.collected_at, a.ended_at, a.end_reason,
               requests.req_window_start(pw.pickup_date, pw.start_hour),
               f.facility_id, f.name,
               CASE WHEN d.delivery_id IS NOT NULL THEN a.ended_at END,
               ph.file_path
        INTO assignment_id, assignment_volunteer_id, assignment_volunteer_name,
             assignment_window_id, assignment_window_date, assignment_window_hour,
             assignment_status,
             assignment_accepted_at, assignment_collected_at, assignment_ended_at, assignment_end_reason,
             v_start,
             delivery_facility_id, delivery_facility_name, delivered_at, evidence_path
        FROM assignment a
        JOIN pickup_window pw           ON pw.pickup_window_id = a.pickup_window_id
        JOIN terms_acceptance ta        ON ta.terms_acceptance_id = a.terms_acceptance_id
        JOIN account ac                 ON ac.account_id = ta.account_id
        LEFT JOIN delivery d            ON d.assignment_id = a.assignment_id
        LEFT JOIN recycling_facility f  ON f.facility_id = d.facility_id
        LEFT JOIN photo ph              ON ph.file_id = d.file_id
        WHERE pw.pickup_request_id = p_request_id
          AND (viewer = k_viewer_owner OR a.assignment_id = v_linked_id)
        ORDER BY a.accepted_at DESC, a.assignment_id DESC
        LIMIT 1;
        IF FOUND THEN
            v_end := requests.req_window_end(assignment_window_date, assignment_window_hour);
            assignment_outside_window :=
                coalesce(assignment_ended_at, v_now) > v_start - k_cancellation_window;
        END IF;
    END IF;

    -- 5. Status history (oldest first) and the reschedule links: the owner only.
    IF viewer = k_viewer_owner THEN
        SELECT array_agg(s.changed_at    ORDER BY s.changed_at),
               array_agg(s.status::TEXT  ORDER BY s.changed_at),
               array_agg(s.reason        ORDER BY s.changed_at)
        INTO history_at, history_status, history_reason
        FROM status_change s
        WHERE s.pickup_request_id = p_request_id;

        SELECT p.rescheduled_from_request_id INTO rescheduled_from_id
        FROM pickup_request p WHERE p.pickup_request_id = p_request_id;
        SELECT p.pickup_request_id INTO rescheduled_as_id
        FROM pickup_request p WHERE p.rescheduled_from_request_id = p_request_id;
    END IF;

    -- 6. refresh_at: the next moment the same data gives a different response.
    -- Open: the start of the next active window (a volunteer stops seeing it; the
    -- last one is expiresAt). NULL once none is left (overdue).
    -- Assigned (viewer is the owner or the volunteer, step 1; the assignment shown
    -- is the unfinished one): the earlier future one of start - 24 h
    -- (outsideCancellationWindow turns true) and the window end (the owner's
    -- cancel actions give way to report_missed). Other statuses: NULL.
    IF status = k_status_open THEN
        SELECT min(s.start_at) INTO refresh_at
        FROM pickup_window pw
        CROSS JOIN LATERAL (
            SELECT requests.req_window_start(pw.pickup_date, pw.start_hour) AS start_at
        ) s
        WHERE pw.pickup_request_id = p_request_id
          AND pw.is_active
          AND s.start_at > v_now;
    ELSIF status = k_status_assigned THEN
        refresh_at := CASE
            WHEN v_start - k_cancellation_window > v_now THEN v_start - k_cancellation_window
            WHEN v_end > v_now THEN v_end
        END;
    END IF;
END;
$$;
