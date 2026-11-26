-- Notification Service login (contract 2.1): writes its own schema, reads all schemas.
-- Safe to rerun. backend/scripts/notification/load-db.sh sets its password afterwards.

-- Create the role, without a login until load-db.sh sets its password.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecocollect_notification') THEN
        CREATE ROLE ecocollect_notification NOLOGIN;
    END IF;
END $$;

-- Read every table (it checks users.account for deactivated accounts).
GRANT pg_read_all_data TO ecocollect_notification;
GRANT USAGE ON SCHEMA notifications, users TO ecocollect_notification;

-- Write every table in "notifications": the notifications, their request events and push subscriptions.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA notifications TO ecocollect_notification;
