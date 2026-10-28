# Database

Postgres 16 in Docker Compose. SQL files in `db/init/` are applied automatically, in filename order, the first time the database volume is created.

The October 28 schema is in `db/init/001_schema.sql` (ticket #12). Future-only tables were moved to `db/future/002_future_schema.sql` and are **not** automatically executed; the team should decide when to apply them later.

## Run

```bash
cp .env.example .env        # then change the password
docker compose up -d postgres
docker compose ps           # postgres should show "healthy"
```

## Inspect

```bash
docker compose exec postgres psql -U ecocollect -d ecocollect
\dt                         -- list tables
\q                          -- quit
```

## Change the schema

Init scripts run only on an empty volume. After editing a file in `db/init/`, reset the database:

```bash
docker compose down -v      # deletes all data
docker compose up -d postgres
```

Add new scripts as `002_...sql`, `003_...sql`; they run in filename order. (A migration tool can replace this later if the schema needs to change without wiping data.)

If a script fails, the error is in `docker compose logs postgres`.

## Running scripts against the database (e.g. the seed)

Scripts run on your machine need `DATABASE_URL` set, using the password from your `.env`:

```bash
export DATABASE_URL=postgres://ecocollect:<your POSTGRES_PASSWORD>@localhost:5432/ecocollect
```

Replace `<your POSTGRES_PASSWORD>` with the value in your `.env`. If you changed `POSTGRES_PORT`, use that port instead of `5432`.

## Tables for Oct 28

| Table | Written by | Purpose |
|---|---|---|
| `profiles` | seed script | Users keyed by Firebase uid: roles, address, postal code, `fsa` (generated from postal code) |
| `volunteer_preferred_postal_codes` | seed script | Up to 3 postal codes per volunteer, used to match new requests |
| `categories` | seed script | Category ids (must match the shared category list) and standard weights |
| `pickup_request` | request service | One request per category; stores the computed estimated weight and the 30-day expiry |
| `pickup_window` | request service | 1-3 one-hour windows per request, distinct dates, Calgary local time |
| `status_change` | request service | History of each request's status |
| `outbox` | request service | `RequestCreated` events; the publisher sets `published_at` after RabbitMQ confirms |

The notification service has no database for Oct 28, so there is no notifications table.

Postal codes are stored normalized (`T2P1J9`: uppercase, no space). The application normalizes input before inserting.
