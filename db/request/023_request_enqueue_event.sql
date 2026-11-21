-- req_enqueue_event: stores one event in requests.outbox, in the
-- caller's transaction. Every write function calls it once per event, in event
-- order, after its writes, so the snapshot shows the request AFTER the change
-- (contract 10.2). Internal: called by other functions, never by TypeScript.
-- Needs 020 (outbox) and 022 (helpers).
-- Created in "requests"; course tables are named without a schema (see 020).
--
-- The caller must already hold the pickup_request row lock (every write function
-- starts with SELECT ... FOR UPDATE), so request_seq stays consecutive.
--
-- Parameters after p_at are only for some events; leave them out (DEFAULT NULL)
-- when an event doesn't use them, and call with named arguments, e.g.
--   PERFORM requests.req_enqueue_event(p_request_id => v_id, p_event_type => k_event_cancelled,
--                             p_transition_id => v_tid, p_at => v_at,
--                             p_trace_id => p_trace_id, p_reason => p_reason);
-- (k_event_cancelled is the caller's own constant, 'RequestCancelled'.)
-- What each event must and must not carry is checked by outbox_e1_ck ... outbox_e10_ck
-- (020): a wrong combination raises and rolls back the whole action (a bug).
--
-- Returns the new event's id.
CREATE OR REPLACE FUNCTION requests.req_enqueue_event(
    p_request_id     UUID,
    p_event_type     TEXT,
    p_transition_id  UUID,                    -- one per action, shared by its events
    p_at             TIMESTAMPTZ,             -- the action's time: occurredAt
    p_trace_id       TEXT    DEFAULT NULL,    -- X-Request-Id; NULL for CleanupRequest
    p_assignment_id  UUID    DEFAULT NULL,    -- E3-E8
    p_changed        TEXT[]  DEFAULT NULL,    -- E2 'edited'
    p_outside_window BOOLEAN DEFAULT NULL,    -- E6
    p_reason         TEXT    DEFAULT NULL,    -- E2 'edited'/'reopened', E9 (optional)
    p_trigger        TEXT    DEFAULT NULL,    -- E10
    p_demo           BOOLEAN DEFAULT NULL     -- E1, E2 (matched volunteers)
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path TO requests, ecocollect608, pg_temp
AS $$
DECLARE
    -- Event types (contract 10.1)
    k_event_created              CONSTANT TEXT := 'RequestCreated';
    k_event_updated              CONSTANT TEXT := 'RequestUpdated';
    k_event_assigned             CONSTANT TEXT := 'RequestAssigned';
    k_event_collected            CONSTANT TEXT := 'RequestAssignmentCollected';
    k_event_delivered            CONSTANT TEXT := 'RequestAssignmentDelivered';
    k_event_cancelled_resident   CONSTANT TEXT := 'RequestAssignmentCancelledResident';
    k_event_cancelled_volunteer  CONSTANT TEXT := 'RequestAssignmentCancelledVolunteer';
    k_event_missed               CONSTANT TEXT := 'RequestAssignmentMissed';
    k_event_cancelled            CONSTANT TEXT := 'RequestCancelled';
    k_event_expired              CONSTANT TEXT := 'RequestExpired';
    -- Their routing keys, in the same order
    k_route_created              CONSTANT TEXT := 'request.created';
    k_route_updated              CONSTANT TEXT := 'request.updated';
    k_route_assigned             CONSTANT TEXT := 'request.assigned';
    k_route_collected            CONSTANT TEXT := 'request.assignment.collected';
    k_route_delivered            CONSTANT TEXT := 'request.assignment.delivered';
    k_route_cancelled_resident   CONSTANT TEXT := 'request.assignment.cancelled.resident';
    k_route_cancelled_volunteer  CONSTANT TEXT := 'request.assignment.cancelled.volunteer';
    k_route_missed               CONSTANT TEXT := 'request.assignment.missed';
    k_route_cancelled            CONSTANT TEXT := 'request.cancelled';
    k_route_expired              CONSTANT TEXT := 'request.expired';
    v_event_id     UUID := gen_random_uuid();
    v_routing_key  TEXT;
    v_version      INTEGER;
    v_seq          BIGINT;
    v_window_ids   UUID[];
    v_window_dates DATE[];
    v_window_hours SMALLINT[];
BEGIN
    -- 1. Routing key and version of the type (contract 10.1, 10.3).
    CASE p_event_type
        WHEN k_event_created             THEN v_routing_key := k_route_created;             v_version := 2;
        WHEN k_event_updated             THEN v_routing_key := k_route_updated;             v_version := 1;
        WHEN k_event_assigned            THEN v_routing_key := k_route_assigned;            v_version := 1;
        WHEN k_event_collected           THEN v_routing_key := k_route_collected;           v_version := 1;
        WHEN k_event_delivered           THEN v_routing_key := k_route_delivered;           v_version := 1;
        WHEN k_event_cancelled_resident  THEN v_routing_key := k_route_cancelled_resident;  v_version := 1;
        WHEN k_event_cancelled_volunteer THEN v_routing_key := k_route_cancelled_volunteer; v_version := 1;
        WHEN k_event_missed              THEN v_routing_key := k_route_missed;              v_version := 1;
        WHEN k_event_cancelled           THEN v_routing_key := k_route_cancelled;           v_version := 1;
        WHEN k_event_expired             THEN v_routing_key := k_route_expired;             v_version := 1;
        ELSE RAISE EXCEPTION 'req_enqueue_event: unknown event type %', p_event_type;
    END CASE;

    -- 2. requestSeq (contract 10.2). The row keeps the number of its latest event.
    -- E1 is always a request's first event, and the creating function inserted the
    -- row with request_seq = 1 (the model forbids 0), so E1 uses that 1 as it is.
    -- Every other event adds 1.
    IF p_event_type = k_event_created THEN
        SELECT p.request_seq INTO v_seq
        FROM pickup_request p
        WHERE p.pickup_request_id = p_request_id;

        IF v_seq IS DISTINCT FROM 1 THEN     -- also catches a missing request (NULL)
            RAISE EXCEPTION 'req_enqueue_event: RequestCreated for request % with request_seq %', p_request_id, v_seq;
        END IF;
    ELSE
        UPDATE pickup_request
        SET request_seq = request_seq + 1
        WHERE pickup_request_id = p_request_id
        RETURNING request_seq INTO v_seq;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'req_enqueue_event: request % not found', p_request_id;
        END IF;
    END IF;

    -- 3. The assignment must belong to this request (a bug otherwise).
    IF p_assignment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM assignment a
        JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
        WHERE a.assignment_id = p_assignment_id
          AND w.pickup_request_id = p_request_id
    ) THEN
        RAISE EXCEPTION 'req_enqueue_event: assignment % is not on request %', p_assignment_id, p_request_id;
    END IF;

    -- 4. Active windows as three parallel arrays, all in the same order.
    SELECT array_agg(w.pickup_window_id ORDER BY w.pickup_date, w.start_hour),
           array_agg(w.pickup_date      ORDER BY w.pickup_date, w.start_hour),
           array_agg(w.start_hour       ORDER BY w.pickup_date, w.start_hour)
    INTO v_window_ids, v_window_dates, v_window_hours
    FROM pickup_window w
    WHERE w.pickup_request_id = p_request_id
      AND w.is_active;

    -- 5. One outbox row. The LEFT JOINs give NULLs when there is no assignment
    -- (p_assignment_id NULL) or no delivery (every event except E5).
    INSERT INTO requests.outbox (
        event_id, event_type, event_version, routing_key, occurred_at, trace_id,
        pickup_request_id, request_seq, transition_id, status, resident_id,
        category_id, category_name, waste_type, quantity, estimated_weight_kg, postal_code,
        window_ids, window_dates, window_start_hours, request_created_at, expires_at,
        assignment_id, volunteer_id, assignment_window_id, assignment_window_date,
        assignment_window_start_hour, accepted_at, collected_at, ended_at, end_reason,
        facility_id, facility_name, delivered_at, cancelled_at, outside_cancellation_window,
        reported_at, rescheduled_as_request_id, rescheduled_from_request_id,
        matched_volunteer_ids, changed, reason, expiry_trigger
    )
    SELECT
        v_event_id, p_event_type, v_version, v_routing_key, p_at, p_trace_id,
        p.pickup_request_id, v_seq, p_transition_id,
        requests.req_current_status(p.pickup_request_id),
        requests.req_owner_id(p.pickup_request_id),
        p.category_id, c.name, c.waste_type, p.quantity, p.estimated_weight_kg, p.pickup_postal_code,
        v_window_ids, v_window_dates, v_window_hours, p.created_at,
        requests.req_expires_at(p.pickup_request_id),
        a.assignment_id, vta.account_id, aw.pickup_window_id, aw.pickup_date,
        aw.start_hour, a.accepted_at, a.collected_at, a.ended_at, a.end_reason,
        f.facility_id, f.name,
        CASE WHEN d.delivery_id IS NOT NULL THEN a.ended_at END,              -- deliveredAt (E5)
        CASE WHEN p_event_type IN (k_event_cancelled_resident,
                                   k_event_cancelled_volunteer) THEN p_at END,    -- cancelledAt
        p_outside_window,
        CASE WHEN p_event_type = k_event_missed THEN p_at END,                -- reportedAt
        CASE WHEN p_event_type = k_event_missed THEN                          -- rescheduledAsRequestId
            (SELECT n.pickup_request_id FROM pickup_request n
             WHERE n.rescheduled_from_request_id = p.pickup_request_id) END,
        CASE WHEN p_event_type = k_event_created THEN p.rescheduled_from_request_id END,
        CASE WHEN p_event_type IN (k_event_created, k_event_updated) THEN
            requests.req_matched_volunteers(p.pickup_request_id, p_demo) END,
        p_changed, p_reason, p_trigger
    FROM pickup_request p
    JOIN item_category c        ON c.category_id = p.category_id
    LEFT JOIN assignment a      ON a.assignment_id = p_assignment_id
    LEFT JOIN pickup_window aw  ON aw.pickup_window_id = a.pickup_window_id
    LEFT JOIN terms_acceptance vta ON vta.terms_acceptance_id = a.terms_acceptance_id
    LEFT JOIN delivery d        ON d.assignment_id = a.assignment_id
                                             AND p_event_type = k_event_delivered
    LEFT JOIN recycling_facility f ON f.facility_id = d.facility_id
    WHERE p.pickup_request_id = p_request_id;

    RETURN v_event_id;
END;
$$;
