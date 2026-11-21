-- Q3 upload ticket (contract 5.2 Q3, 6.1): before signing an upload, check that
-- the caller may upload a photo for this purpose.
-- Needs 022 (helpers), 033 (req_check_record_delivery).
-- Created in "requests"; course tables are named without a schema (see 020).

-- req_check_upload: read-only, one call. Called by TypeScript as
--   SELECT requests.req_check_upload($1, $2, $3) AS result_code
-- Roles are read from the model tables, not from X-User-Roles, so a deactivated
-- account gets no ticket.
--   p_purpose     'item_photo' or 'delivery_evidence'
--   p_request_id  the request the evidence is for; NULL for 'item_photo' (an
--                 item photo is uploaded before Q4 creates its request)
--
-- Returns:
--   'request_unavailable'  evidence: no such request (404)
--   'forbidden'            item photo: not an active resident (403)
--                          evidence: the caller may not record this delivery
--                          now: not the assigned volunteer, not Collected yet,
--                          or delivered already (403)
--   'ok'                   the caller may upload the photo
CREATE OR REPLACE FUNCTION requests.req_check_upload(
    p_actor_id   VARCHAR(50),
    p_purpose    TEXT,
    p_request_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path TO requests, ecocollect608, pg_temp
AS $$
DECLARE
    k_code_ok          CONSTANT TEXT := 'ok';
    k_code_unavailable CONSTANT TEXT := 'request_unavailable';
    k_code_forbidden   CONSTANT TEXT := 'forbidden';
    k_item_photo       CONSTANT TEXT := 'item_photo';
    k_evidence         CONSTANT TEXT := 'delivery_evidence';
    v_is_resident    BOOLEAN;  -- an active resident account
    v_delivery_check TEXT;     -- what Q15 would answer for this caller now
BEGIN
    IF p_actor_id IS NULL OR p_purpose IS NULL THEN
        RAISE EXCEPTION 'req_check_upload: missing argument';
    END IF;

    -- Item photo: only an active resident may upload one.
    IF p_purpose = k_item_photo THEN
        IF p_request_id IS NOT NULL THEN
            RAISE EXCEPTION 'req_check_upload: an item photo takes no request id';
        END IF;

        -- Look up the caller's resident row with an active account.
        v_is_resident := EXISTS (
            SELECT 1 FROM resident r
            JOIN account a ON a.account_id = r.account_id
            WHERE r.account_id = p_actor_id
              AND a.deactivated_at IS NULL);

        IF NOT v_is_resident THEN
            RETURN k_code_forbidden;
        END IF;
        RETURN k_code_ok;
    END IF;

    IF p_purpose <> k_evidence THEN
        RAISE EXCEPTION 'req_check_upload: unknown purpose %', p_purpose;
    END IF;

    -- Delivery evidence: only the volunteer who may record this delivery now.
    IF p_request_id IS NULL THEN
        RAISE EXCEPTION 'req_check_upload: evidence needs a request id';
    END IF;

    -- Return 404 when the request doesn't exist.
    IF requests.req_current_status(p_request_id) IS NULL THEN
        RETURN k_code_unavailable;
    END IF;

    -- Ask Q15's own state check: may this caller record the delivery now?
    v_delivery_check := requests.req_check_record_delivery(p_request_id, p_actor_id);

    -- Return 403 for any answer other than 'ok'.
    IF v_delivery_check <> k_code_ok THEN
        RETURN k_code_forbidden;
    END IF;

    RETURN k_code_ok;
END;
$$;
