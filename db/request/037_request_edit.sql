-- Q9 edit (contract 5.2 Q9, 6.7, 12.2, 12.6; FR10): the owner edits an Open request.
-- Open -> Open, E2 'edited' with the fields that changed. An overdue request is
-- expired instead (E10 'overdue_on_action').
-- Needs 022 (helpers), 023 (req_enqueue_event), 024 (check_request).
-- Created in "requests"; course tables are named without a schema (see 020).

-- req_check_edit: the state checks of an edit, shared by req_edit and
-- req_get_detail's allowed_actions. Read-only (STABLE), takes no lock: req_edit
-- locks the request row before calling it. Internal, never called by TypeScript.
--   p_at  the moment to judge "overdue" at
--
-- Returns the first rule that fails, in this order:
--   'request_unavailable'  Q8 hides the request from the caller (req_viewer, 022)
--   'forbidden'  p_resident_id is not the request's owner, or the owner's
--                account is deactivated
--   'not_open'   any status other than Open
--   'overdue'    Open, but p_at >= expiresAt (12.6): req_edit expires the
--                request; for allowed_actions it is just "not ok"
--   'ok'         the owner may edit
-- A request that doesn't exist raises: callers answer 404 before calling this.
CREATE OR REPLACE FUNCTION requests.req_check_edit(
    p_request_id  UUID,
    p_resident_id VARCHAR(50),
    p_at          TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_code_ok          CONSTANT TEXT := 'ok';
    k_code_forbidden   CONSTANT TEXT := 'forbidden';
    k_code_unavailable CONSTANT TEXT := 'request_unavailable';
    k_code_not_open    CONSTANT TEXT := 'not_open';
    k_code_overdue     CONSTANT TEXT := 'overdue';
    k_status_open      CONSTANT VARCHAR(30) := 'Open';
    v_status     VARCHAR(30);
    v_is_owner   BOOLEAN;       -- p_resident_id owns the request
    v_is_active  BOOLEAN;       -- and their account is not deactivated
    v_is_open    BOOLEAN;       -- the request's current status is Open
    v_overdue    BOOLEAN;       -- the latest active window has started
    v_is_visible BOOLEAN;       -- Q8 shows the request to the caller
BEGIN
    IF p_request_id IS NULL OR p_resident_id IS NULL OR p_at IS NULL THEN
        RAISE EXCEPTION 'req_check_edit: missing argument';
    END IF;

    v_status := requests.req_current_status(p_request_id);
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'req_check_edit: request % not found', p_request_id;
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
    v_is_open   := v_status = k_status_open;

    -- 1. The owner, with an active account. First, so a non-owner never learns
    -- the request's state.
    IF NOT v_is_owner THEN
        RETURN k_code_forbidden;
    END IF;
    IF NOT v_is_active THEN
        RETURN k_code_forbidden;
    END IF;

    -- 2. Only an Open request can be edited.
    IF NOT v_is_open THEN
        RETURN k_code_not_open;
    END IF;

    -- 3. Open, but overdue: no window is left in the future.
    v_overdue := requests.req_expires_at(p_request_id) <= p_at;
    IF v_overdue THEN
        RETURN k_code_overdue;
    END IF;

    RETURN k_code_ok;
END;
$$;

-- req_edit: the Q9 write, one call = one transaction. TypeScript has checked the
-- body's shape (Valibot) and run the new photo through ImageKit (6.5) first.
--   p_sent       the body's keys that were present: 'categoryId', 'quantity',
--                'notes', 'windows', 'photo'. A field not in p_sent is left as
--                it is; notes or photo in p_sent with a NULL value removes it
--   p_file_path  the path ImageKit reported for p_file_id, or NULL when
--                TypeScript's photo check failed (answered as a field error here)
--
-- result_code:
--   'ok'                   edited, or nothing differed (then nothing is written)
--   'request_unavailable'  no such request (404)
--   'forbidden', 'not_open'   from req_check_edit
--   'expired'              the request was overdue: it is now Expired, with its
--                          RequestExpired event, and that is committed (12.6)
--   'validation_failed'    error_fields / error_messages say which fields (400)
-- unreferenced_file_id: the old photo's file id when this edit removed or
-- replaced it and no request uses it any more; TypeScript deletes the file from
-- ImageKit after commit (6.7). NULL otherwise.
-- Business failures are returned; a RAISE means a bug and rolls back everything.
--
-- Account lock (12.7): before the request row lock, it takes the advisory lock
-- pg_advisory_xact_lock(hashtext('account:' || account_id)) on the caller, the
-- same lock req_create_requests (Q4) takes. A photo can be sent only by the
-- account that uploaded it (6.5), so with this lock no two of that account's Q4
-- or Q9 calls check the same new file at once: the second waits, then sees the
-- first's photo row and answers 'already used' instead of failing on photo_pk.
-- The account lock always comes before any row lock, in every caller.
CREATE OR REPLACE FUNCTION requests.req_edit(
    p_request_id  UUID,
    p_resident_id VARCHAR(50),
    p_sent        TEXT[],
    p_category_id TEXT,
    p_quantity    INT,
    p_notes       TEXT,
    p_dates       DATE[],
    p_hours       SMALLINT[],
    p_file_id     TEXT,
    p_file_path   TEXT,
    p_demo        BOOLEAN,                  -- DEMO_MODE (contract 2.4, 17.5): E2's matched volunteers
    p_trace_id    TEXT,
    OUT result_code          TEXT,
    OUT error_fields         TEXT[],
    OUT error_messages       TEXT[],
    OUT unreferenced_file_id TEXT)
LANGUAGE plpgsql
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_code_ok             CONSTANT TEXT := 'ok';
    k_code_unavailable    CONSTANT TEXT := 'request_unavailable';
    k_code_overdue        CONSTANT TEXT := 'overdue';       -- from req_check_edit
    k_code_expired        CONSTANT TEXT := 'expired';
    k_code_validation     CONSTANT TEXT := 'validation_failed';
    k_sent_category       CONSTANT TEXT := 'categoryId';
    k_sent_quantity       CONSTANT TEXT := 'quantity';
    k_sent_notes          CONSTANT TEXT := 'notes';
    k_sent_windows        CONSTANT TEXT := 'windows';
    k_sent_photo          CONSTANT TEXT := 'photo';
    k_field_category      CONSTANT TEXT := 'categoryId';
    k_field_windows       CONSTANT TEXT := 'windows';
    k_field_photo         CONSTANT TEXT := 'photo.fileId';
    k_msg_unknown_category CONSTANT TEXT := 'unknown category';
    k_msg_photo_failed    CONSTANT TEXT := 'photo check failed';
    k_msg_already_used    CONSTANT TEXT := 'already used';
    k_status_expired      CONSTANT VARCHAR(30) := 'Expired';
    k_reason_no_window    CONSTANT TEXT := 'No window left in the future';
    k_event_expired       CONSTANT TEXT := 'RequestExpired';
    k_trigger_overdue     CONSTANT VARCHAR(30) := 'overdue_on_action';
    k_event_updated       CONSTANT TEXT := 'RequestUpdated';
    k_reason_edited       CONSTANT TEXT := 'edited';
    k_changed_category    CONSTANT TEXT := 'category';     -- E2 'changed' values, in the contract's order
    k_changed_quantity    CONSTANT TEXT := 'quantity';
    k_changed_notes       CONSTANT TEXT := 'notes';
    k_changed_windows     CONSTANT TEXT := 'windows';
    k_changed_photo       CONSTANT TEXT := 'photo';
    k_lock_account        CONSTANT TEXT := 'account:';   -- account lock key prefix, shared with Q4 and the User Service
    v_at           TIMESTAMPTZ;            -- the action's one moment, taken after the lock
    v_check         TEXT;
    v_old           RECORD;                 -- the request row as it was before this call
    v_sent_category BOOLEAN;                -- each field: present in the body
    v_sent_quantity BOOLEAN;
    v_sent_notes    BOOLEAN;
    v_sent_windows  BOOLEAN;
    v_sent_photo    BOOLEAN;
    v_new_photo     BOOLEAN;                -- a file other than the current one was sent
    v_win           RECORD;                 -- req_validate_windows' two OUT arrays
    v_new_category  TEXT;                   -- each field's value after this edit
    v_new_quantity  INT;
    v_new_notes     TEXT;
    v_new_file_id   TEXT;
    v_reweigh       BOOLEAN;                -- the category or the quantity changed (FR10)
    v_new_weight    NUMERIC(10,2);          -- estimated_weight_kg after this edit
    v_old_windows   TEXT[];                 -- active windows before / after, as sorted 'date hour'
    v_new_windows   TEXT[];
    v_changed       TEXT[] := '{}';         -- E2's 'changed'
    v_old_in_use    BOOLEAN;                -- another request still uses the old photo
    v_transition_id UUID := gen_random_uuid();
BEGIN
    IF p_request_id IS NULL OR p_resident_id IS NULL OR p_sent IS NULL OR p_demo IS NULL THEN
        RAISE EXCEPTION 'req_edit: missing argument';
    END IF;
    IF NOT p_sent <@ ARRAY[k_sent_category, k_sent_quantity, k_sent_notes, k_sent_windows, k_sent_photo] THEN
        RAISE EXCEPTION 'req_edit: unknown key in p_sent %', p_sent;
    END IF;
    error_fields   := '{}';
    error_messages := '{}';

    v_sent_category := k_sent_category = ANY (p_sent);
    v_sent_quantity := k_sent_quantity = ANY (p_sent);
    v_sent_notes    := k_sent_notes    = ANY (p_sent);
    v_sent_windows  := k_sent_windows  = ANY (p_sent);
    v_sent_photo    := k_sent_photo    = ANY (p_sent);

    -- categoryId, quantity and windows can't be NULL when sent (Valibot checked).
    IF v_sent_category AND p_category_id IS NULL THEN
        RAISE EXCEPTION 'req_edit: categoryId sent as NULL';
    END IF;
    IF v_sent_quantity AND p_quantity IS NULL THEN
        RAISE EXCEPTION 'req_edit: quantity sent as NULL';
    END IF;
    IF v_sent_windows AND p_dates IS NULL THEN
        RAISE EXCEPTION 'req_edit: windows sent as NULL';
    END IF;

    -- A field that is not in p_sent must have no value: refuse one that has (it would be ignored).
    IF NOT v_sent_category AND p_category_id IS NOT NULL THEN
        RAISE EXCEPTION 'req_edit: p_category_id is set, but categoryId is not in p_sent';
    END IF;
    IF NOT v_sent_quantity AND p_quantity IS NOT NULL THEN
        RAISE EXCEPTION 'req_edit: p_quantity is set, but quantity is not in p_sent';
    END IF;
    IF NOT v_sent_notes AND p_notes IS NOT NULL THEN
        RAISE EXCEPTION 'req_edit: p_notes is set, but notes is not in p_sent';
    END IF;
    IF NOT v_sent_windows AND p_dates IS NOT NULL THEN
        RAISE EXCEPTION 'req_edit: p_dates is set, but windows is not in p_sent';
    END IF;
    IF NOT v_sent_windows AND p_hours IS NOT NULL THEN
        RAISE EXCEPTION 'req_edit: p_hours is set, but windows is not in p_sent';
    END IF;
    IF NOT v_sent_photo AND p_file_id IS NOT NULL THEN
        RAISE EXCEPTION 'req_edit: p_file_id is set, but photo is not in p_sent';
    END IF;
    IF NOT v_sent_photo AND p_file_path IS NOT NULL THEN
        RAISE EXCEPTION 'req_edit: p_file_path is set, but photo is not in p_sent';
    END IF;

    -- 0. Take the caller's account lock, waiting for their other Q4 or Q9 calls.
    PERFORM pg_advisory_xact_lock(hashtext(k_lock_account || p_resident_id));

    -- 1. Lock the request row and keep its current values, then take the time.
    SELECT p.created_at, p.category_id, p.quantity, p.notes, p.file_id, p.estimated_weight_kg INTO v_old
    FROM pickup_request p WHERE p.pickup_request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        result_code := k_code_unavailable;
        RETURN;
    END IF;
    v_at := clock_timestamp();

    -- 2. State checks. Overdue: expire instead of editing, keep it, return
    -- 'expired' (as req_cancel does).
    v_check := requests.req_check_edit(p_request_id, p_resident_id, v_at);
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

    -- 3. Field checks, collected together.
    -- Category: must exist.
    IF v_sent_category AND NOT EXISTS (
        SELECT 1 FROM item_category c WHERE c.category_id = p_category_id) THEN
        error_fields   := array_append(error_fields, k_field_category);
        error_messages := array_append(error_messages, k_msg_unknown_category);
    END IF;

    -- Windows: 1-3 distinct future slots, within 30 days of the original createdAt (FR07).
    IF v_sent_windows THEN
        v_win := requests.req_validate_windows(k_field_windows, p_dates, p_hours, v_at, v_old.created_at);
        error_fields   := error_fields   || v_win.error_fields;
        error_messages := error_messages || v_win.error_messages;
    END IF;

    -- Photo: a new file must have passed TypeScript's check and never been used
    -- (every use is a photo row). Sending the current file again is no change.
    v_new_photo := v_sent_photo AND p_file_id IS NOT NULL AND p_file_id IS DISTINCT FROM v_old.file_id;
    IF v_new_photo AND p_file_path IS NULL THEN
        error_fields   := array_append(error_fields, k_field_photo);
        error_messages := array_append(error_messages, k_msg_photo_failed);
    ELSIF v_new_photo AND EXISTS (SELECT 1 FROM photo ph WHERE ph.file_id = p_file_id) THEN
        error_fields   := array_append(error_fields, k_field_photo);
        error_messages := array_append(error_messages, k_msg_already_used);
    END IF;

    IF cardinality(error_fields) > 0 THEN
        result_code := k_code_validation;
        RETURN;
    END IF;

    -- 4. Work out each field's value after the edit: the sent one, or the old one.
    v_new_category := v_old.category_id;
    IF v_sent_category THEN
        v_new_category := p_category_id;
    END IF;
    v_new_quantity := v_old.quantity;
    IF v_sent_quantity THEN
        v_new_quantity := p_quantity;
    END IF;
    v_new_notes := v_old.notes;
    IF v_sent_notes THEN
        v_new_notes := p_notes;
    END IF;
    v_new_file_id := v_old.file_id;
    IF v_sent_photo THEN
        v_new_file_id := p_file_id;
    END IF;

    -- Windows: each one as the text 'date hour' (e.g. '2026-11-23 12'), in a sorted
    -- list, so the order they were sent in doesn't matter.
    v_old_windows := ARRAY(
        SELECT pw.pickup_date || ' ' || pw.start_hour
        FROM pickup_window pw
        WHERE pw.pickup_request_id = p_request_id
          AND pw.is_active
        ORDER BY 1);
    v_new_windows := v_old_windows;
    IF v_sent_windows THEN
        v_new_windows := ARRAY(
            SELECT w.d || ' ' || w.h
            FROM unnest(p_dates, p_hours) AS w(d, h)
            ORDER BY 1);
    END IF;

    -- 5. List the fields whose value differs, in the contract's order.
    IF v_new_category <> v_old.category_id THEN
        v_changed := array_append(v_changed, k_changed_category);
    END IF;
    IF v_new_quantity <> v_old.quantity THEN
        v_changed := array_append(v_changed, k_changed_quantity);
    END IF;
    IF v_new_notes IS DISTINCT FROM v_old.notes THEN
        v_changed := array_append(v_changed, k_changed_notes);
    END IF;
    IF v_new_windows <> v_old_windows THEN
        v_changed := array_append(v_changed, k_changed_windows);
    END IF;
    IF v_new_file_id IS DISTINCT FROM v_old.file_id THEN
        v_changed := array_append(v_changed, k_changed_photo);
    END IF;

    -- Nothing differs: write nothing, publish nothing.
    IF cardinality(v_changed) = 0 THEN
        result_code := k_code_ok;
        RETURN;
    END IF;

    -- 6. Store the new photo first (the request row references it).
    IF v_new_photo THEN
        INSERT INTO photo (file_id, file_path) VALUES (p_file_id, p_file_path);
    END IF;

    -- 7. Keep the stored weight, unless the category or the quantity changed (FR10).
    v_reweigh := k_changed_category = ANY (v_changed) OR k_changed_quantity = ANY (v_changed);
    v_new_weight := v_old.estimated_weight_kg;
    IF v_reweigh THEN
        -- Price it with the (new) category's current standard weight.
        SELECT v_new_quantity * c.standard_weight_kg INTO v_new_weight
        FROM item_category c
        WHERE c.category_id = v_new_category;
    END IF;

    -- Update the request.
    UPDATE pickup_request p
    SET category_id         = v_new_category,
        quantity            = v_new_quantity,
        notes               = v_new_notes,
        file_id             = v_new_file_id,
        estimated_weight_kg = v_new_weight
    WHERE p.pickup_request_id = p_request_id;

    -- 8. Replace the active windows. The old rows stay, inactive (assignment history).
    IF k_changed_windows = ANY (v_changed) THEN
        UPDATE pickup_window pw
        SET is_active = FALSE
        WHERE pw.pickup_request_id = p_request_id
          AND pw.is_active;

        INSERT INTO pickup_window (pickup_window_id, pickup_request_id, pickup_date, start_hour, is_active)
        SELECT gen_random_uuid(), p_request_id, w.d, w.h, TRUE
        FROM unnest(p_dates, p_hours) AS w(d, h);
    END IF;

    -- 9. Drop the old photo's row if no request uses it any more (a reschedule
    -- shares it, 12.5), and hand its file id back for deletion after commit (6.7).
    IF k_changed_photo = ANY (v_changed) AND v_old.file_id IS NOT NULL THEN
        v_old_in_use := EXISTS (
            SELECT 1 FROM pickup_request p WHERE p.file_id = v_old.file_id);
        IF NOT v_old_in_use THEN
            DELETE FROM photo ph WHERE ph.file_id = v_old.file_id;
            unreferenced_file_id := v_old.file_id;
        END IF;
    END IF;

    -- 10. Event: E2 'edited' with the changed fields.
    PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => k_event_updated,
                                       p_transition_id => v_transition_id, p_at => v_at,
                                       p_trace_id => p_trace_id, p_reason => k_reason_edited,
                                       p_changed => v_changed, p_demo => p_demo);

    -- 11. Post-condition: only a bug can trip it.
    PERFORM requests.check_request(p_request_id);

    result_code := k_code_ok;
END;
$$;
