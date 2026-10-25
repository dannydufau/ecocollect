# Database

Postgres 16 in Docker Compose. SQL files in `db/init/` are applied automatically, in filename order, the first time the database volume is created.

The schema is defined in ticket #12; `db/init/001_schema.sql` is the file it goes in.

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