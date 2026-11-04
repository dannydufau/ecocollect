SET
    search_path TO ecocollect608;

-- 1. Accounts that have both roles (they are in resident and in volunteer).
SELECT
    a.account_id,
    a.first_name,
    a.last_name,
    r.postal_code AS home_postal_code
FROM
    account a
    JOIN resident r ON r.account_id = a.account_id
    JOIN volunteer v ON v.account_id = a.account_id
ORDER BY
    a.account_id;

-- 2. Every volunteer with their preferred postal codes in slot order.
-- The left join keeps volunteers who saved none (volunteer4 shows an empty list).
SELECT
    v.account_id,
    COUNT(p.postal_code) AS codes_saved,
    COALESCE(
        string_agg(p.postal_code, ', ' ORDER BY p.preference_slot),
        ''
    ) AS preferred_postal_codes
FROM
    volunteer v
    LEFT JOIN volunteer_preferred_postal_code p ON p.account_id = v.account_id
GROUP BY
    v.account_id
ORDER BY
    v.account_id;

-- 3. Which volunteers a resident's request would reach: the volunteer saved the resident's
-- postal code. A person is never matched to their own request, so the same account is left out.
SELECT
    r.account_id AS resident,
    r.postal_code,
    p.account_id AS matching_volunteer
FROM
    resident r
    JOIN volunteer_preferred_postal_code p ON p.postal_code = r.postal_code
WHERE
    p.account_id <> r.account_id
ORDER BY
    r.account_id,
    p.account_id;
