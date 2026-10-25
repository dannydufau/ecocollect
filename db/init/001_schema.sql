-- EcoCollect database schema.
--
-- Placeholder: the schema itself is defined in ticket #12.
--
-- How this file is used:
--   Postgres runs every *.sql file in db/init/ in filename order, once,
--   when the database volume is first created (see docker-compose.yml).
--   To re-run after editing:  docker compose down -v && docker compose up -d
--
-- Conventions for #12:
--   - Wrap statements in BEGIN; ... COMMIT; so a failure leaves no partial schema.
--   - Store timestamps as TIMESTAMPTZ (UTC).
--   - Add further changes as 002_*.sql, 003_*.sql, ...

BEGIN;

-- Tables go here (ticket #12).

COMMIT;