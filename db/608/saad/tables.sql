SET
    search_path TO ecocollect608;

-- Needs: volunteer, pickup_request, pickup_window, terms_acceptance, recycling_facility.

CREATE TYPE request_status AS ENUM ('Open', 'Assigned', 'Collected', 'Delivered', 'Cancelled', 'Expired');

CREATE TYPE assignment_end_reason AS ENUM ('Delivered', 'Volunteer_Cancelled', 'Resident_Cancelled', 'Missed_Pickup');

-- ---------------------------------------------------------------
-- STATUS_CHANGE (weak entity of PICKUP_REQUEST)
-- The current status of a request is its latest row. Status itself is not stored on PICKUP_REQUEST.
-- ---------------------------------------------------------------
CREATE TABLE
    status_change (
        pickup_request_id UUID NOT NULL REFERENCES pickup_request (pickup_request_id) ON DELETE CASCADE,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        status request_status NOT NULL,
        reason VARCHAR(255),
        PRIMARY KEY (pickup_request_id, changed_at)
    );

-- Current status of every request (derived, not stored).
CREATE VIEW pickup_request_current_status AS
SELECT DISTINCT ON (pickup_request_id)
    pickup_request_id,
    status,
    changed_at
FROM status_change
ORDER BY pickup_request_id, changed_at DESC;

-- A window used by an assignment must belong to the same request.
ALTER TABLE pickup_window
    ADD CONSTRAINT pickup_window_id_request_uq UNIQUE (pickup_window_id, pickup_request_id);

-- ---------------------------------------------------------------
-- ASSIGNMENT: a volunteer accepts a request for one of its pickup windows.
-- ---------------------------------------------------------------
CREATE TABLE
    assignment (
        assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pickup_request_id UUID NOT NULL REFERENCES pickup_request (pickup_request_id),
        account_id VARCHAR(50) NOT NULL REFERENCES volunteer (account_id) ON DELETE RESTRICT,
        pickup_window_id UUID NOT NULL,
        terms_acceptance_id UUID NOT NULL UNIQUE REFERENCES terms_acceptance (terms_acceptance_id),
        accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        collected_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        end_reason assignment_end_reason,
        FOREIGN KEY (pickup_window_id, pickup_request_id)
            REFERENCES pickup_window (pickup_window_id, pickup_request_id),
        -- End_Reason is empty exactly when Ended_At is empty.
        CONSTRAINT assignment_end_consistent CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
        -- A delivered assignment must have been collected.
        CONSTRAINT assignment_delivered_was_collected CHECK (
            end_reason IS DISTINCT FROM 'Delivered' OR collected_at IS NOT NULL
        ),
        -- Cancellations and missed pickups happen only before collection.
        CONSTRAINT assignment_cancel_before_collection CHECK (
            end_reason IS NULL OR end_reason = 'Delivered' OR collected_at IS NULL
        )
    );

-- At most one active assignment (Ended_At empty) per request.
CREATE UNIQUE INDEX assignment_one_active_per_request_uq
    ON assignment (pickup_request_id) WHERE ended_at IS NULL;

-- ---------------------------------------------------------------
-- DELIVERY: the drop-off of a collected request at a facility (at most one per assignment).
-- Delivered_At is not stored: it is the assignment's Ended_At when End_Reason = 'Delivered'.
-- ---------------------------------------------------------------
CREATE TABLE
    delivery (
        delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id UUID NOT NULL UNIQUE REFERENCES assignment (assignment_id),
        facility_id UUID NOT NULL REFERENCES recycling_facility (facility_id),
        evidence_photo VARCHAR(2048)
    );
