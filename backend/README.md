# Backend

## User Service (`src/user/`)

Run `node src/user/index.ts` from `backend/` with Node 22.18 or newer. It listens on port 3004 locally, or `PORT` when set. Compose starts the same backend image with this entry point on port 80, without exposing a host port. `GET /health` returns `{ "status": "ok" }`. Public `GET /api/terms` returns the current terms; other paths return the JSON error shape until their endpoint tickets are added.

Add endpoint files to `src/user/routes/`. Each file exports `register(app)` and registers its routes on the Express app. Files are loaded in filename order before the shared 404 and error handlers. Protected handlers use the gateway's verified user headers; public handlers do not read them. `http/errors.ts` provides `HttpError` and `validationFailed(fields)`.

Session creation, logout and internal `/verify` run in the User Service. Caddy sends both sessions and verification to `user`. Only User mounts the Firebase key; the legacy request backend keeps its pickup alias and `/health` endpoint without Firebase access.

The layout follows the Request Service on branch `102-request-service`. Database setup and endpoints are separate User Service tickets. `npm test` includes the User Service tests.

`validation/account.ts` exports `validateAccount(body, now)` and `isCalgaryPostalCode(code)`. Pass the database's current time as `now`; the validator calculates the date in Calgary and returns field errors without changing the input. It checks optional address and preferred-code fields whenever supplied, for either role. An address is required only for residents. The shared address schema permits an optional `city` only when it is `Calgary`. The registration handler decides which role details to save and checks whether the supplied terms ID is current (#233).

The [User database setup](scripts/user/README.md) creates the account and terms tables, service login and outbox. It also explains the local and Compose connection settings and the database tests.

`db/terms.ts` exports `getCurrentTerms(client)` for registration and role activation. It selects the document with the latest `published_at` that is not in the future, using its ID to break ties, and returns only `termsDocumentId`, `content` and UTC `publishedAt`. The public route uses the same lookup and reads no identity headers. An empty terms table returns a JSON 500 error. Run `node --test test/user-terms.test.js` from `backend/`; set `TEST_DATABASE_URL` to a loaded scratch database to include the newest-document database test.

### Demo sessions

Set `DEMO_MODE=true` only on a dedicated demo User Service with a separate database, RabbitMQ vhost, and Firebase project or Auth emulator. The production Caddy site does not expose `POST /api/demo/session`. The endpoint allows five attempts per client IP per minute, per User Service process. For the demo gateway, set `DEMO_PROXY_IP` to the address of its single directly connected proxy, which must replace or append the actual peer in `X-Forwarded-For`. Without this setting the service uses the socket address.

## Auth module (`src/user/auth/`)

This checks Firebase users for the gateway. The CommonJS implementation stays in `.cjs` files to preserve its existing behavior inside the TypeScript User Service. It is mounted before the shared JSON parser so malformed session bodies keep their original response. A one-line compatibility export at `src/api/auth/firebase.js` keeps the initializer import used by the open profile PR working; it contains no separate Firebase setup.

| Route | What it does |
|---|---|
| `POST /api/session` | Body `{ "idToken": "<Firebase ID token>" }`. Swaps it for an HttpOnly `session` cookie (5 days). `204` on success, `401` for a missing, invalid or stale token. |
| `DELETE /api/session` | Clears the `session` cookie and revokes the user's sessions on every device. Always `204`. |
| `GET /verify` | Called by Caddy `forward_auth`. Checks `Authorization: Bearer <ID token>`, or the `session` cookie if there is no bearer. `200` with `X-User-Id` and `X-User-Roles` (comma separated, empty if none), `401` otherwise. Revoked tokens and disabled users are rejected. |

`POST /api/session` is routed without `forward_auth` (there is no session yet). `/verify` is internal and must not be exposed publicly.
A `500` means Firebase or our setup failed (network, bad config), not that the token was bad. A body that isn't valid JSON gets a `400`.

## Request service (`src/api/requests/`, `src/messaging/`)

Creates and lists pickup requests, following [contracts/](../contracts/). It trusts the `X-User-Id` and `X-User-Roles` headers, which only the gateway can set.

| Route | What it does |
|---|---|
| `POST /api/requests` | Resident only. One request per item, all in one transaction, with the address taken from the resident's profile. Each request also writes a `RequestCreated` row to the `outbox` table. `201`, or `400` with `{ "error": "..." }`. |
| `GET /api/requests?view=mine` | Resident only. Their own requests, newest first. Optional `status`. |
| `GET /api/requests?view=available` | Volunteer only. Open requests with a window still ahead, never the street. Optional `postalCodes`. |

The outbox publisher runs in the same process. Every second it sends unsent outbox rows to the `ecocollect.events` topic exchange (routing key `request.created`, persistent) and waits for the broker's confirm before marking a row as sent. If RabbitMQ is down it logs the error and tries again, and the events just wait in the database. It creates the exchange itself if it's missing.

## Run it

```bash
cd backend
npm install
npm start
```

Save the Firebase admin key as `secrets/firebase-admin.json` in the repo root (keep it out of git), or point `GOOGLE_APPLICATION_CREDENTIALS` at it. Needs Node 22 or newer.

| Variable | Notes |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to the Firebase service-account key. Defaults to `secrets/firebase-admin.json`. Never commit it. |
| `FIREBASE_AUTH_EMULATOR_HOST` | Set (e.g. `127.0.0.1:9099`) to use the Auth emulator instead of the key. |
| `DATABASE_URL` | Postgres connection string. `.env.example` has a working local one, and the tables come from `db/init`. |
| `RABBITMQ_URL` | For example `amqp://ecocollect:change_me@localhost:5672`. Also in `.env.example`. |
| `PORT` | Defaults to `3001`. |
| `NODE_ENV` | Set to `production` when deployed. Otherwise Express puts stack traces in error responses (e.g. a body that is too large). `npm start` does not set it. |

After pulling the quorum-queue change (#104), reset the broker once. RabbitMQ can't change an existing queue's type, so old queues make the services fail with `PRECONDITION_FAILED`:

```bash
docker compose down && docker volume rm ecocollect_rabbitmqdata
```

This deletes only the RabbitMQ volume, so the Postgres demo data survives.

## Tests

```bash
npm test
```

Firebase is faked in the tests, so they need no credentials or network. The database tests are skipped unless `TEST_DATABASE_URL` points at a Postgres with the schema loaded:

```bash
TEST_DATABASE_URL=postgres://ecocollect:change_me@localhost:5432/ecocollect npm test
```

Use a scratch database for that, not the demo one: the outbox tests mark every unsent event as sent. They add their own users with random postal codes and remove them afterwards.

## Public profiles

`GET /api/public/profiles/:accountId` needs no login and reads no identity headers. It returns only `accountId`, `publicName`, `roles` and UTC `memberSince`. Invalid, unknown and deactivated accounts return `404 profile_not_found` with the same message. The lookup selects no private account fields and makes no Firebase calls. Profile stats remain on the Reward route.

Run `node --test test/user-public-profile.test.js` from `backend/`. Set `TEST_DATABASE_URL` to a loaded scratch database to include the role and deactivation checks.

## User account helpers

`src/user/firebase/accounts.ts` wraps account creation, role claims, disabling and re-enabling. Each helper takes an Auth object, so tests use a fake without credentials. `createAccountUser(auth, accountExists, input, now)` also takes the database's current time. It only removes a conflicting Firebase account when it is more than ten minutes old and `accountExists(uid)` explicitly returns false, then retries creation once. Username and email conflicts return typed 409 errors. Role claims get at most three attempts. If initial claims fail, the helper removes the newly created Firebase account; it preserves both errors if cleanup also fails.

The registration handler owns deletion after a failed database write. The role handler owns reversing a database change after failed claims. Deactivation disables first and revokes tokens second; errors propagate to the handler, which owns recovery if a later step fails. `enableUser` re-enables the account without restoring revoked tokens. These helpers do not open database connections or initialize Firebase.

## Own profile

`GET /api/profile` reads only the caller ID from Caddy's `X-User-Id` header. `db/profile.ts` exports `loadProfile(client, auth, accountId)` for this route and the later profile-edit handler. It reads names, role membership, address and preferred codes from `users`, and the email from Firebase. Birth dates stay `YYYY-MM-DD`; creation times are UTC with a `Z`.

A volunteer-only profile has no address. Missing or deactivated database accounts return `404 profile_not_found`; Firebase lookup failures return the shared 500 error. The route reuses the existing Firebase initializer in `src/api/auth/firebase.js` until #229 moves authentication into the User Service. Run `node --test test/user-profile.test.js`; set `TEST_DATABASE_URL` to a loaded scratch database for the role, isolation and date tests.
