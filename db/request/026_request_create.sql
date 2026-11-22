-- req_create_requests: Q4, create one pickup request per item, in one call and
-- one transaction (contract Q4, FR06-FR08, FR22). Called by TypeScript as
--   SELECT * FROM requests.req_create_requests($1, ..., $12)
-- Needs 020 (idempotency_keys), 022 (helpers), 023 (req_enqueue_event), 024 (check_request).
-- Created in "requests"; course tables are named without a schema (see 020).
--
-- Items come as parallel arrays: element i of p_category_ids, p_quantities,
-- p_photo_file_ids and p_photo_paths is one item. An item without a photo has
-- NULL in both photo arrays. The photo's path comes from ImageKit's file details,
-- checked by TypeScript before the call (contract 6.5); a file that failed that
-- check has its file id with a NULL path (answered as a field error here).
--
-- result_code:
--   'ok'                created; created_request_ids in item order
--   'replayed'          same resident and Idempotency-Key within 24 h: the ids
--                       the first call created, nothing written
--   'forbidden'         not an active resident (no resident row, or deactivated)
--   'terms_outdated'    p_terms_document_id is not the current terms document
--   'validation_failed' error_fields / error_messages list every failing field
--                       (zero-based paths, contract), nothing written
-- Business failures are returned; a RAISE means a bug in the caller (TypeScript
-- checks the body's shape first) and rolls back everything.
--
-- Account lock (FR04): before reading the resident, it takes the advisory lock
-- pg_advisory_xact_lock(hashtext('account:' || account_id)), shared with the User
-- Service's address edit (U7) and deactivation (U9), and with req_accept (Q11).
-- Without it, an address edit or a deactivation running at the same time misses
-- the new Open requests, and this call reads the address or deactivated_at from
-- before that change. The address is read in a later statement than the lock, so
-- it sees anything committed while this call waited.
CREATE OR REPLACE FUNCTION requests.req_create_requests(
    p_resident_id       VARCHAR(50),
    p_idempotency_key   VARCHAR(200),       -- NULL when the header is absent
    p_terms_document_id UUID,
    p_category_ids      TEXT[],
    p_quantities        INT[],
    p_photo_file_ids    TEXT[],
    p_photo_paths       TEXT[],
    p_dates             DATE[],
    p_hours             SMALLINT[],
    p_notes             TEXT,
    p_demo              BOOLEAN,
    p_trace_id          TEXT,
    OUT result_code         TEXT,
    OUT error_fields        TEXT[],
    OUT error_messages      TEXT[],
    OUT created_request_ids UUID[])
LANGUAGE plpgsql
SET search_path TO requests, ecocollect608, pg_temp
AS $$
DECLARE
    k_key_ttl                CONSTANT INTERVAL := INTERVAL '24 hours';   -- how long a key replays (NFR06)
    k_key_max                CONSTANT INT := 200;   -- key length limit (contract Q4); the column is VARCHAR(200)
    k_code_ok                CONSTANT TEXT := 'ok';
    k_code_replayed          CONSTANT TEXT := 'replayed';
    k_code_forbidden         CONSTANT TEXT := 'forbidden';
    k_code_terms_outdated    CONSTANT TEXT := 'terms_outdated';
    k_code_validation_failed CONSTANT TEXT := 'validation_failed';
    k_field_idempotency_key  CONSTANT TEXT := 'Idempotency-Key';
    k_field_windows          CONSTANT TEXT := 'windows';
    k_msg_unknown_category   CONSTANT TEXT := 'unknown category';
    k_msg_already_selected   CONSTANT TEXT := 'already selected';
    k_msg_at_least_one       CONSTANT TEXT := 'must be at least 1';
    k_msg_already_used       CONSTANT TEXT := 'already used';
    k_msg_photo_failed       CONSTANT TEXT := 'photo check failed';
    k_terms_resident         CONSTANT VARCHAR(40) := 'AT_RESIDENT_REQUEST_CREATION';
    k_status_open            CONSTANT VARCHAR(30) := 'Open';
    k_event_created          CONSTANT TEXT := 'RequestCreated';
    k_lock_account           CONSTANT TEXT := 'account:';   -- account lock key prefix, shared with the User Service
    v_now           TIMESTAMPTZ := now();   -- one moment for the whole action
    v_count         INT := coalesce(cardinality(p_category_ids), 0);
    v_street        VARCHAR(255);
    v_postal_code   CHAR(6);
    v_current_terms UUID;
    v_win           RECORD;                 -- req_validate_windows' two OUT arrays
    v_ids           UUID[];
    v_ta_id         UUID := gen_random_uuid();
    v_transition_id UUID := gen_random_uuid();
    v_has_photo     BOOLEAN;                -- item i was sent with a photo
BEGIN
    error_fields   := '{}';
    error_messages := '{}';

    -- 0. Shape (TypeScript's job; a mismatch here is a bug).
    IF p_resident_id IS NULL OR p_demo IS NULL OR v_count = 0
       OR cardinality(p_quantities)     IS DISTINCT FROM v_count
       OR cardinality(p_photo_file_ids) IS DISTINCT FROM v_count
       OR cardinality(p_photo_paths)    IS DISTINCT FROM v_count
       OR array_position(p_category_ids, NULL) IS NOT NULL
       OR array_position(p_quantities, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'req_create_requests: missing argument or unpaired item arrays';
    END IF;
    FOR i IN 1 .. v_count LOOP
        IF p_photo_file_ids[i] IS NULL AND p_photo_paths[i] IS NOT NULL THEN
            RAISE EXCEPTION 'req_create_requests: item % has a photo path without a file id', i;
        END IF;
    END LOOP;

    -- 0b. Take the resident's account lock, waiting for any address edit or deactivation.
    PERFORM pg_advisory_xact_lock(hashtext(k_lock_account || p_resident_id));

    -- 1. An active resident; the address is copied from the profile (FR07).
    SELECT r.street, r.postal_code INTO v_street, v_postal_code
    FROM resident r
    JOIN account a ON a.account_id = r.account_id
    WHERE r.account_id = p_resident_id
      AND a.deactivated_at IS NULL;
    IF NOT FOUND THEN
        result_code := k_code_forbidden;
        RETURN;
    END IF;

    -- 1b. A key, when given, is 1-200 characters (contract Q4). Checked before the
    -- lookup, or a stored '' would replay. Postgres ignores the (200) on a
    -- parameter, so without this a longer key would fail at the INSERT (a raise).
    IF p_idempotency_key IS NOT NULL
       AND char_length(p_idempotency_key) NOT BETWEEN 1 AND k_key_max THEN
        error_fields   := ARRAY[k_field_idempotency_key];
        error_messages := ARRAY[format('must be 1 to %s characters', k_key_max)];
        result_code    := k_code_validation_failed;
        RETURN;
    END IF;

    -- 2. A repeat within 24 h returns the first call's requests, whatever the body
    -- says now (its windows may be in the past by then).
    SELECT k.request_ids INTO created_request_ids
    FROM requests.idempotency_keys k
    WHERE k.resident_id = p_resident_id
      AND k.idempotency_key = p_idempotency_key       -- no match when the key is NULL
      AND k.created_at > v_now - k_key_ttl;
    IF FOUND THEN
        result_code := k_code_replayed;
        RETURN;
    END IF;

    -- 3. The terms must be the current document: the latest one published by now.
    SELECT d.terms_document_id INTO v_current_terms
    FROM terms_document d
    WHERE d.published_at <= v_now
    ORDER BY d.published_at DESC
    LIMIT 1;
    IF p_terms_document_id IS DISTINCT FROM v_current_terms THEN
        result_code := k_code_terms_outdated;
        RETURN;
    END IF;

    -- 4. Field checks, all of them, before any write. One entry per field.
    FOR i IN 1 .. v_count LOOP
        IF NOT EXISTS (SELECT 1 FROM item_category c WHERE c.category_id = p_category_ids[i]) THEN
            error_fields   := array_append(error_fields, format('items[%s].categoryId', i - 1));
            error_messages := array_append(error_messages, k_msg_unknown_category);
        ELSIF array_position(p_category_ids, p_category_ids[i]) < i THEN   -- first position is earlier
            error_fields   := array_append(error_fields, format('items[%s].categoryId', i - 1));
            error_messages := array_append(error_messages, k_msg_already_selected);
        END IF;

        -- Model rule (pickup_request_ck1): without this, 0 fails at the INSERT.
        IF p_quantities[i] < 1 THEN
            error_fields   := array_append(error_fields, format('items[%s].quantity', i - 1));
            error_messages := array_append(error_messages, k_msg_at_least_one);
        END IF;

        -- A photo must have passed TypeScript's check (6.5). A file is one photo
        -- row: never on two new items, never already stored (another request's
        -- photo or delivery evidence).
        v_has_photo := p_photo_file_ids[i] IS NOT NULL;
        IF v_has_photo AND p_photo_paths[i] IS NULL THEN
            error_fields   := array_append(error_fields, format('items[%s].photo.fileId', i - 1));
            error_messages := array_append(error_messages, k_msg_photo_failed);
        ELSIF v_has_photo AND array_position(p_photo_file_ids, p_photo_file_ids[i]) < i THEN
            error_fields   := array_append(error_fields, format('items[%s].photo.fileId', i - 1));
            error_messages := array_append(error_messages, k_msg_already_used);
        ELSIF v_has_photo AND EXISTS (SELECT 1 FROM photo ph WHERE ph.file_id = p_photo_file_ids[i]) THEN
            error_fields   := array_append(error_fields, format('items[%s].photo.fileId', i - 1));
            error_messages := array_append(error_messages, k_msg_already_used);
        END IF;
    END LOOP;

    -- Windows: in the future and within 30 days of this creation (createdAt = v_now).
    v_win := requests.req_validate_windows(k_field_windows, p_dates, p_hours, v_now, v_now);
    error_fields   := error_fields   || v_win.error_fields;
    error_messages := error_messages || v_win.error_messages;

    IF cardinality(error_fields) > 0 THEN
        result_code := k_code_validation_failed;
        RETURN;
    END IF;

    -- 5. The idempotency key goes in before the requests, so a concurrent call with
    -- the same key waits here until this one commits, then takes the conflict and
    -- replays. A key older than 24 h is overwritten (contract section 8). With no
    -- row back, a live key exists: the other call won, replay its requests.
    v_ids := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, v_count));
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO requests.idempotency_keys AS k (resident_id, idempotency_key, request_ids, created_at)
        VALUES (p_resident_id, p_idempotency_key, v_ids, v_now)
        ON CONFLICT (resident_id, idempotency_key) DO UPDATE
            SET request_ids = EXCLUDED.request_ids, created_at = EXCLUDED.created_at
            WHERE k.created_at <= v_now - k_key_ttl;
        IF NOT FOUND THEN
            SELECT k.request_ids INTO created_request_ids
            FROM requests.idempotency_keys k
            WHERE k.resident_id = p_resident_id AND k.idempotency_key = p_idempotency_key;
            result_code := k_code_replayed;
            RETURN;
        END IF;
    END IF;

    -- 6. Writes. One terms acceptance shared by every request (FR22), at createdAt.
    INSERT INTO terms_acceptance (terms_acceptance_id, terms_document_id, account_id, accepted_at, type)
    VALUES (v_ta_id, p_terms_document_id, p_resident_id, v_now, k_terms_resident);

    FOR i IN 1 .. v_count LOOP
        IF p_photo_file_ids[i] IS NOT NULL THEN
            INSERT INTO photo (file_id, file_path) VALUES (p_photo_file_ids[i], p_photo_paths[i]);
        END IF;

        -- Weight = quantity x the category's standard weight (the model's check_new_request).
        -- request_seq starts at 1: RequestCreated uses it as it is (023).
        INSERT INTO pickup_request (pickup_request_id, category_id, terms_acceptance_id, quantity,
                                    estimated_weight_kg, created_at, request_seq, pickup_street,
                                    pickup_postal_code, notes, file_id, rescheduled_from_request_id)
        SELECT v_ids[i], c.category_id, v_ta_id, p_quantities[i],
               p_quantities[i] * c.standard_weight_kg, v_now, 1, v_street,
               v_postal_code, p_notes, p_photo_file_ids[i], NULL
        FROM item_category c
        WHERE c.category_id = p_category_ids[i];

        -- Each request gets its own rows for the same slots.
        INSERT INTO pickup_window (pickup_window_id, pickup_request_id, pickup_date, start_hour, is_active)
        SELECT gen_random_uuid(), v_ids[i], w.d, w.h, TRUE
        FROM unnest(p_dates, p_hours) AS w(d, h);

        INSERT INTO status_change (pickup_request_id, changed_at, status, reason)
        VALUES (v_ids[i], v_now, k_status_open, NULL);
    END LOOP;

    -- 7. One RequestCreated per request, in item order, sharing the action's transitionId.
    FOR i IN 1 .. v_count LOOP
        PERFORM requests.req_enqueue_event(p_request_id => v_ids[i], p_event_type => k_event_created,
                                           p_transition_id => v_transition_id, p_at => v_now,
                                           p_trace_id => p_trace_id, p_demo => p_demo);
    END LOOP;

    -- 8. Post-condition: only a bug can trip it.
    FOR i IN 1 .. v_count LOOP
        PERFORM requests.check_request(v_ids[i]);
    END LOOP;

    result_code := k_code_ok;
    created_request_ids := v_ids;
END;
$$;
