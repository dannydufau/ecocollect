# Set up and launch EcoCollect (from #296, Request Service)

> **Origin:** added by PR #296 (Request Service, issue #102), when the Request Service moved into the one shared database. **Temporary:** at integration, merge it into the root README's "Run everything with Docker" and delete this file.

How to set up and run the full app with Docker Compose, now that every service uses one database, `ecocollect` (contract 2.1). Until it's merged, it replaces steps 3 and 4 of the root README's "Run everything with Docker".

"Production" here means the normal Compose stack on one machine. There is no cloud deployment, and the separate demo stack (contract 17.1) isn't built yet.

## Set up (once per machine)

### 1. Fill in `.env`

```bash
cp .env.example .env
```

Set your own values. Use letters, numbers, `_` and `-` only: the passwords end up inside URLs.

| Variable | Notes |
|---|---|
| `POSTGRES_PASSWORD` | Put the same password in `DATABASE_URL`. |
| `RABBITMQ_PASSWORD` | |
| `USER_DB_PASSWORD` | Put the same password in `USER_DATABASE_URL`. |
| `REQUEST_DB_PASSWORD` | Put the same password in `REQUEST_DATABASE_URL`. That URL ends in `/ecocollect`. |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase console → Project settings. |
| `IMAGEKIT_*` | ImageKit dashboard → Developer options → API keys. |

### 2. Save the Firebase Admin key

Save it as `secrets/firebase-admin.json` (see [secrets/README.md](../secrets/README.md)). Never commit it.

### 3. Start Postgres

```bash
docker compose up -d postgres
```

On a new volume, Postgres creates every table in `db/init`: the User tables (`users`), the Request tables (`requests`), and their reference data (terms, categories, facilities). On an existing volume it does nothing; steps 4 and 5 add what's missing.

### 4. Turn on the User Service login

This needs `psql` 15 or newer on your machine. The loader reads the admin `DATABASE_URL` and `USER_DB_PASSWORD`, so export them from `.env` first:

```bash
set -a; . ./.env; set +a
bash backend/scripts/user/load-db.sh
```

### 5. Load the Request Service's functions and login

This runs `psql` inside the Postgres container, so you don't need it on your machine. It reads `REQUEST_DB_PASSWORD` from `.env` itself and never drops anything:

```bash
backend/scripts/request/load-db.sh
```

## Launch

```bash
docker compose up -d --build
docker compose ps        # wait until every service shows "healthy"
```

Open <https://localhost>. Caddy makes its own certificate, so the browser warns you the first time. Accept it once, or trust Caddy's root certificate as described in the root README.

## Day to day

| When | Run |
|---|---|
| Stop | `docker compose down` (keeps your data) |
| Start again | `docker compose up -d` |
| After a `git pull` | Steps 4 and 5 again (both are safe to repeat), then `docker compose up -d --build` |
| Start over with an empty database | `docker compose down -v`, then steps 3 to 5 and Launch. **This deletes all data.** |

## Moving from the old setup

Before the shared database, the Request Service used its own database, `ecocollect_request`. If you set it up that way:

1. Change `REQUEST_DATABASE_URL` in `.env` to end in `/ecocollect`.
2. Run step 5. It adds the Request tables and functions to `ecocollect`, without `down -v`.
3. Optional: drop the unused database:
   `docker compose exec postgres psql -U ecocollect -d postgres -c "DROP DATABASE ecocollect_request"`

## Tests (Request Service)

```bash
backend/scripts/request/load-db.sh --test    # rebuilds ecocollect_request_test from scratch
cd backend
REQUEST_TEST_DATABASE_URL=postgres://ecocollect:<POSTGRES_PASSWORD>@localhost:5432/ecocollect_request_test \
  npm run test:request
```

The test database is separate from `ecocollect` and gets the test accounts and requests in `backend/test/request/seed.sql`. Rebuild it before each run: some tests change seed requests.
