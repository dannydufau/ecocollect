# Database

Postgres 16 in Docker Compose. Every service uses the one database, `ecocollect` (or your `POSTGRES_DB`). Each service has its own schema and login: it writes its own tables and can read the others. The one exception: the Request Service also adds rows to `users.terms_acceptance`.

For first-time setup, follow the [main README](../README.md#run-everything-with-docker).

## What's in here

SQL files in `db/init/` run automatically, in filename order, the first time the database volume is created:

| File | What it creates |
|---|---|
| `001_schema.sql` | The old October 28 tables in `public`. The services don't read them. `scripts/seed` and one outbox test (`backend/test/outbox.test.js`) still use them |
| `005_user_tables.sql` | User Service tables, schema `users` |
| `010_request_tables.sql`, `011_request_seed.sql` | Request Service tables, schema `requests`, with the item categories and recycling facilities |
| `012_reward_tables.sql` | Reward Service award tables, schema `rewards` |
| `020_cleanup.sql` | Cleanup Service tables, schema `cleanup`, and its role |
| `030_user_ops.sql`, `031_user_seed.sql` | User Service outbox, role and permissions, and the current terms document |
| `040_notification_tables.sql` | Notification Service tables, schema `notifications` |

The rest isn't run automatically. Each service's `load-db.sh` in `backend/scripts/<service>/` adds it and turns on the service's login:

| Service | The script loads |
|---|---|
| Request | `010`, `011`, then everything in `db/request/` (operational tables, functions, role) |
| Reward | `010` to `012`, then everything in `db/reward/` (outbox, processed events, role) |
| Notification | `040`, then everything in `db/notification/` (procedures, role) |
| Cleanup | `020` |
| User | `005`, `030`, `031`. It needs `psql` 15 or newer on your machine |

## Inspect

```bash
docker compose exec postgres psql -U ecocollect -d ecocollect
\dn                         -- list schemas
\dt requests.*              -- list one schema's tables
\q                          -- quit
```

Plain `\dt` shows only the old tables in `public`. If you changed `POSTGRES_USER` or `POSTGRES_DB`, use those names.

## Change the database

`db/init/` runs only on an empty volume. On an existing database, rerun the `load-db.sh` scripts for the services whose files changed. They keep your data, but `CREATE TABLE IF NOT EXISTS` doesn't change a table that already exists. For that, add an `ALTER TABLE` that is safe to rerun, or reset a database you can throw away:

```bash
docker compose down -v      # deletes all Compose data: the database, queued messages and Caddy's certificates
docker compose up -d --wait postgres
```

Then run the setup scripts again. If an init script fails, the error is in `docker compose logs postgres`.

Postal codes are stored uppercase with no space (`T2P1J9`).
