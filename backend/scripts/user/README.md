# User database

Run the loader against a database you created for EcoCollect. It needs a PostgreSQL 16 server, Bash and a psql client version 15 or newer on PATH. The loader checks the client version before running any SQL. Use an admin connection for setup; the service uses its own login afterwards.

```bash
export DATABASE_URL='postgres://admin:your_password@localhost:5432/ecocollect_user'
export USER_DB_PASSWORD='your_user_service_password'
bash backend/scripts/user/load-db.sh
```

The command works from any folder. It runs these files in one transaction, stopping on the first error:

1. `db/init/005_user_tables.sql`: the six account, role, postal-code and terms tables. The 005 prefix puts shared User tables before the reserved 010/020 service files when Compose initializes a fresh volume.
2. `db/init/030_user_ops.sql`: the User outbox and database permissions.
3. `db/init/031_user_seed.sql`: one terms document, using the current terms ID from the physical-model seed.
4. `set-password.sql`: enables the `ecocollect_user` login with `USER_DB_PASSWORD`. The password is read from the environment, not committed in SQL.

Running the loader again keeps existing rows and the configured terms content. Rerun it before starting the updated User Service on an existing database to add the outbox insertion-order column and index. For rows already stored with identical timestamps, the original insertion order was never recorded. When Compose initializes a new PostgreSQL volume, it runs the numbered SQL files too. Run this loader afterwards to set the service password.

Set `DATABASE_URL` for a local User Service to `postgres://ecocollect_user:your_user_service_password@localhost:5432/ecocollect_user`. In Compose, set `USER_DATABASE_URL` instead, using `postgres` as the hostname and the database name from `POSTGRES_DB`. The service does not fall back to the database admin connection. URL-encode special characters in a password used in a connection URL.

## Tables and access

The six tables in the `users` schema are part of the ENSF 608 physical model. `terms_acceptance` retains all four action types because Request Service also inserts acceptances; its migration must grant its login INSERT on this shared table.

`ecocollect_user` can read the other services' tables through PostgreSQL's `pg_read_all_data` role, including tables created later. It has row-write permissions on its own tables. Terms acceptances are insert-only: it cannot update or delete them. The setup admin retains ownership so the service cannot bypass this restriction by changing table permissions. Cross-row workflow checks, such as one or both account roles and at most three preferred codes, belong in the endpoint transactions.

The outbox uses the existing relay's columns. Its `aggregate_id` is `VARCHAR(50)` because it identifies an account. `enqueueEvent` uses the caller's transaction client and database transaction time; it neither commits nor publishes. All endpoint writes and their events must use the same transaction. The relay publishes in timestamp and insertion order and marks each row only after a broker confirmation. Set `RABBITMQ_URL` for local startup. Compose supplies it for the User Service. If the broker is unavailable, the relay logs the error and retries.

`db/pool.ts` creates the service pool from `DATABASE_URL`, uses the `users` search path, and closes it during shutdown. It opens no connection until database work is requested.

## Tests

Use a scratch database, never the demo or production database. Load the User SQL with the command above, then run:

```bash
cd backend
TEST_DATABASE_URL='postgres://admin:your_password@localhost:5432/ecocollect_user' node --test test/user/database.test.ts
```

The tests need the setup admin so they can check the restricted service role and clean up their fixtures. They cover a committed account/resident/acceptance/event transaction, rollback, the event envelope, insert-only acceptances and read-only access to a table created later in another schema. Without `TEST_DATABASE_URL`, database cases are skipped.

`npm test` includes these tests. To run the full backend suite with `TEST_DATABASE_URL`, first load `db/init/001_schema.sql` into the scratch database as well; the legacy request tests still use its public tables.

With `TEST_DATABASE_URL` and `RABBITMQ_URL` pointing to scratch services, run `node --test test/integration/user-outbox.integration.test.js` from `backend` to verify delivery through the actual exchange and the database publication marker.
