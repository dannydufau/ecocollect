# EcoCollect

EcoCollect is a community e-waste courier web application for Calgary. Residents post household electronics pickup requests with one-hour Calgary pickup windows, local volunteers claim and collect items, deliver them to an eligible recycling facility with photo evidence, and both participants earn EcoPoints.

## Submissions and quick links

- **ENSF 607 submission:** [docs/Final Submission/ENSF607/README.md](<./docs/Final Submission/ENSF607/README.md>) — functional requirements (FR01–FR23), NFRs (NFR01–NFR06), diagrams, and software quality index.
- **ENSF 608 submission:** [docs/Final Submission/ENSF608/README.md](<./docs/Final Submission/ENSF608/README.md>) — conceptual/logical models, normalization, physical setup, 25 SQL operations, and database test suite.
- **Full stack with Docker:** [Run everything with Docker](#run-everything-with-docker)
- **Frontend without backend:** [Run the frontend with the mock API or signed-in test mode](#run-the-frontend-with-the-mock-api-or-signed-in-test-mode)
- **Automated tests:** [Automated tests](#automated-tests)
- **API & event contracts:** [contracts/README.md](./contracts/README.md) and [contracts/openapi.yaml](./contracts/openapi.yaml)
- **Deployment guide:** [docs/deploy-oracle-vm.md](./docs/deploy-oracle-vm.md)

## Run everything with Docker

Prerequisites: Docker with Compose v2, Node.js 22.18+ (for local scripts/tests), and `psql` 15+ on `PATH` (for `backend/scripts/user/load-db.sh`).

1. Copy the env file and fill it in:

   ```bash
   cp .env.example .env
   ```

   Set `POSTGRES_PASSWORD` (use the same value in `DATABASE_URL`) and `RABBITMQ_PASSWORD`, the Firebase web config (`NEXT_PUBLIC_FIREBASE_*`, from Firebase Console → Project settings), the ImageKit keys (`IMAGEKIT_*`, from ImageKit → Developer options → API keys), and the Web Push keys (`VAPID_*`, from `npx web-push generate-vapid-keys`; put the same public key in `NEXT_PUBLIC_VAPID_KEY`). Compose refuses to start while a required value is missing.

   Each service has its own database login. For `USER`, `REQUEST`, `REWARD`, `CLEANUP`, and `NOTIFICATION`, set `<NAME>_DB_PASSWORD` and use the same password in `<NAME>_DATABASE_URL`. Keep `RABBITMQ_PASSWORD` and all database passwords to letters, numbers, `_`, and `-` (or URL-encode special characters inside connection URLs).

2. Save the Firebase Admin key as `secrets/firebase-admin.json` (see [secrets/README.md](./secrets/README.md)). Compose mounts it only into the `user` service. Never commit it.

3. Set up the database. On a **fresh volume**, Postgres runs `db/init/*.sql` automatically on first start. Each service loader below then installs that service's SQL objects and sets its login password. On an **existing database**, rerun the affected loaders after pulling changes in `db/` (run the User loader first if `db/init/005`–`031` changed):

   ```bash
   docker compose up -d --wait postgres

   # User Service loader (connects from your machine; requires psql 15+).
   # Reads DATABASE_URL and USER_DB_PASSWORD from the shell. This example assumes
   # the default port (5432); adjust the host, port (POSTGRES_PORT), database
   # (POSTGRES_DB), and user (POSTGRES_USER) in DATABASE_URL to match your .env.
   DATABASE_URL='postgres://ecocollect:<POSTGRES_PASSWORD>@localhost:5432/ecocollect' \
   USER_DB_PASSWORD='<USER_DB_PASSWORD>' \
   bash backend/scripts/user/load-db.sh

   # Service loaders (run inside the Compose Postgres container)
   backend/scripts/request/load-db.sh
   backend/scripts/reward/load-db.sh
   backend/scripts/notification/load-db.sh
   backend/scripts/cleanup/load-db.sh
   ```

   See [db/README.md](./db/README.md) and [backend/scripts/user/README.md](./backend/scripts/user/README.md) for details.

4. Start the full stack:

   ```bash
   docker compose up --build
   ```

5. Open <https://localhost>. Caddy generates a local TLS certificate, so the browser warns on first visit. You can accept it once, or trust Caddy's local root certificate (recommended, and required for browser Web Push testing): copy it out with `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ~/caddy-root.crt` and import `~/caddy-root.crt` into your system or browser trust store.

| Service | What it is | Reach it at |
|---|---|---|
| `caddy` | The gateway, the only way in. Checks the login (`/verify`), routes `/api/*`, serves the frontend. | <https://localhost> |
| `frontend` | The Next.js app | through Caddy |
| `user` | Accounts, profiles, terms, and the login check Caddy calls (`/verify`). The only service with the Firebase key. Entry point: `src/user/index.ts`. | through Caddy |
| `request` | Pickup requests from creation to delivery, photos (ImageKit), and events. Entry point: `src/request/index.ts`. See [backend/README.md](./backend/README.md#request-service-srcrequest). | through Caddy |
| `notification` | Turns RabbitMQ events into stored notifications, live updates on `/api/events`, and Web Push. Entry point: `src/notification/index.js`. | through Caddy |
| `reward` | EcoPoints and public statistics. Entry point: `src/reward/index.js`. | through Caddy |
| `cleanup` | Schedules request expiry and daily notification cleanup. Entry point: `src/cleanup/index.js`. | no HTTP |
| `postgres` | Shared Postgres 16 database; each service has its own schema and restricted login. `db/init` runs on first start only, see [db/README.md](./db/README.md). | `127.0.0.1:${POSTGRES_PORT:-5432}` |
| `rabbitmq` | Message broker (quorum queues) | management UI <http://localhost:15672> |

If your copy of the repo is in iCloud Drive (Desktop or Documents with "Optimize Mac Storage" on), macOS can swap files for cloud placeholders and containers fail with `resource deadlock avoided`. Keep the repo outside iCloud Drive, or read the mounted files first: `cat secrets/firebase-admin.json infra/caddy/Caddyfile db/init/*.sql > /dev/null`.

Create accounts on the app's sign-up page (`/register`). The legacy seed script in [scripts/seed](./scripts/seed/README.md) still populates the older October 28 tables in `db/init/001_schema.sql`, which the current services do not read.

## Run the frontend with the mock API or signed-in test mode

You can run the frontend locally without Postgres, RabbitMQ, or backend containers (see [frontend/README.md](./frontend/README.md) for full details). Because `npm run mock` stays running in the foreground, start the mock API and the frontend in two separate terminals:

- **Mock API (in-memory data, real Firebase login):**
  First copy and fill in `frontend/.env.local` as described in [frontend/README.md](./frontend/README.md#run-it), then run:
  - **Terminal 1** (mock API on <http://localhost:8080>):
    ```bash
    cd frontend && npm ci && npm run mock
    ```
  - **Terminal 2** (Next.js dev server on <http://localhost:3000>):
    ```bash
    cd frontend && npm run dev
    ```
- **Signed-in test mode (in-memory mock API + fake local auth, no real Firebase account required):**
  - **Terminal 1** (mock API on <http://localhost:8080>):
    ```bash
    cd frontend && npm ci && npm run mock
    ```
  - **Terminal 2** (builds `.next-e2e` and serves <http://localhost:3100> as `demo-resident-1`; placeholder `NEXT_PUBLIC_FIREBASE_*` values satisfy Next.js prerendering if `frontend/.env.local` is not set):
    ```bash
    cd frontend && \
    NEXT_PUBLIC_FIREBASE_API_KEY=demo-local-key \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=example.test \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-ecocollect \
    NEXT_PUBLIC_FIREBASE_APP_ID=1:123:web:demo \
    npm run e2e:app
    ```

## Automated tests

Run `npm ci` inside each package (`contracts/`, `backend/`, `frontend/`) before running its tests.

| Suite | Command | Services required |
|---|---|---|
| API & event contracts | `cd contracts && npm test` | None (pure schema/spec validation) |
| Frontend unit & component tests | `cd frontend && npm test` | None (Vitest + mocked API/auth) |
| Frontend lint & type check | `cd frontend && npm run lint && npx tsc --noEmit` | None |
| Frontend production build & bundle size | `cd frontend && npm run build && npm run size` | None (use placeholder `NEXT_PUBLIC_FIREBASE_*` env vars from [frontend/README.md](./frontend/README.md#baseline)) |
| Frontend browser E2E & axe checks | `cd frontend && npm run e2e` | None (Playwright starts its own mock API on `:3101` and signed-in test build on `:3100` with fake auth) |
| Backend unit tests | `cd backend && npm test` | None (Firebase is mocked; DB-backed cases skip unless DB URLs are set) |
| Backend Request Service typecheck & DB tests | `backend/scripts/request/load-db.sh --test`, then `cd backend && npm run typecheck && REQUEST_TEST_DATABASE_URL=... REQUEST_TEST_ADMIN_DATABASE_URL=... npm run test:request` | Disposable Postgres (`ecocollect_request_test`): `REQUEST_TEST_DATABASE_URL` uses the restricted `ecocollect_request` login; `REQUEST_TEST_ADMIN_DATABASE_URL` uses the admin login for time-shifting fixtures |
| Backend User Service DB tests | `cd backend && TEST_DATABASE_URL=<scratch_admin_url> node --test --test-concurrency=1 "test/user/**/*.test.ts" "test/user/**/*.test.cjs"` | Disposable scratch Postgres loaded with `db/init` + `backend/scripts/user/load-db.sh` |
| Backend broker & notification integration tests | `bash backend/scripts/test-integration.sh` | Disposable Compose Postgres + RabbitMQ (stops the `notification` container during the run) |
| ENSF 608 database operations & SQL tests | See [ENSF 608 Section 4](<./docs/Final Submission/ENSF608/4. Physical model/README.md>), [Section 5](<./docs/Final Submission/ENSF608/5. Database operations and queries/README.md>), and [Section 6](./backend/test/ensf608/README.md) | Fresh Postgres database (`ecocollect_608_test`) |

See [backend/README.md](./backend/README.md) and [frontend/README.md](./frontend/README.md) for per-service commands and environment variables.
