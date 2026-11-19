BEGIN;
SET search_path TO ecocollect608, public;

-- Check a complete transaction before committing its related rows.
CREATE PROCEDURE check_business_rules()
LANGUAGE plpgsql
SET search_path TO ecocollect608, pg_temp
AS $$
DECLARE
    unlinked_facility RECORD;
    unlinked_category RECORD;
BEGIN
    SELECT f.facility_id, f.name INTO unlinked_facility
    FROM recycling_facility f
    WHERE NOT EXISTS (SELECT 1 FROM facility_accepts a WHERE a.facility_id=f.facility_id)
    ORDER BY f.facility_id LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Facility % (%) must accept at least one category',
            unlinked_facility.facility_id, unlinked_facility.name USING ERRCODE = '23514';
    END IF;
    SELECT c.category_id, c.name INTO unlinked_category
    FROM item_category c
    WHERE NOT EXISTS (SELECT 1 FROM facility_accepts a WHERE a.category_id=c.category_id)
    ORDER BY c.category_id LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Category % (%) must be accepted by at least one facility',
            unlinked_category.category_id, unlinked_category.name USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM ecopoints_award e
        JOIN assignment a ON a.assignment_id=e.assignment_id
        JOIN pickup_window w ON w.pickup_window_id=a.pickup_window_id
        JOIN pickup_request p ON p.pickup_request_id=w.pickup_request_id
        JOIN terms_acceptance owner ON owner.terms_acceptance_id=p.terms_acceptance_id
        JOIN terms_acceptance helper ON helper.terms_acceptance_id=a.terms_acceptance_id
        LEFT JOIN resident_award r ON r.ecopoints_award_id=e.ecopoints_award_id
        WHERE a.end_reason IS NULL OR a.end_reason IS DISTINCT
        FROM 'Delivered' AND NOT (a.end_reason='Resident_Cancelled' AND r.ecopoints_award_id IS NULL AND owner.account_id<>helper.account_id AND a.ended_at > ((w.pickup_date+w.start_hour*INTERVAL '1 hour') AT TIME ZONE 'America/Edmonton')-INTERVAL '24 hours' AND a.ended_at < ((w.pickup_date+(w.start_hour+1)*INTERVAL '1 hour') AT TIME ZONE 'America/Edmonton'))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Award must have an eligible completed assignment';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM account a
        WHERE NOT EXISTS (SELECT 1
        FROM resident r
        WHERE r.account_id=a.account_id) AND NOT EXISTS (SELECT 1
        FROM volunteer v
        WHERE v.account_id=a.account_id)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Every account needs a role';
    END IF;
    IF EXISTS (
        SELECT account_id
        FROM volunteer_preferred_postal_code
        GROUP BY account_id
        HAVING COUNT(*) > 3
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'At most three preferred postal codes';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pickup_request p
        JOIN terms_acceptance t ON t.terms_acceptance_id=p.terms_acceptance_id
        LEFT JOIN resident r ON r.account_id=t.account_id
        WHERE r.account_id IS NULL OR t.type <> 'AT_RESIDENT_REQUEST_CREATION' OR t.accepted_at <> p.created_at
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Request acceptance must belong to its resident';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM assignment a
        JOIN terms_acceptance t ON t.terms_acceptance_id=a.terms_acceptance_id
        LEFT JOIN volunteer v ON v.account_id=t.account_id
        WHERE v.account_id IS NULL OR t.type <> 'AT_VOLUNTEER_ACCEPTANCE' OR t.accepted_at <> a.accepted_at
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Assignment acceptance must belong to its volunteer';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM terms_acceptance a
        JOIN terms_document d ON d.terms_document_id=a.terms_document_id
        WHERE d.published_at > a.accepted_at OR EXISTS (SELECT 1
        FROM terms_document later
        WHERE later.published_at > d.published_at AND later.published_at <= a.accepted_at)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Terms must be current when accepted';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM terms_acceptance t
        WHERE (t.type='AT_RESIDENT_REGISTRATION_OR_ACTIVATION' AND NOT EXISTS (SELECT 1
        FROM resident r
        WHERE r.account_id=t.account_id)) OR (t.type='AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION' AND NOT EXISTS (SELECT 1
        FROM volunteer v
        WHERE v.account_id=t.account_id))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Registration acceptance must match the account role';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM resident r
        WHERE NOT EXISTS (SELECT 1
        FROM terms_acceptance t
        WHERE t.account_id=r.account_id AND t.type='AT_RESIDENT_REGISTRATION_OR_ACTIVATION')
        UNION ALL SELECT 1
        FROM volunteer v
        WHERE NOT EXISTS (SELECT 1
        FROM terms_acceptance t
        WHERE t.account_id=v.account_id AND t.type='AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION')
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Each role needs its registration acceptance';
    END IF;
    IF EXISTS (
        SELECT p.pickup_request_id
        FROM pickup_request p
        LEFT JOIN pickup_window w ON w.pickup_request_id=p.pickup_request_id AND w.is_active=TRUE
        GROUP BY p.pickup_request_id
        HAVING COUNT(w.pickup_window_id) NOT BETWEEN 1 AND 3
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Each request needs one to three active windows';
    END IF;
    IF EXISTS (
        SELECT pickup_request_id,pickup_date,start_hour
        FROM pickup_window
        WHERE is_active=TRUE
        GROUP BY pickup_request_id,pickup_date,start_hour
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Active windows must be distinct';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pickup_window w
        JOIN pickup_request p ON p.pickup_request_id=w.pickup_request_id
        WHERE ((w.pickup_date + w.start_hour * INTERVAL '1 hour') AT TIME ZONE 'America/Edmonton') <= p.created_at OR ((w.pickup_date + (w.start_hour+1) * INTERVAL '1 hour') AT TIME ZONE 'America/Edmonton') > p.created_at + INTERVAL '30 days'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Window dates must fit the original request period';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pickup_request p
        WHERE NOT EXISTS (SELECT 1
        FROM status_change s
        WHERE s.pickup_request_id=p.pickup_request_id AND s.changed_at=p.created_at AND s.status='Open') OR EXISTS (SELECT 1
        FROM status_change s
        WHERE s.pickup_request_id=p.pickup_request_id AND s.changed_at<p.created_at)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Request history must start Open at creation';
    END IF;
    IF EXISTS (
        SELECT w.pickup_request_id
        FROM assignment a
        JOIN pickup_window w ON w.pickup_window_id=a.pickup_window_id
        WHERE a.ended_at IS NULL
        GROUP BY w.pickup_request_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'At most one unfinished assignment per request';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM assignment a
        JOIN pickup_window w ON w.pickup_window_id=a.pickup_window_id
        JOIN pickup_request p ON p.pickup_request_id=w.pickup_request_id
        WHERE a.accepted_at < p.created_at
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Assignments cannot predate their request';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM delivery d
        JOIN assignment a ON a.assignment_id=d.assignment_id
        JOIN pickup_window w ON w.pickup_window_id=a.pickup_window_id
        JOIN pickup_request p ON p.pickup_request_id=w.pickup_request_id
        WHERE a.end_reason IS DISTINCT
        FROM 'Delivered' OR a.collected_at IS NULL OR NOT EXISTS (SELECT 1
        FROM facility_accepts f
        WHERE f.facility_id=d.facility_id AND f.category_id=p.category_id)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Delivery must match the completed assignment and accepted category';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM assignment a
        WHERE a.end_reason='Delivered' AND NOT EXISTS (SELECT 1
        FROM delivery d
        WHERE d.assignment_id=a.assignment_id)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Delivered assignments need a delivery';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pickup_request p
        JOIN delivery d ON d.file_id=p.file_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Item photos and delivery evidence cannot share a file';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM ecopoints_award a
        LEFT JOIN resident_award r ON r.ecopoints_award_id=a.ecopoints_award_id
        LEFT JOIN volunteer_award v ON v.ecopoints_award_id=a.ecopoints_award_id
        WHERE (CASE WHEN r.ecopoints_award_id IS NULL THEN 0 ELSE 1 END + CASE WHEN v.ecopoints_award_id IS NULL THEN 0 ELSE 1 END) <> 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Each award needs exactly one role';
    END IF;
    IF EXISTS (
        SELECT a.assignment_id
        FROM ecopoints_award a
        JOIN resident_award r ON r.ecopoints_award_id=a.ecopoints_award_id
        GROUP BY a.assignment_id
        HAVING COUNT(*)>1
        UNION ALL SELECT a.assignment_id
        FROM ecopoints_award a
        JOIN volunteer_award v ON v.ecopoints_award_id=a.ecopoints_award_id
        GROUP BY a.assignment_id
        HAVING COUNT(*)>1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'At most one award per assignment and role';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM notification n
        LEFT JOIN request_notification r ON r.notification_id=n.notification_id
        LEFT JOIN award_notification a ON a.notification_id=n.notification_id
        WHERE (CASE WHEN r.notification_id IS NULL THEN 0 ELSE 1 END + CASE WHEN a.notification_id IS NULL THEN 0 ELSE 1 END) <> 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Each notification needs exactly one source';
    END IF;
    IF EXISTS (
        SELECT 1 FROM notification n
        LEFT JOIN request_notification r ON r.notification_id=n.notification_id
        LEFT JOIN award_notification an ON an.notification_id=n.notification_id
        LEFT JOIN ecopoints_award e ON e.ecopoints_award_id=an.ecopoints_award_id
        LEFT JOIN assignment a ON a.assignment_id=e.assignment_id
        LEFT JOIN resident_award ra ON ra.ecopoints_award_id=e.ecopoints_award_id
        LEFT JOIN volunteer_award va ON va.ecopoints_award_id=e.ecopoints_award_id
        WHERE (r.notification_id IS NOT NULL AND n.type LIKE 'ECOPOINTS%')
           OR (an.notification_id IS NOT NULL AND NOT COALESCE((
               (n.type='ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT' AND ra.ecopoints_award_id IS NOT NULL AND a.end_reason='Delivered')
            OR (n.type='ECOPOINTS_AWARDED_ON_DELIVERY_VOLUNTEER' AND va.ecopoints_award_id IS NOT NULL AND a.end_reason='Delivered')
            OR (n.type='ECOPOINTS_AWARDED_ON_ASSIGNMENT_CANCELLATION_VOLUNTEER' AND va.ecopoints_award_id IS NOT NULL AND a.end_reason='Resident_Cancelled')
           ),FALSE))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Notification type must match its source, award role and ending';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM request_changed_field f
        JOIN request_update_event u ON u.pickup_request_id=f.pickup_request_id AND u.request_seq=f.request_seq
        WHERE u.reason <> 'edited'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Changed fields belong only to edited updates';
    END IF;
    IF EXISTS (
        SELECT 1 FROM request_event e
        JOIN pickup_request p ON p.pickup_request_id=e.pickup_request_id
        WHERE e.request_seq > p.request_seq
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Consumed event cannot exceed the published request sequence';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pickup_request n
        JOIN pickup_request p ON p.pickup_request_id=n.rescheduled_from_request_id
        JOIN terms_acceptance nt ON nt.terms_acceptance_id=n.terms_acceptance_id
        JOIN terms_acceptance pt ON pt.terms_acceptance_id=p.terms_acceptance_id
        WHERE nt.account_id <> pt.account_id OR n.created_at <= p.created_at
           OR n.terms_acceptance_id=p.terms_acceptance_id
           OR (SELECT status FROM status_change WHERE pickup_request_id=p.pickup_request_id
               ORDER BY changed_at DESC LIMIT 1) IS DISTINCT FROM 'Missed'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Rescheduled request must reference the same resident''s Missed request';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM account a
        WHERE a.deactivated_at IS NOT NULL AND (EXISTS (SELECT 1
        FROM pickup_request p
        JOIN terms_acceptance t ON t.terms_acceptance_id=p.terms_acceptance_id
        WHERE t.account_id=a.account_id AND (SELECT s.status
        FROM status_change s
        WHERE s.pickup_request_id=p.pickup_request_id
        ORDER BY s.changed_at DESC LIMIT 1) IN ('Open','Assigned','Collected')) OR EXISTS (SELECT 1
        FROM assignment x
        JOIN terms_acceptance t ON t.terms_acceptance_id=x.terms_acceptance_id
        WHERE t.account_id=a.account_id AND x.ended_at IS NULL))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Deactivated accounts cannot retain active work';
    END IF;
    IF EXISTS (
        SELECT 1 FROM request_notification r
        JOIN notification n ON n.notification_id=r.notification_id
        WHERE n.type='REQUEST_UPDATED_RESIDENT' AND NOT EXISTS (
            SELECT 1 FROM request_update_event u
            WHERE u.pickup_request_id=r.pickup_request_id AND u.request_seq=r.request_seq
        )
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Update notification requires its update details';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pickup_request p
        CROSS JOIN LATERAL (
            SELECT status FROM status_change WHERE pickup_request_id=p.pickup_request_id
            ORDER BY changed_at DESC LIMIT 1
        ) current_state
        WHERE (current_state.status IN ('Assigned','Collected') AND NOT EXISTS (
            SELECT 1 FROM assignment a JOIN pickup_window w ON w.pickup_window_id=a.pickup_window_id
            WHERE w.pickup_request_id=p.pickup_request_id AND a.ended_at IS NULL
              AND ((current_state.status='Assigned' AND a.collected_at IS NULL)
                OR (current_state.status='Collected' AND a.collected_at IS NOT NULL))
        )) OR (current_state.status NOT IN ('Assigned','Collected') AND EXISTS (
            SELECT 1 FROM assignment a JOIN pickup_window w ON w.pickup_window_id=a.pickup_window_id
            WHERE w.pickup_request_id=p.pickup_request_id AND a.ended_at IS NULL
        )) OR (current_state.status='Delivered' AND NOT EXISTS (
            SELECT 1 FROM delivery d JOIN assignment a ON a.assignment_id=d.assignment_id
            JOIN pickup_window w ON w.pickup_window_id=a.pickup_window_id
            WHERE w.pickup_request_id=p.pickup_request_id
        ))
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Request state must match its assignment and delivery';
    END IF;
END;
$$;

-- Lock the parent request before checking or adding an assignment.
CREATE PROCEDURE accept_request(
    p_assignment_id UUID, p_window_id UUID, p_acceptance_id UUID
)
LANGUAGE plpgsql
SET search_path TO ecocollect608, pg_temp
AS $$
DECLARE
    request_id UUID;
    actor_id VARCHAR(50);
    request_state VARCHAR(30);
BEGIN
    SELECT pickup_request_id INTO STRICT request_id
    FROM pickup_window WHERE pickup_window_id=p_window_id;
    PERFORM 1 FROM pickup_request WHERE pickup_request_id=request_id FOR UPDATE;
    SELECT account_id INTO STRICT actor_id FROM terms_acceptance
    WHERE terms_acceptance_id=p_acceptance_id AND type='AT_VOLUNTEER_ACCEPTANCE';
    PERFORM 1 FROM account WHERE account_id=actor_id AND deactivated_at IS NULL FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM volunteer WHERE account_id=actor_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='An active volunteer is required';
    END IF;
    SELECT status INTO request_state FROM status_change
    WHERE pickup_request_id=request_id ORDER BY changed_at DESC LIMIT 1;
    IF request_state IS DISTINCT FROM 'Open' OR EXISTS (
        SELECT 1 FROM assignment a JOIN pickup_window w ON w.pickup_window_id=a.pickup_window_id
        WHERE w.pickup_request_id=request_id AND a.ended_at IS NULL
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Request is not available for acceptance';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pickup_window w JOIN pickup_request p ON p.pickup_request_id=w.pickup_request_id
        WHERE w.pickup_window_id=p_window_id AND w.is_active=TRUE
          AND ((w.pickup_date + w.start_hour * INTERVAL '1 hour') AT TIME ZONE 'America/Edmonton') > CURRENT_TIMESTAMP
          AND ((w.pickup_date + (w.start_hour+1) * INTERVAL '1 hour') AT TIME ZONE 'America/Edmonton') <= p.created_at + INTERVAL '30 days'
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Selected window is not available';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM terms_acceptance t JOIN terms_document d ON d.terms_document_id=t.terms_document_id
        WHERE t.terms_acceptance_id=p_acceptance_id
          AND t.accepted_at <= CURRENT_TIMESTAMP AND d.published_at <= t.accepted_at
          AND t.accepted_at > (SELECT MAX(changed_at) FROM status_change WHERE pickup_request_id=request_id)
          AND NOT EXISTS (SELECT 1 FROM terms_document later
                          WHERE later.published_at>d.published_at AND later.published_at<=CURRENT_TIMESTAMP)
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Accept the current terms for this assignment';
    END IF;
    INSERT INTO assignment(assignment_id,pickup_window_id,terms_acceptance_id,accepted_at)
    SELECT p_assignment_id,p_window_id,p_acceptance_id,accepted_at
    FROM terms_acceptance WHERE terms_acceptance_id=p_acceptance_id;
    INSERT INTO status_change(pickup_request_id,changed_at,status,reason)
    SELECT request_id,accepted_at,'Assigned',NULL FROM terms_acceptance
    WHERE terms_acceptance_id=p_acceptance_id;
    UPDATE pickup_request SET request_seq=request_seq+1 WHERE pickup_request_id=request_id;
END;
$$;

-- Serialize preferred-code changes on the volunteer row.
CREATE PROCEDURE add_preferred_code(p_account_id VARCHAR(50), p_postal_code CHAR(6))
LANGUAGE plpgsql
SET search_path TO ecocollect608, pg_temp
AS $$
BEGIN
    PERFORM 1 FROM volunteer WHERE account_id=p_account_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='Volunteer does not exist';
    END IF;
    IF (SELECT COUNT(*) FROM volunteer_preferred_postal_code WHERE account_id=p_account_id) >= 3 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='At most three preferred postal codes';
    END IF;
    INSERT INTO volunteer_preferred_postal_code(account_id,postal_code) VALUES(p_account_id,p_postal_code);
END;
$$;

-- Lock a photo before assigning it to an item request.
CREATE PROCEDURE attach_item_photo(p_request_id UUID,p_file_id TEXT)
LANGUAGE plpgsql
SET search_path TO ecocollect608, pg_temp
AS $$
BEGIN
    PERFORM 1 FROM pickup_request WHERE pickup_request_id=p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='Request does not exist';
    END IF;
    IF (SELECT status FROM status_change WHERE pickup_request_id=p_request_id ORDER BY changed_at DESC LIMIT 1) IS DISTINCT FROM 'Open' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Only an Open request can be edited';
    END IF;
    PERFORM 1 FROM photo WHERE file_id=p_file_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='Photo does not exist';
    END IF;
    IF EXISTS (SELECT 1 FROM delivery WHERE file_id=p_file_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Delivery evidence cannot be an item photo';
    END IF;
    UPDATE pickup_request SET file_id=p_file_id WHERE pickup_request_id=p_request_id;
END;
$$;
-- Call only when a request is created, before later edits are allowed.
CREATE PROCEDURE check_new_request(p_request_id UUID)
LANGUAGE plpgsql
SET search_path TO ecocollect608, pg_temp
AS $$
BEGIN
    PERFORM 1 FROM pickup_request WHERE pickup_request_id=p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='Request does not exist';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pickup_request p
        JOIN item_category c ON c.category_id=p.category_id
        JOIN terms_acceptance t ON t.terms_acceptance_id=p.terms_acceptance_id
        JOIN resident r ON r.account_id=t.account_id
        WHERE p.pickup_request_id=p_request_id
          AND (p.estimated_weight_kg<>p.quantity*c.standard_weight_kg
            OR p.pickup_street<>r.street OR p.pickup_postal_code<>r.postal_code)
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='New request needs the current weight and profile address';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pickup_request n
        JOIN pickup_request p ON p.pickup_request_id=n.rescheduled_from_request_id
        WHERE n.pickup_request_id=p_request_id
          AND (n.category_id<>p.category_id OR n.quantity<>p.quantity
            OR n.notes IS DISTINCT FROM p.notes OR n.file_id IS DISTINCT FROM p.file_id)
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='New replacement must copy the original items, notes and photo';
    END IF;
    CALL check_business_rules();
END;
$$;
CREATE PROCEDURE remove_facility_category(p_facility_id UUID, p_category_id TEXT)
LANGUAGE plpgsql
SET search_path TO ecocollect608, pg_temp
AS $$
BEGIN
    PERFORM 1 FROM recycling_facility WHERE facility_id=p_facility_id FOR UPDATE;
    PERFORM 1 FROM item_category WHERE category_id=p_category_id FOR UPDATE;
    DELETE FROM facility_accepts WHERE facility_id=p_facility_id AND category_id=p_category_id;
    CALL check_business_rules();
END;
$$;

COMMIT;
