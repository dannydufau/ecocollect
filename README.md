# EcoCollect

## Quick start

You need Docker (Docker Desktop, or Colima) and your own Firebase Admin key saved as `secrets/firebase-admin.json` (see [secrets/README.md](./secrets/README.md)). Then:

```bash
./eco up
```

The first time, it creates `.env` with random passwords, asks for the Firebase web API key (Firebase console, Project settings, General, Your apps), builds and starts everything, and loads the demo users into your local database. That takes about 5 minutes. After that it takes a few seconds, and it never changes an `.env` that already exists.

| Command | What it does |
|---|---|
| `./eco up` | Set everything up and start it. Safe to run again. |
| `./eco down` | Stop everything, keep the data. |
| `./eco reset` | Delete the local data (database and RabbitMQ) and start clean. It keeps your `.env` and your key. |
| `./eco wipe-env` | Delete `.env` too, for a completely fresh start. It asks first. |
| `./eco status` | What is running, plus a quick check through the gateway. |
| `./eco logs [service]` | Follow the logs. |
| `./eco seed-firebase` | Write the demo users into the shared Firebase project. See the warning below. |
| `./eco test [quick] [suite...]` | Run the tests. See below. |

Everyone shares one Firebase project, so the demo users there are shared too. `./eco up` only fills your local database. `./eco seed-firebase` sets the password of all ten demo users in the real project to the `DEMO_PASSWORD` in your `.env`, so use the team's value and ask before running it.

### Tests

`./eco test` runs every suite, each in its own container (Node 22 and Postgres 16), so the results don't depend on what is installed on your machine, and nothing is written to your checkout. It takes about 3 minutes.

| Suite | What it runs |
|---|---|
| `eco` | The tests of the `eco` script itself |
| `contracts` | The contract tests, and the OpenAPI and AsyncAPI lint |
| `backend` | All backend tests, including the database ones, against a throwaway Postgres with our schema |
| `seed` | The seed script tests |
| `frontend` | Lint and a production build |
| `gateway` | The Caddy tests in `infra/caddy/testing` |
| `smoke` | Checks the app that is running: the gateway rules, a request created through the backend, its event reaching RabbitMQ, and a volunteer seeing it. It removes its test request afterwards. It needs `./eco up` first, and in the full run it only joins when the app is up. |

`./eco test quick` skips the lint, the frontend build, the gateway test and the smoke test. You can also name suites, for example `./eco test backend seed`. Each suite's full output is saved in `.eco/logs/`, and a failing suite prints the end of its log.

## Doing it by hand

This is what `./eco up` does for you, in case you want to run the steps yourself.

1. Copy the env file and fill it in:

   ```bash
   cp .env.example .env
   ```

   Set `POSTGRES_PASSWORD` and `RABBITMQ_PASSWORD` (letters, numbers, `_` and `-` only, they end up inside URLs) and the Firebase web config (`NEXT_PUBLIC_FIREBASE_*`, from the Firebase console under Project settings).

2. Save the Firebase Admin key as `secrets/firebase-admin.json` (see [secrets/README.md](./secrets/README.md)). Compose mounts it into the backend. Never commit it.

3. Start it:

   ```bash
   docker compose up --build
   ```

4. Open <https://localhost>. Caddy makes its own certificate, so the browser warns you the first time. You can accept it once, or trust Caddy's local root certificate: copy it out with `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ~/caddy-root.crt` and add it to your system's trusted certificates.

| Service | What it is | Reach it at |
|---|---|---|
| `caddy` | The gateway, the only way in. Checks the login, routes `/api/*`, serves the frontend. | <https://localhost> |
| `frontend` | The Next.js app | through Caddy |
| `backend` | Auth and the request service in one process. It answers to the names `auth` and `pickup`, which are the ones in the [Caddyfile](./infra/caddy/Caddyfile). | through Caddy |
| `postgres` | The database. Tables in `db/init` are created on the first start only, see [db/README.md](./db/README.md). | `localhost:5432` |
| `rabbitmq` | The message broker | management UI <http://localhost:15672> |

If your copy of the repo is in iCloud Drive (the Desktop or Documents folder with "Optimize Mac Storage" on), macOS can swap files for cloud placeholders, and the containers then fail to read them with `resource deadlock avoided`. The backend can't read the Firebase key and Caddy can't read the Caddyfile. Keep the repo outside those folders, or open the files on your Mac first so they download: `cat secrets/firebase-admin.json infra/caddy/Caddyfile db/init/*.sql > /dev/null`.

Two things aren't in Compose yet. The notification service (issue #25) isn't built, so there are no live updates (`/api/events` answers 401 until you're signed in, then 502). And the seed script that creates the demo users is still run by hand, see [scripts/seed/README.md](./scripts/seed/README.md).

## Run one part on your machine

See [backend/README.md](./backend/README.md) and [frontend/README.md](./frontend/README.md). The frontend can run against a mock API with `npm run mock`. The API contracts are in [contracts/](./contracts/).
