-- Seed: push_subscription (ticket #76).
-- Run after Satyam's seed (db/608/satyam-bhanot/seed.sql), which creates the accounts used here.
-- Repeatable: ON CONFLICT DO NOTHING.
SET search_path TO ecocollect608;
BEGIN;

-- PUSH_SUBSCRIPTION: fake demo devices (the .test domain is never real).
INSERT INTO push_subscription (endpoint, account_id, p256dh, auth, user_agent) VALUES
  ('https://push.example.test/vol1-phone',  'volunteer1', 'fake-key-1', 'fake-auth-1', 'Chrome on Android'),
  ('https://push.example.test/vol1-laptop', 'volunteer1', 'fake-key-2', 'fake-auth-2', 'Chrome on Windows'),
  ('https://push.example.test/vol2',        'volunteer2', 'fake-key-3', 'fake-auth-3', 'Firefox on macOS'),
  ('https://push.example.test/both1-phone', 'both1',      'fake-key-4', 'fake-auth-4', 'Chrome on Android')
ON CONFLICT (endpoint) DO NOTHING;

COMMIT;