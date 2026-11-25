# EcoCollect

## Run everything with Docker

1. Copy the env file and fill it in:

   ```bash
   cp .env.example .env
   ```

   Set `POSTGRES_PASSWORD` and `RABBITMQ_PASSWORD` (letters, numbers, `_` and `-` only, they end up inside URLs), the Firebase web config (`NEXT_PUBLIC_FIREBASE_*`, from the Firebase console under Project settings) and the ImageKit keys (`IMAGEKIT_*`, from the ImageKit dashboard under Developer options > API keys).

2. Save the Firebase Admin key as `secrets/firebase-admin.json` (see [secrets/README.md](./secrets/README.md)). Compose mounts it only into the User Service. Never commit it.

3. Set up the services' database objects (Postgres must be up: `docker compose up -d postgres`; it creates the tables from `db/init` on a new volume). Set `REQUEST_DB_PASSWORD` in `.env` and use the same password in `REQUEST_DATABASE_URL`, then load the Request Service's functions and login (rerun it after pulling new `db/request` files):

   ```bash
   backend/scripts/request/load-db.sh
   ```

   and set up the User Service login as in [backend/scripts/user/README.md](./backend/scripts/user/README.md), then put the same password in `USER_DATABASE_URL` in `.env`.

4. Start it:

   ```bash
   docker compose up --build
   ```

5. Open <https://localhost>. Caddy makes its own certificate, so the browser warns you the first time. You can accept it once, or trust Caddy's local root certificate: copy it out with `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ~/caddy-root.crt` and add it to your system's trusted certificates.

| Service | What it is | Reach it at |
|---|---|---|
| `caddy` | The gateway, the only way in. Checks the login, routes `/api/*`, serves the frontend. | <https://localhost> |
| `frontend` | The Next.js app | through Caddy |
| `user` | Accounts, profiles, terms, and the login check Caddy calls (`/verify`). The only service with the Firebase key. Same image as the backend, started with `src/user/index.ts`. | through Caddy |
| `request` | Pickup requests from creation to delivery, their photos (ImageKit) and their events. Same image as the backend, started with `src/request/index.ts`. Its own database for now, see [backend/README.md](./backend/README.md#request-service-srcrequest). | through Caddy |
| `notification` | Live updates: turns RabbitMQ events into signals on `/api/events`. Same image as the backend, started with `src/notification/index.js`. | through Caddy |
| `postgres` | The database. Tables in `db/init` are created on the first start only, see [db/README.md](./db/README.md). | `localhost:5432` |
| `rabbitmq` | The message broker | management UI <http://localhost:15672> |

If your copy of the repo is in iCloud Drive (the Desktop or Documents folder with "Optimize Mac Storage" on), macOS can swap files for cloud placeholders, and the containers then fail to read them with `resource deadlock avoided`. The User Service can't read the Firebase key and Caddy can't read the Caddyfile. Keep the repo outside those folders, or open the files on your Mac first so they download: `cat secrets/firebase-admin.json infra/caddy/Caddyfile db/init/*.sql > /dev/null`.

The seed script that creates the demo users isn't in Compose yet, it's still run by hand, see [scripts/seed/README.md](./scripts/seed/README.md).

## Run one part on your machine

See [backend/README.md](./backend/README.md) and [frontend/README.md](./frontend/README.md). The frontend can run against a mock API with `npm run mock`. The API contracts are in [contracts/](./contracts/).
