# Gateway test stubs

Automated tests for the Caddy gateway (`infra/caddy/Caddyfile`). They run the real gateway config against stand-in services, so the gateway can be tested and reviewed before the auth, pickup, notification and frontend services are ready.

The tests cover the gateway rules in section 5 of the communication contracts (`messages_details.md`): routing, `forward_auth`, header stripping, `X-Request-Id`, and SSE streaming.

## Prerequisites

- Docker with Compose v2 (`docker compose`)
- bash and curl
- Port `3030` free on your machine

## Run

From anywhere in the repo:

```bash
./infra/caddy/testing/test.sh
```

The script validates the Caddyfile, starts the stack, runs all tests, prints a summary and removes all containers on exit (including on failure or Ctrl-C). It exits with `0` if everything passed and `1` otherwise, so it can also run in CI.

## Files

| File | Purpose |
|---|---|
| `test.sh` | Starts the stack, runs the tests, cleans up |
| `compose.test.yml` | The gateway plus stub services |
| `compose.sse.yml` | Override that swaps `notification` for the SSE stub |
| `auth-stub.Caddyfile` | Stubbed auth service (`/verify` and `/api/session`) |
| `sse-stub-script.sh` | Stubbed SSE stream for `/api/events` |

## How the stack is set up

| Service | Image | Role |
|---|---|---|
| `gateway` | `caddy:2` | The real `infra/caddy/Caddyfile`; the only service with a published port (`3030 → 443`) |
| `auth` | `caddy:2` | Fake auth service (see [Fake credentials](#fake-credentials)) |
| `pickup`, `notification`, `frontend` | `traefik/whoami` | Echo servers: the response body shows their name (e.g. `Name: pickup`) and every request header they received |

There are two networks:

- `internal` (`internal: true`): all stubs. No published ports and no outbound access.
- `public`: the gateway only, so it can publish its port.

The gateway is attached to both. This mirrors contract 5.8: only the gateway is reachable from outside.

The gateway uses Caddy's local certificate for `localhost`, so the tests call curl with `-k`.

## Fake credentials

The auth stub accepts the credentials below and returns the matching `X-User-Id` / `X-User-Roles`. Anything else gets `401`.

| Credential | `X-User-Id` | `X-User-Roles` |
|---|---|---|
| `Authorization: Bearer good-resident` | `resident-id-1` | `resident` |
| `Authorization: Bearer good-volunteer` | `volunteer-id-1` | `volunteer` |
| `Cookie: session=good-resident` | `resident-id-1` | `resident` |
| `Cookie: session=good-volunteer` | `volunteer-id-1` | `volunteer` |

`POST /api/session` returns `204` with `Set-Cookie: session=good-resident`. `DELETE /api/session` returns `204`.

## What is tested

| Group | Checks |
|---|---|
| Routing | `/api/categories`, `/api/requests`, `/api/profile` → pickup; `/api/events`, `/api/notifications`, `/api/push/subscriptions` → notification; other paths → frontend; unknown `/api/*` → `404`; `/verify` is not exposed (`404`) |
| Auth | No credentials → `401` from auth, passed through as-is; bearer token and session cookie both work; `/api/session` works without credentials |
| Spoofing | Client-supplied `X-User-*` headers are stripped, and replaced with the auth service's values on protected routes; a client-supplied `X-Request-Id` is replaced |
| SSE | `/api/events` streams events as they are sent (no buffering), is not compressed even with `Accept-Encoding: gzip`, and requires authentication |

## Why the SSE tests swap the notification stub

`traefik/whoami` responds and closes the connection, so it can't test streaming. For the SSE group, `test.sh` replaces `notification` with `sse-stub-script.sh` (via `compose.sse.yml`). The stub keeps the connection open and sends an `event: notification` every 2 seconds.

Each SSE test reads the stream for 7 seconds and expects at least 2 events. If the gateway buffered the response, none would arrive in time.

The stub is a simple `nc` loop that handles **one connection at a time**. After a client disconnects, it can take up to one event interval (2 s) before it accepts the next connection, so the script waits 3 seconds between SSE tests. Without that wait, the next test gets `502 connection refused`.

## Debugging

- **Keep the containers after a run:** comment out the `trap` line in `test.sh`, then inspect them with
  `docker compose -p ecocollect-gateway-test -f compose.test.yml ps -a` and `... logs <service>`.
- **Gateway debug logs:** uncomment `debug` in the global options of the Caddyfile.
- **Merged SSE config:** `docker compose -f compose.test.yml -f compose.sse.yml config`
- **Stub script syntax:** `sh -n sse-stub-script.sh`
- **Manual cleanup:** `docker compose -p ecocollect-gateway-test -f compose.test.yml down -v --remove-orphans`

## Adding a test

Use one of the helpers in `test.sh`:

- `expect_status <name> <status> <curl args...>`
- `expect_body_contains <name> <needle> yes|no <curl args...>` (add `-i` to also search the response headers)
- `expect_sse_events <name> <min events> <curl args...>`

Prefer positive checks (`Name: pickup` with `yes`). A `no` check also passes on an empty or failed response, so pair it with a `yes` check on the same request.
