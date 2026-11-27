-- Validates the live facility & category catalogue before a catalogue upgrade commits.
-- Raises an exception (rolling back the surrounding transaction) if any invariant fails:
--   1. Every offered category in item_category has at least one enabled facility with an enabled mapping.
--   2. Every enabled facility has at least one enabled category mapping.
--   3. Every in-progress request (Open, Assigned, Collected) retains at least one eligible destination.

CREATE OR REPLACE FUNCTION requests.req_validate_catalogue()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path TO requests, users, pg_temp
AS $$
DECLARE
    v_missing_categories TEXT;
    v_empty_facilities   TEXT;
    v_stranded_requests  INTEGER;
BEGIN
    SELECT string_agg(c.category_id, ', ' ORDER BY c.category_id)
      INTO v_missing_categories
    FROM item_category c
    WHERE NOT EXISTS (
        SELECT 1
        FROM facility_accepts fa
        JOIN recycling_facility f ON f.facility_id = fa.facility_id
        WHERE fa.category_id = c.category_id
          AND fa.is_enabled
          AND f.is_enabled
    );
    IF v_missing_categories IS NOT NULL THEN
        RAISE EXCEPTION 'catalogue validation failed: categories without an enabled facility: %', v_missing_categories;
    END IF;

    SELECT string_agg(f.name || ' (' || f.facility_id || ')', ', ' ORDER BY f.name)
      INTO v_empty_facilities
    FROM recycling_facility f
    WHERE f.is_enabled
      AND NOT EXISTS (
          SELECT 1
          FROM facility_accepts fa
          WHERE fa.facility_id = f.facility_id
            AND fa.is_enabled
      );
    IF v_empty_facilities IS NOT NULL THEN
        RAISE EXCEPTION 'catalogue validation failed: enabled facilities with no enabled categories: %', v_empty_facilities;
    END IF;

    SELECT count(*)
      INTO v_stranded_requests
    FROM pickup_request p
    WHERE requests.req_current_status(p.pickup_request_id) IN ('Open', 'Assigned', 'Collected')
      AND NOT EXISTS (
          SELECT 1
          FROM facility_accepts fa
          JOIN recycling_facility f ON f.facility_id = fa.facility_id
          WHERE fa.category_id = p.category_id
            AND fa.is_enabled
            AND f.is_enabled
      );
    IF v_stranded_requests > 0 THEN
        RAISE EXCEPTION 'catalogue validation failed: % in-progress request(s) have no eligible destination', v_stranded_requests;
    END IF;
END;
$$;
