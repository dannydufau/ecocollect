-- CleanupRequest (contract asyncapi CleanupRequest, E10; README 12.6): the Cleanup
-- Service nudges the Request Service to expire an Open request whose latest
-- window has started. The message is only a nudge: its requestSeq and expiresAt
-- are for logs, and this function locks the request and checks it again.
-- Needs 020 (processed_events), 022 (helpers), 023 (req_enqueue_event), 024 (check_request).
-- Created in "requests"; course tables are named without a schema (see 020).

-- req_expire: one CleanupRequest message, in one call and one transaction.
-- Called by the CleanupRequest consumer as
--   SELECT * FROM requests.req_expire($1, $2)
--   p_event_id  the message's eventId
--
-- The event id is recorded in processed_events first, for every result except
-- 'duplicate', so a redelivered message does nothing but that one insert.
-- An unknown request is recorded too: a retry can't make it appear.
--
-- result_code:
--   'duplicate'            p_event_id was already processed; nothing else done
--   'request_unavailable'  no such request
--   'not_open'             the request is not Open (Assigned, Expired, Cancelled, ...)
--   'not_due'              Open, but expiresAt is still in the future (an edit
--                          may have moved it since the message was sent)
--   'expired'              the request is now Expired, with its RequestExpired event
-- Every result is a normal outcome; a RAISE means a bug and rolls back everything.
CREATE OR REPLACE FUNCTION requests.req_expire(
    p_request_id UUID,
    p_event_id   UUID,
    OUT result_code TEXT)
LANGUAGE plpgsql
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    k_code_duplicate   CONSTANT TEXT := 'duplicate';
    k_code_unavailable CONSTANT TEXT := 'request_unavailable';
    k_code_not_open    CONSTANT TEXT := 'not_open';
    k_code_not_due     CONSTANT TEXT := 'not_due';
    k_code_expired     CONSTANT TEXT := 'expired';
    k_status_open      CONSTANT VARCHAR(30) := 'Open';
    k_status_expired   CONSTANT VARCHAR(30) := 'Expired';
    k_reason_no_window CONSTANT TEXT := 'No window left in the future';
    k_event_expired    CONSTANT TEXT := 'RequestExpired';
    k_trigger_cleanup  CONSTANT VARCHAR(30) := 'cleanup_job';
    v_at            TIMESTAMPTZ;            -- the action's one moment, taken after the lock
    v_is_open       BOOLEAN;                -- the request is Open now
    v_is_due        BOOLEAN;                -- its expiresAt has been reached
    v_transition_id UUID := gen_random_uuid();
BEGIN
    IF p_request_id IS NULL OR p_event_id IS NULL THEN
        RAISE EXCEPTION 'req_expire: missing argument';
    END IF;

    -- 1. Record the event id; stop if it was already there.
    INSERT INTO processed_events (event_id) VALUES (p_event_id)
    ON CONFLICT (event_id) DO NOTHING;
    IF NOT FOUND THEN
        result_code := k_code_duplicate;
        RETURN;
    END IF;

    -- 2. Lock the request row, then take the time (as in req_cancel).
    PERFORM 1 FROM pickup_request p WHERE p.pickup_request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        result_code := k_code_unavailable;
        RETURN;
    END IF;
    v_at := clock_timestamp();

    -- 3. Check the request is still Open.
    v_is_open := requests.req_current_status(p_request_id) = k_status_open;
    IF NOT v_is_open THEN
        result_code := k_code_not_open;
        RETURN;
    END IF;

    -- 4. Check its expiresAt has been reached.
    v_is_due := requests.req_expires_at(p_request_id) <= v_at;
    IF NOT v_is_due THEN
        result_code := k_code_not_due;
        RETURN;
    END IF;

    -- 5. Add the Expired status change.
    INSERT INTO status_change (pickup_request_id, changed_at, status, reason)
    VALUES (p_request_id, v_at, k_status_expired, k_reason_no_window);

    -- 6. Store E10 RequestExpired, trigger cleanup_job, no trace id.
    PERFORM requests.req_enqueue_event(p_request_id => p_request_id, p_event_type => k_event_expired,
                                       p_transition_id => v_transition_id, p_at => v_at,
                                       p_trace_id => NULL, p_trigger => k_trigger_cleanup);

    -- 7. Check the post-condition: only a bug can trip it.
    PERFORM requests.check_request(p_request_id);

    result_code := k_code_expired;
END;
$$;
