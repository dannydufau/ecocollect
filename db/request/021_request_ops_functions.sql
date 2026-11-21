-- Request Service outbox functions (schema "requests").
-- The publisher (TypeScript) calls only these two; it never touches the outbox
-- table directly. Each call is its own transaction (autocommit), so the claim is
-- committed before the network send, and the lease (claimed_until) stands in
-- for a lock held across it.
-- Like 020, nothing here references ecocollect608, so it loads without it.

-- Returns the oldest unsent event and leases it for p_lease_seconds, or a row of
-- all NULLs when there is nothing to send right now:
--   - the outbox has no unsent event, or
--   - the oldest unsent event is still leased (an earlier send is in flight, or
--     failed and its lease hasn't run out yet).
-- Strict first-in-line: it never skips past the oldest unsent event, so events
-- go out in the order they were stored, and a failed send holds back the later
-- ones until it is retried (at most one lease later).
-- Call as: SELECT * FROM requests.req_outbox_claim(30)
CREATE OR REPLACE FUNCTION requests.req_outbox_claim(p_lease_seconds INTEGER)
RETURNS requests.outbox
LANGUAGE plpgsql
SET search_path TO requests, pg_temp
AS $$
DECLARE
    v_row requests.outbox;
    v_now TIMESTAMPTZ;
BEGIN
    -- A bad lease is a bug in the caller, not a business failure.
    IF p_lease_seconds IS NULL OR p_lease_seconds < 1 THEN
        RAISE EXCEPTION 'req_outbox_claim: lease must be at least 1 second, got %', p_lease_seconds;
    END IF;

    -- The oldest unsent event, locked. Plain FOR UPDATE, not SKIP LOCKED:
    -- SKIP LOCKED would move on to the next event while another claimer holds
    -- this one, and send them out of order. A second claimer here waits for the
    -- first one's (very short) transaction, then sees its lease and gets nothing.
    -- request_seq breaks a tie in enqueued_at between two events of one action.
    SELECT * INTO v_row
    FROM requests.outbox
    WHERE published_at IS NULL
    ORDER BY enqueued_at, request_seq
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;                          -- nothing unsent
    END IF;

    -- clock_timestamp(), not now(): now() is when this transaction started,
    -- which is before any wait on the lock above.
    v_now := clock_timestamp();

    IF v_row.claimed_until IS NOT NULL AND v_row.claimed_until > v_now THEN
        RETURN NULL;                          -- leased by an earlier claim: wait
    END IF;

    UPDATE requests.outbox
    SET claimed_until = v_now + make_interval(secs => p_lease_seconds)
    WHERE event_id = v_row.event_id
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

-- Marks an event as sent, after RabbitMQ has confirmed it.
-- Returns false when nothing changed: the event doesn't exist or was already
-- marked (another claim sent it again after this one's lease ran out; consumers
-- ignore the duplicate by event id). The publisher logs that, nothing more.
-- Call as: SELECT requests.req_outbox_mark_published($1)
CREATE OR REPLACE FUNCTION requests.req_outbox_mark_published(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path TO requests, pg_temp
AS $$
BEGIN
    UPDATE requests.outbox
    SET published_at = clock_timestamp()
    WHERE event_id = p_event_id
      AND published_at IS NULL;

    RETURN FOUND;
END;
$$;
