# Database

Postgres 16 in Docker Compose. Schema lives in `db/init/` and is applied automatically the first time the database volume is created.

## Run

```bash
cp .env.example .env        # then change the password
docker compose up -d postgres
docker compose ps           # postgres should show "healthy"
```

## Inspect

```bash
docker compose exec postgres psql -U ecocollect -d ecocollect -c '\dt'
```

## Change the schema

Init scripts run only on an empty volume. After editing a file in `db/init/`, reset the database:

```bash
docker compose down -v      # deletes all data
docker compose up -d postgres
```

Add new scripts as `002_...sql`, `003_...sql`; they run in filename order. (A migration tool can replace this later if the schema needs to change without wiping data.)

## Tables (Oct 28)

| Table | Written by | Purpose |
|---|---|---|
| `profiles` | seed script | Users keyed by Firebase uid: roles, address, postal code, `fsa` (generated from postal code) |
| `categories` | seed script | Category ids (must match the shared `CategoryId` list) and standard weights |
| `pickup_request` | request service | One request per category; stores the computed estimated weight |
| `pickup_window` | request service | 1–3 one-hour windows per request, distinct dates, Calgary local time |
| `outbox` | request service | `RequestCreated` events; the relay sets `published_at` after RabbitMQ confirms |

Postal codes are stored normalized (`T2P1J9`: uppercase, no space). The application normalizes input before inserting.
