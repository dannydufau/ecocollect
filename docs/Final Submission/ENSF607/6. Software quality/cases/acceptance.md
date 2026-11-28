# Acceptance tests: the whole system, as a user sees it

The FR cases check each requirement on its own: one service's tests, or the frontend against the mock API. These cases check the services working together on the real stack: the Request Service publishes events through RabbitMQ, and the Notification and Reward Services consume them and update both users' browsers live. Each case is one user story from start to finish, in two browsers at once.

| Case | Flow | Requirements it passes through |
| --- | --- | --- |
| AT-1 | Basic flow: a request is created, accepted, collected and delivered, and EcoPoints are awarded | FR06–FR08, FR12, FR13, FR15, FR17, FR18, FR19 |
| AT-2 | Alternate flow: the Volunteer cancels the assignment before collection | FR12, FR13, FR14, FR19 |
| ST-1 | System test under failure: a request is created while RabbitMQ is down | FR06, FR12, FR19; NFR06 (reliability) |

Run the cases in this order: AT-1 and AT-2 with nothing injected, so a failure means a bug; then ST-1, which stops RabbitMQ on purpose.

**Shared preconditions (all cases):**
- The full stack is set up and running as in the root README, [Run everything with Docker](../../../../../README.md#run-everything-with-docker): `.env` filled in (including the ImageKit and VAPID keys), the database loaders run as step 3 describes (the User Service loader takes only the two variables it lists), and every service healthy (`docker compose ps`).
- Two accounts registered in the app: **Resident** (role Resident, with an address) and **Volunteer** (role Volunteer). They use separate browser sessions, because Firebase keeps one sign-in per site: the Resident in one browser profile, the Volunteer in a second profile or another browser. Not a private window: private windows don't support push notifications, which steps 2, 4 and 7 of AT-1 check.
- On the Volunteer's Profile, under Preferred postal codes, the Resident's postal code is added exactly as it appears on the Resident's address. Matching is an exact 6-character match (contract 10.3).
- Check both from the repo root with `bash scripts/peek.sh --accounts`: the Resident is listed with a `home_postal`, and the Volunteer's `saved_codes` include that exact code.
- Both users are signed in, with device notifications turned on.
- The two windows sit side by side. In a "without reloading" step, check the watching window without clicking into it first: switching to a window refetches its lists from the database, which would hide whether the live update worked.

### AT-1: A request goes from creation to delivery, and both users see each step live (basic flow)

**Preconditions:** the shared preconditions. The Volunteer has Available requests open; the Resident has My requests open.

| # | Actor | Action | Expected result |
| --- | --- | --- | --- |
| 1 | Resident | Choose New request: one category, quantity 2, a photo, one future pickup window; accept the terms and choose Confirm and send | The request is listed as Open in My requests |
| 2 | Volunteer | Watch Available requests, without reloading | The new request appears within a few seconds, and a notification for it appears (in Notifications, and as a device notification if the tab is not focused) |
| 3 | Volunteer | Open the request, choose Accept request, pick the window, accept the terms and confirm | The request is Assigned, and the Volunteer sees the pickup address |
| 4 | Resident | Watch the request, without reloading | It changes to Assigned, showing the Volunteer and the chosen window, and the Resident gets an "assigned" notification |
| 5 | Resident | Choose Confirm collected | The request is Collected; the Volunteer's view of it changes to Collected without reloading |
| 6 | Volunteer | Choose Record delivery: a facility that accepts the category and a delivery photo | The request is Delivered to that facility |
| 7 | Resident | Watch the request, without reloading | It shows Delivered, the facility and the delivery photo, and the Resident gets a "delivered" notification |
| 8 | Both | Open EcoPoints | Each has an "EcoPoints awarded" notification. The Volunteer received 3 × quantity + 4 × estimated weight (kg), and the Resident exactly half of that (contract example: 2 laptops at 5.0 kg gives 26 and 13) |

**Expected result:** every step one user takes reaches the other user's browser live, through RabbitMQ and the Notification Service, with no reload. The delivery leads to the EcoPoints award through the Reward Service.

**Postcondition:** the request stays Delivered and both awards stay recorded. Use a new request for the next run.

**Verification:** manual, on the Docker stack, in two browser sessions. Record screenshots of steps 2, 4, 7 and 8.

### AT-2: The Volunteer cancels before collection, and the request is open again for everyone (alternate flow)

**Preconditions:** the shared preconditions. The Resident has a new Open request (AT-1 steps 1–2), and the Volunteer has accepted it (AT-1 step 3). The request's pickup window starts no earlier than tomorrow, so it is still in the future after the cancellation: a cancellation at or after the window's start expires the request instead of reopening it (contract event E10).

| # | Actor | Action | Expected result |
| --- | --- | --- | --- |
| 1 | Volunteer | On the Assigned request, choose Cancel assignment, give a reason and confirm | The request leaves the Volunteer's active assignments |
| 2 | Resident | Watch the request, without reloading | It is Open again, and the Resident gets a notification that the Volunteer cancelled |
| 3 | Volunteer | Go to Available requests | The request is listed again and can be accepted |
| 4 | Both | Open EcoPoints | No new award for this request: only a late cancellation by the Resident (within 24 hours of the selected window) earns points, for the Volunteer (contract 12.4, events E6 and E12) |

**Expected result:** a Volunteer's cancellation puts the request back on the market at once. The Resident is told, and no points are awarded.

**Postcondition:** the request is Open. Cancel it as the Resident, or let it expire.

**Verification:** manual, on the Docker stack, in two browser sessions. Record screenshots of steps 2 and 4.

## System test under failure

The acceptance tests show what users see. This case checks what happens inside when a dependency fails: the Request Service writes each event to its outbox table in the same transaction as the change, and a publisher sends it to RabbitMQ afterwards. No automated test stops the broker under the Request Service's publisher, so this case does it on the stack.

`bash scripts/peek.sh [requestId]` prints one request's rows across the services' tables (the newest request if no id is given); `--accounts` lists the accounts, their roles and postal codes. It only reads; it never stops or changes anything. Its times are the database container's clock (usually UTC).

### ST-1: A request created while RabbitMQ is down is saved, and its event is published when RabbitMQ is back (alternate flow)

**Preconditions:** the shared preconditions. Run ST-1 only on an isolated stack that nobody else is using: stopping RabbitMQ interrupts every service's messaging. The Volunteer has Available requests open. A terminal at the repo root follows the Request Service's log: `docker compose logs -f request`.

| # | Actor | Action | Expected result |
| --- | --- | --- | --- |
| 1 | Operator | `docker compose stop rabbitmq` | RabbitMQ stops. The Request Service's relay logs one line ending in `(retrying every tick)`: it cannot reach the broker and tries every second (logged once, before any request exists). The other services log that they lost the broker |
| 2 | Resident | Create a request in the Volunteer's postal code (as in AT-1 step 1), then open it and record its ID: the last part of the address, `/resident/requests/<requestId>` | The request is saved and listed as Open in My requests: creating a request does not depend on RabbitMQ |
| 3 | Operator | `bash scripts/peek.sh <requestId>` | Status Open; the Request Service outbox has this request's `RequestCreated` row with `published_at` empty (`-`). The backlog line counts at least this event (it counts unsent events of every request). The event is saved and waiting; nothing changes for as long as RabbitMQ stays down |
| 4 | Volunteer | Wait 30 seconds, then reload Available requests | No notification arrives. After the reload the request is listed: lists are read from the database, so only the live signal waits for RabbitMQ (switching to the window also refetches the list) |
| 5 | Operator | `docker compose start rabbitmq` | Once RabbitMQ is ready (about 10–20 seconds), the Request Service logs `request publisher: working again` |
| 6 | Operator | `bash scripts/peek.sh <requestId>` | The same `RequestCreated` row (same `seq` and `enqueued` time as in step 3) now has a `published_at` time: RabbitMQ confirmed it. The Volunteer's `NEW_MATCHING_REQUEST` notification is listed |
| 7 | Volunteer | Watch Notifications, without reloading | The new-request notification arrives |

**Expected result:** the request is saved while the broker is down, and anyone who loads the list sees it. Its event waits in the outbox, with no time limit and nothing rolled back, and is published once the broker is back, so the notification is late but not lost.

**Recovery (always, even if the run fails or is interrupted):** `docker compose start rabbitmq`, then `docker compose ps` until RabbitMQ is healthy and every service is running. The Request Service log has no new `(retrying every tick)` line.

**Postcondition:** the stack is back to normal (see Recovery). The request is Open: cancel it as the Resident, or use it for another case.

**Verification:** manual, on the Docker stack. Record screenshots of steps 3, 6 and 7, and the two Request Service log lines.

## Results

Record one row per run. A planned case is not a pass until it has a row here.

| Case | Date | Commit | Command or steps | Result |
| --- | --- | --- | --- | --- |
| AT-1 | | | Docker stack, two browser sessions | Not run |
| AT-2 | | | Docker stack, two browser sessions | Not run |
| ST-1 | | | Docker stack, `docker compose stop/start rabbitmq`, `scripts/peek.sh` | Not run |
