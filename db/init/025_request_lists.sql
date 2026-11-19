-- Request Service read functions for the reference lists (schema "ecocollect608"):
-- Q1 categories, Q2 facilities. Called by TypeScript, one call each.
-- Needs PR #198's tables.sql loaded first (load-db.sh does that).
--
-- The output columns of RETURNS TABLE are also PL/pgSQL variables, so every
-- column in the queries is qualified with its table alias to avoid "ambiguous"
-- errors (category_id would mean both the column and the output variable).

-- Q1: every category, by name. standard_weight_kg is NUMERIC: node-postgres
-- returns it as a string, TypeScript converts it to a JSON number.
CREATE OR REPLACE FUNCTION ecocollect608.req_list_categories()
RETURNS TABLE (
    category_id        TEXT,
    name               TEXT,
    waste_type         TEXT,
    standard_weight_kg NUMERIC
)
LANGUAGE plpgsql
STABLE
SET search_path TO ecocollect608, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT c.category_id, c.name::TEXT, c.waste_type::TEXT, c.standard_weight_kg
    FROM item_category c
    ORDER BY c.name, c.category_id;
END;
$$;

-- Q2: the facilities, by name. With p_category_id, only those that accept that
-- category (FR17). The ER diagram's ACCEPTS is 1..N on both sides: every
-- facility accepts at least one category and every category is accepted by at
-- least one facility (not enforced by the tables), so no rows for a given
-- p_category_id means it isn't a category. accepted_category_ids lists
-- everything the facility accepts (not only p_category_id), sorted.
CREATE OR REPLACE FUNCTION ecocollect608.req_list_facilities(p_category_id TEXT DEFAULT NULL)
RETURNS TABLE (
    facility_id           UUID,
    name                  TEXT,
    street                TEXT,
    postal_code           TEXT,
    special_instructions  TEXT,
    accepted_category_ids TEXT[]
)
LANGUAGE plpgsql
STABLE
SET search_path TO ecocollect608, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT f.facility_id, f.name::TEXT, f.street::TEXT, f.postal_code::TEXT,
           f.special_instructions,
           ARRAY(SELECT fa.category_id
                 FROM facility_accepts fa
                 WHERE fa.facility_id = f.facility_id
                 ORDER BY fa.category_id)
    FROM recycling_facility f
    WHERE p_category_id IS NULL
       OR EXISTS (SELECT 1
                  FROM facility_accepts fa
                  WHERE fa.facility_id = f.facility_id
                    AND fa.category_id = p_category_id)
    ORDER BY f.name, f.facility_id;
END;
$$;
