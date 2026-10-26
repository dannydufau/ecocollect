# EcoCollect contracts (Oct 28)

One working flow for the Oct 28 demo: **a resident creates a request, volunteers are notified over SSE, and the screen refetches.**

The messages themselves are written as specs, so this page only covers the flow around them:

| File | What is in it |
|---|---|
| [openapi.yaml](./openapi.yaml) | The public API through the gateway: sessions, requests, the event stream |
| [asyncapi.yaml](./asyncapi.yaml) | The `RequestCreated` event on RabbitMQ and the SSE signal message |
| [schemas/common.yaml](./schemas/common.yaml) | Definitions both specs share (pickup window, postal code, timestamp, status) |

Everything not needed for this flow is in [Deferred](#deferred) at the bottom.

## Checking the specs

```bash
npm install
npm test        # examples, rules and docs agree with each other
npm run lint    # Redocly for OpenAPI, AsyncAPI CLI for AsyncAPI
```

If you change a spec, `npm test` tells you what else has to change with it.

## The flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant C as Caddy
    participant A as Auth
    participant P as Pickup service
    participant DB as Postgres
    participant MQ as RabbitMQ
    participant N as Notification service

    B->>C: POST /api/session (ID token)
    C->>A: swap token for cookie
    A-->>B: Set-Cookie session
    B->>C: GET /api/events (cookie)
    C->>A: GET /verify
    A-->>C: 200 + X-User-Id, X-User-Roles
    C->>N: open stream

    B->>C: POST /api/requests (Bearer token)
    C->>A: GET /verify
    A-->>C: 200 + X-User-Id, X-User-Roles
    C->>P: create requests
    P->>DB: requests, windows, history, outbox (one transaction)
    P-->>B: 201
    P->>MQ: RequestCreated (from the outbox)
    MQ->>N: RequestCreated
    N-->>B: SSE signal to the resident and the matched volunteers
    B->>C: GET /api/requests?view=...
    C->>P: list
    P-->>B: fresh data
```

1. **Login.** The browser signs in with the Firebase client SDK and reads the roles from the token.
2. **Session.** It calls `POST /api/session` once, then opens the SSE stream. This is the only reason sessions exist: `EventSource` can't send an `Authorization` header, but browsers send cookies by themselves.
3. **Create.** A resident posts the request. Caddy checks the token first, then the pickup service saves one request per category and one outbox row for each, all in one transaction.
4. **Publish.** A loop in the pickup service sends the outbox rows to RabbitMQ and marks them sent only after RabbitMQ confirms. An event is never lost before it reaches RabbitMQ. After that each consumer decides what it needs.
5. **Notify.** The notification service has no database. It writes an SSE signal to each open connection of the resident and of every matched volunteer, then acknowledges the message. Anyone offline gets nothing. They catch up because the frontend refetches every time the stream opens.
6. **Refresh.** The SSE message is only a signal. The frontend refetches `GET /api/requests` to show the real data.

## Conventions

- All REST traffic goes through the gateway at `/api/*`. Bodies are JSON.
- Timestamps are ISO 8601 in UTC with a `Z` (`2026-10-28T16:15:00Z`) and stored as `timestamptz`. The frontend converts to Calgary time only for display.
- The exception is a pickup window: a Calgary date plus a start hour (`{ "date": "2026-10-30", "startHour": 14 }` is 14:00 to 15:00 Calgary time), with no time zone, because it is a local hour and not an instant.
- Roles live in Firebase custom claims: `{ roles: ["resident"] | ["volunteer"] | ["resident","volunteer"] }`.
- Events change carefully. Consumers ignore fields they don't know, so adding a field is safe and keeps `version: 1`. Removing a field or changing what one means gets a new `version`.
- A **signal** is the live "refetch now" ping sent over SSE, and it is never saved. A **notification** would be a stored inbox record, which is deferred.
- **No street address ever appears in an event, an SSE message or a volunteer's list.**
- Each service writes only its own tables.
- Caddy is the gateway and the only publicly exposed service. It serves the Next.js frontend and `/api/*` on one origin. Auth is the only backend component that talks to Firebase.

## Setup (manual, one time)

| # | Step | How |
|---|---|---|
| 1 | Roles on Firebase users | The seed script calls `setCustomUserClaims(uid, { roles })`. New claims reach the frontend on the next token refresh (about 1 hour). To apply them now, call `currentUser.getIdToken(true)` and then `POST /api/session` again so the cookie has them too. |
| 2 | Database rows | The seed script, run as an admin user, creates the tables and seeds profiles (address, postal code, volunteer preferred postal codes) and item categories with their standard weight. It replaces registration for Oct 28. |

The seed script creates the Firebase users and their database rows in one run, so the two can't disagree.

## Frontend and Firebase (client SDK)

| # | Call | Notes |
|---|---|---|
| F1 | `signInWithEmailAndPassword(email, password)` | Login screen |
| F2 | `getIdTokenResult()` | Gives the token and `claims.roles`, to decide which role or roles to offer |
| F3 | `getIdToken()` | Called before each API request. The SDK refreshes the token by itself. |
| F4 | `signOut` | First call `DELETE /api/session`, then `signOut` |

The frontend keeps a fixed list of item categories. The ids must match the seeded categories, which the seed script creates as: `laptops`, `desktops`, `monitors`, `tvs`, `phones`, `tablets`, `printers`, `small-appliances`, `cables-chargers`, `other-electronics`. The last one needs an item description, because the database requires it.

## Gateway (Caddy)

| # | Item | Rule |
|---|---|---|
| G1 | Strip client headers | Delete any incoming `X-User-Id`, `X-User-Roles` and `X-Request-Id` before anything else |
| G2 | `forward_auth` | For every `/api/*` route except `/api/session`, Caddy sends `GET /verify` to the auth service with the original `Authorization` and `Cookie` headers (no body). The original request waits. |
| G3 | The reply | `200` plus `X-User-Id` and `X-User-Roles` (comma separated, empty if none) are copied onto the original request. Any other status, such as `401`, goes back to the browser as it is and the request goes no further. |
| G4 | Added by Caddy | `X-Request-Id` from Caddy's generated id, for tracing in logs |
| G5 | Routing | `/api/session` goes to auth, without `forward_auth`. `/api/requests` goes to the pickup service. `/api/events` goes to the notification service. Everything else goes to the Next.js frontend. |
| G6 | SSE route | `/api/events` goes through `forward_auth` and is proxied as usual, but Caddy must stream `text/event-stream` straight back and keep this route out of any compression rule. |
| G7 | HTTPS | Caddy makes certificates by itself (a local one for `localhost`), which the `Secure` session cookie needs |
| G8 | Trust | The backend services are only reachable on the internal network. They trust `X-User-*` without checking Firebase again. |

## Auth service and Firebase (Admin SDK)

The auth module is the one place that talks to Firebase. Its routes are `POST` and `DELETE /api/session` (public, see the OpenAPI file) and `GET /verify` (internal, only Caddy calls it, never exposed).

| # | Call | When | Notes |
|---|---|---|---|
| A1 | `verifyIdToken(token, true)` | `/verify` with a bearer token | Checks the signature, and also asks Firebase so that disabled users and revoked tokens are rejected. Changing claims alone does not revoke a token. |
| A2 | `createSessionCookie(idToken, { expiresIn })` | `POST /api/session` | Expires in 5 days. Needs a recent sign-in. A bad token gives `401`. |
| A3 | `verifySessionCookie(cookie, true)` | `/verify` with no bearer token (only `GET /api/events`) | Same revocation check as A1 |

`/verify` answers `200` with the two headers, `401` when the credentials are missing or rejected, and `500` when Firebase or our own setup failed. A `500` is not a bad token.

## Pickup service and Postgres

| # | Operation | Notes |
|---|---|---|
| P1 | Read the profile and categories | Address, postal code and standard weights. `profiles` is read-only for Oct 28. |
| P2 | Match volunteers | Volunteers whose saved postal codes include the request's postal code, without the resident. It is a snapshot at creation time. |
| P3 | Create, in one transaction | One request per category, its windows, one status change (`Open`) and one outbox row per request. All or nothing. |
| P4 | Read requests | "Available" means status Open, `expiresAt` in the future, and at least one window whose start (`date` plus `startHour`, from Calgary time) is still in the future. |
| P5 | Outbox poll | `SELECT ... WHERE published_at IS NULL ... FOR UPDATE SKIP LOCKED`, in a loop inside the pickup service |
| P6 | Outbox mark sent | `published_at = now()`, only after RabbitMQ confirms |

`expiresAt` is the created time plus 30 days. It only applies while a request is Open. There is no expiry job for Oct 28: the field is stored now, and "available" already respects it.

## RabbitMQ

The message is described in [asyncapi.yaml](./asyncapi.yaml). The setup:

| Item | Value |
|---|---|
| Exchange | `ecocollect.events`, type `topic`, durable |
| Routing key | `request.created` |
| Queue | One per notification instance, declared by that instance at startup: exclusive, auto-delete, not durable, named by the broker, bound with `request.*`. Every instance gets every event. A shared queue would give each event to only one instance, which may not hold the user's SSE connection. |
| Message | `messageId` is the `eventId`, `application/json`, **persistent**. The notification queues don't keep messages across a restart, but a consumer that needs them to survive (stored notifications, email) can add a durable queue without any change here. |
| Publisher | Publisher confirms on. The outbox row is marked sent only after the confirm. |
| Consumer | Manual ack after the SSE signals are written. Events published while no notification instance is running are dropped, which is fine for signals. |
| Granularity | One event per created request |

## Notification service

A small stateless service with no database for Oct 28. It turns each `RequestCreated` event into SSE signals for the users who are online.

| # | Step | Notes |
|---|---|---|
| N1 | Subscribe | At startup, declare this instance's own queue and bind it to `ecocollect.events` with `request.*`. |
| N2 | Read the recipients from the event | The resident is `data.residentUid` and the volunteers are `data.matchedVolunteerUids`. There is no matching and no lookup here. |
| N3 | Write to the SSE connections | `NEW_MATCHING_REQUEST` to every open connection of each matched volunteer, and `REQUEST_CREATED` to every open connection of the resident. The service keeps a `userId` to connections list in memory. No matched volunteers means only the resident gets a signal. About every 25 seconds the server sends `: ping`, which `EventSource` ignores, to keep proxies from closing the connection and to drop dead ones. |
| N4 | Ack | After the writes. A repeated delivery sends the signal again, which only costs an extra refetch, so there is no check for repeated events. |

## Frontend reactions

| # | Trigger | Action |
|---|---|---|
| R1 | Login succeeds | `POST /api/session`, then open `EventSource('/api/events', { withCredentials: true })` |
| R2 | `POST /api/requests` succeeds | Refetch `["requests","mine"]` |
| R3 | SSE `signal` | `NEW_MATCHING_REQUEST` refetches `["requests","available"]`. `REQUEST_CREATED` refetches `["requests","mine"]`. The message is only a signal and the data always comes from the REST API. |
| R4 | The stream opens (`onopen`), the first time or after a reconnect | Refetch the lists on screen. This is the whole recovery plan: missed signals are not replayed, and `EventSource` reconnects by itself. |
| R5 | A volunteer opens "available" | Call `GET /api/requests?view=available` with no `postalCodes`, to show everything |

## Open points for the team

- **Who gets notified.** The event carries `matchedVolunteerUids`, and issue #25 sends to exactly those uids, so only volunteers in the request's area are notified. The thread also said there is no profile call for Oct 28, so the list shows every available request. If the demo should notify all volunteers, the pickup service should put them all in `matchedVolunteerUids`. Please confirm.
- **Category ids.** The frontend list and the seeded categories must use the same ids (listed under Frontend and Firebase). If the seed script changes them, this list and the frontend need the same change.
- **Where the ID token goes.** `POST /api/session` takes it in the JSON body as `{ "idToken": "..." }`. It is not read from a header.

## Deferred

Not part of Oct 28:

| Item | Plan |
|---|---|
| Browser push notifications | VAPID keys, `POST` and `DELETE /api/push/subscriptions`, the service worker, the "Enable notifications" button, and `web-push` sending in the notification service |
| `GET /api/categories` | The frontend keeps a fixed list |
| `GET /api/profile` | Used to build the default postal code filter for volunteers |
| Stored notifications | An inbox (`GET /api/notifications`, read and unread, cleaning up old ones) only if we decide users need to see what they missed. Oct 28 uses signals and refetching instead. |
| Request expiry | A scheduler marks Open requests Expired when `expiresAt` passes and publishes `RequestExpired` |
| Registration | Replaces manual claims and seeded profiles |
| Photos | Upload on request creation |
