# Gateway test stubs

Automated tests for the Caddy gateway (`infra/caddy/Caddyfile`). They run the real gateway config against stand-in services, so the gateway can be tested and reviewed before the user, request, reward, notification and frontend services are ready.

<!-- The tests cover the gateway rules: routing, `forward_auth`, header stripping, `X-Request-Id`, and SSE streaming. -->

## Prerequisites

- Docker with Compose v2 (`docker compose`)
- bash and curl
- Port `3030` free on your machine

## Run

```bash
./infra/caddy/testing/test.sh
```

To print the response for every test, not only the failed ones:

```bash
VERBOSE=1 ./infra/caddy/testing/test.sh
```

The script:

1. Validates the Caddyfile with `caddy validate`.
2. Starts the stack and waits until both `/` (frontend) and `/api/terms` (user) answer successfully.
3. Runs all tests and prints a summary.
4. Removes all containers on exit (including on failure or Ctrl-C).

It exits with `0` if everything passed and `1` otherwise, so it can also run in CI.

## Files

| File | Purpose |
|---|---|
| `test.sh` | Starts the stack, runs the tests, cleans up |
| `compose.test.yml` | The gateway plus stub services |
| `compose.sse.yml` | Override that swaps `notification` for the SSE stub |
| `user-stub.Caddyfile` | Stubbed user service: `/verify` for `forward_auth`, plus the user API routes |
| `sse-stub-script.sh` | Stubbed SSE stream for `/api/events` |

## How the stack is set up

| Service | Image | Role |
|---|---|---|
| `gateway` | `caddy:2` | The real `infra/caddy/Caddyfile`; the only service with a published port (`3030 → 443`) |
| `user` | `caddy:2` | Fake user service. Answers `/verify` for `forward_auth` (see [Fake credentials](#fake-credentials)) and the user API routes (see [User stub responses](#user-stub-responses)) |
| `request`, `reward`, `notification` | `traefik/whoami` | Echo servers: the response body shows their name (e.g. `Name: request`) and every request header they received |
| `frontend` | `traefik/whoami` | Same echo server, listening on port `3000` like the real frontend |

There are two networks:

- `internal` (`internal: true`): all stubs. No published ports and no outbound access.
- `public`: the gateway only, so it can publish its port.

The gateway is attached to both. This mirrors contract 5.8: only the gateway is reachable from outside.

The gateway uses Caddy's local certificate for `localhost`, so the tests call curl with `-k`.

## How the gateway routes

Every `/api/*` route is an allowlist of **method + path**. A request that matches no rule (wrong path *or* wrong method) gets `404` from the gateway. Errors on `/api/*` are returned as JSON: `{"status": <code>, "error": "<message>"}`.

| Service | Public (no auth) | Protected (`forward_auth` to `user /verify`) |
|---|---|---|
| reward | `GET /api/public/stats`, `GET /api/public/profiles/{username}/stats` | `GET /api/ecopoints` |
| user | `POST`/`DELETE /api/session`, `POST /api/accounts`, `GET /api/terms`, `GET /api/public/profiles/{username}` | `GET`/`PATCH`/`DELETE /api/profile`, `POST /api/profile/roles` |
| request | none | `GET /api/categories`, `/api/facilities`, `/api/requests`, `/api/requests/{id}`; `PATCH /api/requests/{id}`; `POST /api/uploads`, `/api/requests`, `/api/requests/{id}/cancel`, `/api/requests/{id}/assignment`, `/api/requests/{id}/assignment/{cancel,collected,missed,delivery}` |
| notification | `GET /api/public/events` | `GET /api/events`, `/api/notifications`; `PATCH /api/notifications/{id}/read`; `POST /api/notifications/read-all`; `POST`/`DELETE /api/push/subscriptions` |
| frontend | every non-`/api` path except `/verify` | none |

`/verify` is internal only: the gateway answers it with `404` from outside.

For every request, the gateway first removes any client-supplied `X-User-*` headers and replaces `X-Request-Id` with a new UUID.

## Fake credentials

The user stub's `/verify` accepts the credentials below and returns the matching `X-User-Id` / `X-User-Roles`, which the gateway copies onto the forwarded request. Anything else gets `401`.

| Credential | `X-User-Id` | `X-User-Roles` |
|---|---|---|
| `Authorization: Bearer good-resident` | `resident-id-1` | `resident` |
| `Authorization: Bearer good-volunteer` | `volunteer-id-1` | `volunteer` |
| `Cookie: session=good-resident` | `resident-id-1` | `resident` |
| `Cookie: session=good-volunteer` | `volunteer-id-1` | `volunteer` |

## User stub responses

Unlike `whoami`, the user stub returns fixed responses. Every body contains `Name: user`, except the `204` responses, which have no body.

| Request | Response |
|---|---|
| `POST /api/session` | `204` with `Set-Cookie: session=good-resident` |
| `DELETE /api/session` | `204` with `Set-Cookie: session=; Max-Age=0` (clears the cookie) |
| `POST /api/accounts` | `400` (lets the tests check that service errors pass through the gateway) |
| `GET /api/terms` | `200` |
| `GET /api/public/profiles/{username}` | `404` "No public profile found" |
| `GET`/`PATCH /api/profile` | `200` |
| `DELETE /api/profile` | `204` |
| `POST /api/profile/roles` | `200` |
| anything else | `404` |

## Why the SSE tests swap the notification stub

`traefik/whoami` responds and closes the connection, so it can't test streaming. For the SSE group, `test.sh` replaces `notification` with `sse-stub-script.sh` (via `compose.sse.yml`). The stub keeps the connection open and sends an `event: notification` every 2 seconds.

Each SSE test reads the stream for 7 seconds and expects at least 2 events. If the gateway buffered the response, none would arrive in time.

The stub is a simple `nc` loop that handles **one connection at a time**. After a client disconnects, it can take up to one event interval (2 s) before it accepts the next connection, so the script waits 3 seconds between SSE tests. Without that wait, the next test gets `502 connection refused`.

The SSE group runs last, because after the swap the other notification tests would no longer see the `whoami` echo.

## Debugging

- **See every response:** `VERBOSE=1 ./test.sh`
- **Gateway debug logs:** uncomment `debug` in the global options of the Caddyfile.
- **Manual cleanup:** `docker compose -p ecocollect-gateway-test -f compose.test.yml down -v --remove-orphans`

## Adding a test

Use one of the helpers in `test.sh`:

- `expect_status <name> <status> <curl args...>`
- `expect_body_contains <name> <needle> yes|no <curl args...>` (case-insensitive; add `-i` to also search the response headers)
- `expect_body_matches <name> <regex> <curl args...>` (case-insensitive extended regex)
- `expect_sse_events <name> <min events> <curl args...>`

Prefer positive checks (`Name: request` with `yes`). A `no` check also passes on an empty or failed response, so pair it with a `yes` check on the same request.

When you add a route to the Caddyfile, add a test for it here too. Also add a wrong-method test: the gateway matches on method as well as path, so a missing method shows up as a `404`.
