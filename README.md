# EcoCollect

## Run everything with Docker

1. Copy the env file and fill it in:

   ```bash
   cp .env.example .env
   ```

   Set `POSTGRES_PASSWORD` (use the same one in `DATABASE_URL`) and `RABBITMQ_PASSWORD`, the Firebase web config (`NEXT_PUBLIC_FIREBASE_*`, from the Firebase console under Project settings), the ImageKit keys (`IMAGEKIT_*`, from the ImageKit dashboard under Developer options > API keys) and the push keys (`VAPID_*`, from `npx web-push generate-vapid-keys`; put the public key in `NEXT_PUBLIC_VAPID_KEY` too). Compose refuses to run any command while a required value is missing.

   Each service has its own database login. For `USER`, `REQUEST`, `REWARD`, `CLEANUP` and `NOTIFICATION`, set `<NAME>_DB_PASSWORD` and use the same password in `<NAME>_DATABASE_URL`. Keep `RABBITMQ_PASSWORD` and all database passwords to letters, numbers, `_` and `-` (or URL-encode special characters inside `DATABASE_URL` and `<NAME>_DATABASE_URL`).

2. Save the Firebase Admin key as `secrets/firebase-admin.json` (see [secrets/README.md](./secrets/README.md)). Compose mounts it only into the User Service. Never commit it.

3. Set up the database. On a new volume, Postgres creates the tables from `db/init`. These scripts then add each service's database objects and turn on its login (rerun them after pulling changes in `db/`):

   ```bash
   docker compose up -d --wait postgres
   backend/scripts/request/load-db.sh
   backend/scripts/reward/load-db.sh
   backend/scripts/notification/load-db.sh
   backend/scripts/cleanup/load-db.sh
   ```

   The User Service script connects from your machine, so it needs `psql` 15 or newer and reads `DATABASE_URL` and `USER_DB_PASSWORD` from the shell. Pass only those two values from `.env`:

   ```bash
   DATABASE_URL='postgres://ecocollect:<POSTGRES_PASSWORD>@localhost:5432/ecocollect' \
   USER_DB_PASSWORD='<USER_DB_PASSWORD>' \
   bash backend/scripts/user/load-db.sh
   ```

   See [backend/scripts/user/README.md](./backend/scripts/user/README.md) for what it does.

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
| `request` | Pickup requests from creation to delivery, their photos (ImageKit) and their events. Same image as the backend, started with `src/request/index.ts`. See [backend/README.md](./backend/README.md#request-service-srcrequest). | through Caddy |
| `notification` | Turns RabbitMQ events into stored notifications, live updates on `/api/events` and Web Push. Same image as the backend, started with `src/notification/index.js`. | through Caddy |
| `reward` | EcoPoints and public statistics. Same image as the backend, started with `src/reward/index.js`. | through Caddy |
| `cleanup` | Schedules request expiry and the daily notification cleanup. Same image as the backend, started with `src/cleanup/index.js`. | no HTTP |
| `postgres` | The one database every service uses, each with its own login. Tables in `db/init` are created on the first start only, see [db/README.md](./db/README.md). | `localhost:5432` |
| `rabbitmq` | The message broker | management UI <http://localhost:15672> |

If your copy of the repo is in iCloud Drive (the Desktop or Documents folder with "Optimize Mac Storage" on), macOS can swap files for cloud placeholders, and the containers then fail to read them with `resource deadlock avoided`. The User Service can't read the Firebase key and Caddy can't read the Caddyfile. Keep the repo outside those folders, or open the files on your Mac first so they download: `cat secrets/firebase-admin.json infra/caddy/Caddyfile db/init/*.sql > /dev/null`.

Create accounts on the app's sign-up page.

## Run one part on your machine

See [backend/README.md](./backend/README.md) and [frontend/README.md](./frontend/README.md). The frontend can run against a mock API with `npm run mock`. The API contracts are in [contracts/](./contracts/).
