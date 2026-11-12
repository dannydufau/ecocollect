-- Seed for the cleanup demo. Dates are relative to now(), so it works on any day.
-- Run after tables.sql.
SET search_path TO cleanup_demo;
BEGIN;

INSERT INTO pickup_request (request_id, created_at, pickup_postal_code) VALUES
  ('40000000-0000-4000-8000-000000000001', now() - INTERVAL '31 days', 'T2N1N4'),  -- Open, over 30 days: will expire
  ('40000000-0000-4000-8000-000000000002', now() - INTERVAL '5 days',  'T2E5A8');  -- Open, recent: stays Open

INSERT INTO status_change (request_id, changed_at, status) VALUES
  ('40000000-0000-4000-8000-000000000001', now() - INTERVAL '31 days', 'Open'),
  ('40000000-0000-4000-8000-000000000002', now() - INTERVAL '5 days',  'Open');

COMMIT;