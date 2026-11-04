-- Verify primary keys, foreign keys, and UNIQUE constraints after Step 4 integration.
SELECT
    c.conrelid::regclass AS table_name,
    c.conname AS constraint_name,
    CASE c.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'u' THEN 'UNIQUE'
    END AS constraint_type,
    pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.connamespace = 'krunali_issue71'::regnamespace
  AND c.contype IN ('p', 'f', 'u')
  AND c.conrelid IN (
      'krunali_issue71.item_category'::regclass,
      'krunali_issue71.pickup_request'::regclass,
      'krunali_issue71.pickup_window'::regclass
  )
ORDER BY table_name, constraint_type, constraint_name;

-- Verify the partial unique index for active pickup dates.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'krunali_issue71'
  AND indexname = 'pickup_window_active_date_uq';
