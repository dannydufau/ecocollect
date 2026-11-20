CREATE TABLE IF NOT EXISTS users.outbox (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1 CHECK (event_version >= 1),
    routing_key TEXT NOT NULL,
    aggregate_id VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS user_outbox_pending ON users.outbox (published_at, created_at, event_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ecocollect_user') THEN
        CREATE ROLE ecocollect_user NOLOGIN;
    END IF;
END;
$$;
GRANT pg_read_all_data TO ecocollect_user;
GRANT USAGE ON SCHEMA users TO ecocollect_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON users.account, users.resident, users.volunteer,
    users.volunteer_preferred_postal_code, users.terms_document, users.outbox TO ecocollect_user;
GRANT SELECT, INSERT ON users.terms_acceptance TO ecocollect_user;
