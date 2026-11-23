# Backend

## User Service (`src/user/`)

Run `node src/user/index.ts` from `backend/` with Node 22.18 or newer. It listens on port 3004 locally, or `PORT` when set. Compose starts the same backend image with this entry point on port 80, without exposing a host port. `GET /health` returns `{ "status": "ok" }`. Public `GET /api/terms` returns the current terms; other paths return the JSON error shape until their endpoint tickets are added.

Add endpoint files to `src/user/routes/`. Each file exports `register(app)` and registers its routes on the Express app. Files are loaded in filename order before the shared 404 and error handlers. Protected handlers use the gateway's verified user headers; public handlers do not read them. `http/errors.ts` provides `HttpError` and `validationFailed(fields)`.

Session creation, logout and internal `/verify` run in the User Service. Caddy sends both sessions and verification to `user`. Only User mounts the Firebase key.

The layout follows the Request Service on branch `102-request-service`. Database setup and endpoints are separate User Service tickets. `npm test` includes the User Service tests.

`validation/account.ts` exports `validateAccount(body, now)` and `isCalgaryPostalCode(code)`. Pass the database's current time as `now`; the validator calculates the date in Calgary and returns field errors without changing the input. It checks optional address and preferred-code fields whenever supplied, for either role. An address is required only for residents. The shared address schema permits an optional `city` only when it is `Calgary`. The registration handler decides which role details to save and checks whether the supplied terms ID is current (#233).

The [User database setup](scripts/user/README.md) creates the account and terms tables, service login and outbox. It also explains the local and Compose connection settings and the database tests.

`db/terms.ts` exports `getCurrentTerms(client)` for registration and role activation. It selects the document with the latest `published_at` that is not in the future, using its ID to break ties, and returns only `termsDocumentId`, `content` and UTC `publishedAt`. The public route uses the same lookup and reads no identity headers. An empty terms table returns a JSON 500 error. Run `node --test test/user-terms.test.js` from `backend/`; set `TEST_DATABASE_URL` to a loaded scratch database to include the newest-document database test.

### Demo sessions

Set `DEMO_MODE=true` only on a dedicated demo User Service with a separate database, RabbitMQ vhost, and Firebase project or Auth emulator. The production Caddy site does not expose `POST /api/demo/session`. The endpoint allows five attempts per client IP per minute, per User Service process. For the demo gateway, set `DEMO_PROXY_IP` to the address of its single directly connected proxy, which must replace or append the actual peer in `X-Forwarded-For`. Without this setting the service uses the socket address.

In the demo Compose profile, put Caddy and the demo User Service on the same dedicated network. Set that network's `ipam.config` subnet to an unused range, then set the Caddy service's `networks.<demo-network>.ipv4_address` to an unused address in that subnet. Pass the same address as `DEMO_PROXY_IP` to the demo User Service. This keeps the trusted peer stable across container recreation and gives each visitor their own rate-limit bucket.

### Shared-schema profile tests

Load `db/init/*.sql` in filename order into a fresh scratch PostgreSQL database. Set `PROFILE_EDIT_TEST_DATABASE_URL` to the database's admin connection string so the tests can create fixtures and switch to `ecocollect_user` for endpoint calls. From `backend/`, run the relevant test with `node --test test/user-profile-update.test.js` for profile edits or `node --test test/user-profile-delete.test.js` for deactivation. The database-backed cases are skipped without that URL.

## Auth module (`src/user/auth/`)

This checks Firebase users for the gateway. The CommonJS implementation stays in `.cjs` files to preserve its existing behavior inside the TypeScript User Service. It is mounted before the shared JSON parser so malformed session bodies keep their original response. A one-line compatibility export at `src/api/auth/firebase.js` keeps the initializer import used by the open profile PR working; it contains no separate Firebase setup.

| Route | What it does |
|---|---|
| `POST /api/session` | Body `{ "idToken": "<Firebase ID token>" }`. Swaps it for an HttpOnly `session` cookie (5 days). `204` on success, `401` for a missing, invalid or stale token. |
| `DELETE /api/session` | Clears the `session` cookie and revokes the user's sessions on every device. Always `204`. |
| `GET /verify` | Called by Caddy `forward_auth`. Checks `Authorization: Bearer <ID token>`, or the `session` cookie if there is no bearer. `200` with `X-User-Id` and `X-User-Roles` (comma separated, empty if none), `401` otherwise. Revoked tokens and disabled users are rejected. |

`POST /api/session` is routed without `forward_auth` (there is no session yet). `/verify` is internal and must not be exposed publicly.
A `500` means Firebase or our setup failed (network, bad config), not that the token was bad. A body that isn't valid JSON gets a `400`.

## Request Service (`src/request/`)

Pickup requests from creation to delivery, following [contracts/](../contracts/) (Q1 to Q15). Caddy sends every request path to `request` after `/verify`, and the service trusts the `X-User-Id` and `X-User-Roles` headers that only the gateway can set. Each route checks its body or query, then makes one call to a SQL function, and that function does the checks, the write and the event in one transaction.

| Route | Who | What it does |
|---|---|---|
| `GET /api/categories` | any signed-in user | Q1. The e-waste categories. |
| `GET /api/facilities` | volunteer | Q2. The drop-off facilities. |
| `POST /api/uploads` | resident (item photo) / volunteer (delivery photo) | Q3. Signs an ImageKit upload. |
| `POST /api/requests` | resident | Q4. One request per item, in one transaction. |
| `GET /api/requests?view=mine\|available\|volunteer` | resident / volunteer | Q5 to Q7. The resident's requests, the open requests, the volunteer's history. |
| `GET /api/requests/:id` | any signed-in user | Q8. The detail; the database decides what the caller may see. |
| `PATCH /api/requests/:id` | owner | Q9. Edit an Open request. |
| `POST /api/requests/:id/cancel` | owner | Q10. Cancel. |
| `POST /api/requests/:id/assignment` | volunteer | Q11. Accept. |
| `POST /api/requests/:id/assignment/cancel` | owner or assigned volunteer | Q12. Cancel the assignment. |
| `POST /api/requests/:id/assignment/collected` | owner | Q13. Confirm the collection. |
| `POST /api/requests/:id/assignment/missed` | owner | Q14. Report a missed pickup. |
| `POST /api/requests/:id/assignment/delivery` | assigned volunteer | Q15. Record the delivery. |

`GET /health` returns `{ "status": "ok" }` without gateway headers. Errors use the contract's `{ "error": { "code", "message" } }` shape.

- **Database.** The Compose database `ecocollect`, which every service uses (contract 2.1). The course tables this service writes are in schema `requests` (`db/init/010_request_tables.sql`, categories and facilities in `011_request_seed.sql`); the User tables it reads are in `users`. Postgres creates them on a new volume. `scripts/request/load-db.sh` adds the rest: every file in `db/request/` in name order (operational tables, functions, login), loaded onto `ecocollect` without dropping anything. On an older volume it also adds the `010` and `011` tables. Rerun it after pulling new SQL files. Its last file, `099_request_login.sql`, creates the service's own login, `ecocollect_request` (contract 2.1 and 8): full rights on schema `requests`, `INSERT` only on `users.terms_acceptance`, read-only on everything else. `load-db.sh` turns the login on with `REQUEST_DB_PASSWORD` from `.env`, and stops before changing anything if it isn't set.
- **Events out.** The SQL functions write events to `requests.outbox`. The publisher in the same process sends them to the `ecocollect.events` exchange, oldest first, and marks each one only after the broker confirms. A route nudges it after a write; otherwise it looks every second. If RabbitMQ is down, the events wait in the database.
- **Events in.** The `CleanupRequest` consumer reads `request.cleanup-events` and expires the request if it is still due (`RequestExpired`). A message that keeps failing ends up in `request.cleanup-events.dlq`.
- **Photos.** ImageKit signs uploads and photo URLs. The private key goes to this service only.

Run it from `backend/`, after `load-db.sh` (port 3003, or `PORT`):

```bash
DATABASE_URL=postgres://ecocollect_request:<REQUEST_DB_PASSWORD>@localhost:5432/ecocollect \
  node --env-file=../.env src/request/index.ts
```

| Variable | Notes |
|---|---|
| `DATABASE_URL` | The `ecocollect_request` login on the database `ecocollect`. Compose takes it from `REQUEST_DATABASE_URL` in `.env`. |
| `REQUEST_DB_PASSWORD` | Read by `load-db.sh` (from `.env`) to set the login's password. Use the same password in `REQUEST_DATABASE_URL`. |
| `RABBITMQ_URL` | The broker. |
| `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_URL_ENDPOINT` | From the ImageKit dashboard. It won't start without them. |
| `IMAGEKIT_ROOT_FOLDER` | Upload folders start with this: `/ecocollect`, or `/ecocollect-demo` in the demo stack. |
| `DEMO_MODE` | `true` only in the demo stack: the resident also gets the new-request notification for their own request (contract 17.5). |

Tests: `npm run typecheck` and `npm run test:request`. The database tests need `REQUEST_TEST_DATABASE_URL` pointing at a database built by `load-db.sh --test` (`ecocollect_request_test`: every `db/init` file, `db/request/`, then the test accounts and requests in `test/request/seed.sql`); without it they are skipped. Use the service login (`ecocollect_request`) in that URL, so the tests run with the service's real grants, and set `REQUEST_TEST_ADMIN_DATABASE_URL` to the same database with the admin login: the tests move requests into the past by changing rows the service itself may not change. Without the admin URL, the tests use `REQUEST_TEST_DATABASE_URL` for that too, which then has to be the admin login.

From `backend/`, with `docker compose up -d postgres` running:

```bash
# Rebuild the test database. Do this before every run: some tests change seed rows for good (Q11 accept).
scripts/request/load-db.sh --test

# Load .env into this shell (use a fresh terminal: these exports override .env later).
set -a && . ../.env && set +a

REQUEST_TEST_DATABASE_URL="postgres://ecocollect_request:${REQUEST_DB_PASSWORD}@127.0.0.1:5432/ecocollect_request_test" \
REQUEST_TEST_ADMIN_DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/ecocollect_request_test" \
  npm run test:request
```

Use `127.0.0.1`, not `localhost`: if another Postgres runs on your machine (Homebrew, for example), `localhost` can reach it instead of the Compose one, and every test fails with `role "ecocollect" does not exist`.

## Run it

```bash
cd backend
npm install
```

Every service is started with its own entry point, for example `node src/user/index.ts` or `node src/request/index.ts`; each section above lists its variables. Compose builds one image from this folder and gives each service its own `command`. Needs Node 22.18 or newer.

Save the Firebase admin key as `secrets/firebase-admin.json` in the repo root (keep it out of git), or point `GOOGLE_APPLICATION_CREDENTIALS` at it.

| Variable | Notes |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to the Firebase service-account key. Defaults to `secrets/firebase-admin.json`. Never commit it. |
| `FIREBASE_AUTH_EMULATOR_HOST` | Set (e.g. `127.0.0.1:9099`) to use the Auth emulator instead of the key. |
| `NODE_ENV` | Set to `production` when deployed. Otherwise Express puts stack traces in error responses (e.g. a body that is too large). |

After pulling the quorum-queue change (#104), reset the broker once. RabbitMQ can't change an existing queue's type, so old queues make the services fail with `PRECONDITION_FAILED`:

```bash
docker compose down && docker volume rm ecocollect_rabbitmqdata
```

This deletes only the RabbitMQ volume, so the Postgres demo data survives.

## Tests

```bash
npm test
```

Firebase is faked in the tests, so they need no credentials or network. The shared outbox tests are skipped unless `TEST_DATABASE_URL` points at a Postgres with `db/init/001_schema.sql` loaded:

```bash
TEST_DATABASE_URL=postgres://ecocollect:change_me@localhost:5432/ecocollect npm test
```

Use a scratch database for that, not the demo one: the outbox tests mark every unsent event as sent. They remove the events they add.

## Public profiles

`GET /api/public/profiles/:accountId` needs no login and reads no identity headers. It returns only `accountId`, `publicName`, `roles` and UTC `memberSince`. Invalid, unknown and deactivated accounts return `404 profile_not_found` with the same message. The lookup selects no private account fields and makes no Firebase calls. Profile stats remain on the Reward route.

Run `node --test test/user-public-profile.test.js` from `backend/`. Set `TEST_DATABASE_URL` to a loaded scratch database to include the role and deactivation checks.

## User account helpers

`src/user/firebase/accounts.ts` wraps account creation, role claims, disabling and re-enabling. Each helper takes an Auth object, so tests use a fake without credentials. `createAccountUser(auth, accountExists, input, now)` also takes the database's current time. It only removes a conflicting Firebase account when it is more than ten minutes old and `accountExists(uid)` explicitly returns false, then retries creation once. Username and email conflicts return typed 409 errors. Role claims get at most three attempts. If initial claims fail, the helper removes the newly created Firebase account; it preserves both errors if cleanup also fails.

The registration handler owns deletion after a failed database write. The role handler owns reversing a database change after failed claims. Deactivation disables first and revokes tokens second; errors propagate to the handler, which owns recovery if a later step fails. `enableUser` re-enables the account without restoring revoked tokens. These helpers do not open database connections or initialize Firebase.

## Own profile

`GET /api/profile` reads only the caller ID from Caddy's `X-User-Id` header. `db/profile.ts` exports `loadProfile(client, auth, accountId)` for this route and the later profile-edit handler. It reads names, role membership, address and preferred codes from `users`, and the email from Firebase. Birth dates stay `YYYY-MM-DD`; creation times are UTC with a `Z`.

A volunteer-only profile has no address. Missing or deactivated database accounts return `404 profile_not_found`; Firebase lookup failures return the shared 500 error. The route reuses the existing Firebase initializer in `src/api/auth/firebase.js` until #229 moves authentication into the User Service. Run `node --test test/user-profile.test.js`; set `TEST_DATABASE_URL` to a loaded scratch database for the role, isolation and date tests.
