-- FALLBACK DEMO: runs against the app's public schema (Oct 28 tables), not ecocollect608.
-- Seed: push_subscription (ticket #72).
-- Run after the main seed (scripts/seed: npm run seed), which creates the demo accounts.
-- Repeatable: ON CONFLICT DO NOTHING.
BEGIN;

-- PUSH_SUBSCRIPTION: fake demo devices (the .test domain is never real).
INSERT INTO push_subscription (endpoint, account_uid, p256dh, auth, user_agent) VALUES
  ('https://push.example.test/vol1-phone',  'demo-volunteer-1', 'fake-key-1', 'fake-auth-1', 'Chrome on Android'),
  ('https://push.example.test/vol1-laptop', 'demo-volunteer-1', 'fake-key-2', 'fake-auth-2', 'Chrome on Windows'),
  ('https://push.example.test/vol2',        'demo-volunteer-2', 'fake-key-3', 'fake-auth-3', 'Firefox on macOS'),
  ('https://push.example.test/res5-phone',  'demo-resident-5',  'fake-key-4', 'fake-auth-4', 'Chrome on Android')
ON CONFLICT (endpoint) DO NOTHING;

COMMIT;
