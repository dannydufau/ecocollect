# Physical database implementation

The application implements the 25 course relations across four PostgreSQL schemas. The definitions use the [logical model](<../2. Logical model/README.md>) for columns, keys, and constraints.

| Schema | SQL |
| --- | --- |
| `users` | [Accounts, roles, postal preferences, and terms](../../../../db/init/005_user_tables.sql) |
| `requests` | [Categories, facilities, pickup requests, assignments, and deliveries](../../../../db/init/010_request_tables.sql) and [Request functions](../../../../db/request/) |
| `rewards` | [Awards and award roles](../../../../db/init/012_reward_tables.sql) |
| `notifications` | [Subscriptions, notifications, consumed events, and notification sources](../../../../db/init/040_notification_tables.sql) |

The schema uses primary keys, foreign keys, unique constraints, and check constraints. For example, `facility_accepts` implements the many-to-many relationship between facilities and categories. Its composite primary key prevents duplicate pairs. The application's service SQL and transactions handle rules that involve several rows.

## Set up the test database

Use a fresh database on a separate PostgreSQL server instance. Set `PGHOST`, `PGPORT`, and `PGUSER` for that instance. The setup account needs permission to create databases, schemas, and the roles used by the init scripts. The application targets PostgreSQL 16. The saved query run used PostgreSQL 16.16 and the saved test run used PostgreSQL 18.6.

From the repository root in Bash:

```bash
createdb ecocollect_608_test || exit 1
for file in db/init/{005,010,011,012,031,040}_*.sql db/request/*.sql backend/test/request/seed.sql backend/test/ensf608/scenario.sql; do
  psql -X -v ON_ERROR_STOP=1 -d ecocollect_608_test -f "$file" || exit 1
done
```

This loads the numbered scripts needed for the course database in order. [011_request_seed.sql](../../../../db/init/011_request_seed.sql) adds item categories, recycling facilities, and their eligibility links. [031_user_seed.sql](../../../../db/init/031_user_seed.sql) adds the current terms document. The [Request seed](../../../../backend/test/request/seed.sql) adds sample accounts, requests, windows, assignments, and deliveries. It adjusts the sample terms dates to match the request timeline. The [ENSF 608 scenario](../../../../backend/test/ensf608/scenario.sql) adds awards, subscriptions, consumed events, and notifications for those fixtures.

Use the same database for [Section 5 queries](<../5. Database operations and queries/README.md>) and [Section 6 tests](../../../../backend/test/ensf608/README.md). Run both soon after seeding because the sample dates are relative to load time.
