# EcoCollect

## Run everything with Docker

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
