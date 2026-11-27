# NFR06 — Reliability: test cases

## Requirement

From [Non-functional requirements](../../../2.%20Non-functional%20requirements/README.md):

> The system shall maintain consistent request statuses, Volunteer assignments, delivery records, notifications, and EcoPoints when operations are repeated, performed concurrently, or retried following processing failures. The system shall prevent duplicate Volunteer assignments, duplicate delivery records, and duplicate EcoPoints awards.

## Strategy

The criteria come from the requirement's wording and are named with the reliability and integrity sub-characteristics of ISO/IEC 25010:2011 [1]. Existing tests are cited first. Following ISO/IEC/IEEE 29119 [2], the remaining gaps are ranked by risk on the scale in [NFR03](NFR03-privacy.md#strategy).

**Scope:** this file scripts the messaging path, which every event between services passes through: NFR06-P1 (a redelivered event creates no duplicate notification) and NFR06-N1 (a failing event is retried, then set aside, without blocking the others). It is chosen because it carries the highest impact on the scale: a failure there would repeat or lose notifications and points across every service. NFR06-N2 checks that a late event, one that arrives after a newer one, can't undo the newer state. NFR06-P2 covers the highest-risk gap: Volunteers accepting the same request at the same moment. The other criteria are listed with the evidence that exists.

## Criteria and evidence

| # | Criterion | ISO/IEC 25010 [1] | Evidence | Gap and risk |
| --- | --- | --- | --- | --- |
| R1 | A repeated operation or event changes nothing the second time | Fault tolerance | NFR06-P1; `backend/test/request/requests.test.ts`, "201 in the contract shape; a repeat with the same Idempotency-Key replays the same ids"; `backend/test/request/cleanup.test.ts`, "expires an overdue Open request once; a redelivery changes nothing"; `backend/test/notification-handlers.test.js`, "RequestCreated: a volunteer listed twice gets one delivery" | Covered |
| R2 | An event that fails to process is retried, and one that keeps failing is set aside without blocking or losing the others | Fault tolerance, recoverability | NFR06-N1; `backend/test/subscriber.test.js`, "rejects with requeue when the handler throws, so RabbitMQ retries it" and "reconnects and rebuilds the queue after the connection closes"; `backend/test/integration/subscriber.integration.test.js`, "events published while the subscriber is stopped arrive after it restarts" | Covered |
| R3 | No duplicate Volunteer assignments, including when Volunteers accept at the same moment | Integrity | NFR06-P2; `backend/test/request/accept.test.ts`, "201 with the detail as the assigned volunteer; a second volunteer then gets 409 already_assigned". By design, `requests.req_accept` locks the request row before checking it, so accepts on one request run one after another; the event is written in the same transaction (transactional outbox), so a refused accept publishes nothing | Covered. Was the highest-risk gap: high impact (two Volunteers sent to one pickup, double points), high likelihood (concurrent). Also NFR05-F2 |
| R4 | No duplicate delivery records | Integrity | `backend/test/request/record-delivery.test.ts`, "404 for another volunteer; 409 not_collected; 400 without ImageKit; 200 after collection; then 409" (contract Q15: a second delivery gets `409 already_delivered`). The database allows one delivery per assignment (`delivery_uq1`, unique on `assignment_id`) | Covered |
| R5 | No duplicate EcoPoints awards | Integrity | `backend/test/reward-store.test.js`, "a delivery is saved once, even if the event arrives twice" | Covered |
| R6 | An event that arrives after a newer one for the same request is treated as history: it changes no newer notification and alerts no one | Fault tolerance | NFR06-N2; `backend/test/integration/notification.integration.test.js`, "a late RequestAssigned after RequestAssignmentCollected still expires older matching notices while suppressing its own" (nothing is sent for the late event) | Covered |

## Cases

### NFR06-P1: A redelivered event creates no duplicate notification (R1, basic flow)

**Preconditions:** Docker running; `npm ci` run in `backend/`. The test starts RabbitMQ and Postgres itself.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Publish a `RequestCreated` for a new request, with two matched Volunteers, one of them listening | The Resident and the listening Volunteer each get their notification live; three notification rows are saved for the request (one for the offline Volunteer) |
| 2 | Publish the same event again, as RabbitMQ does on a redelivery | – |
| 3 | Publish a `RequestCreated` for a second request | The Volunteer's open tab receives the second request's notification next, with nothing in between |
| 4 | Count the notification rows for the first request | Still three |

**Expected result:** processing the same event twice saves and sends nothing new. This is the contract's consuming rule (9.4): each consumer records the event id and skips duplicates.

**Postcondition:** the test stops its own services.

**Verification:** `backend/test/integration/notification.integration.test.js`, "a RequestCreated reaches the resident and matched volunteers as signals, notifications and pushes" (its redelivery step).

### NFR06-N1: A failing event is retried, then set aside (R2, alternate flow)

**Preconditions:** as NFR06-P1.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Subscribe with a handler that always throws, and publish one event | The event is delivered again after each failure |
| 2 | Wait for the fifth failure | The event moves to the dead-letter queue and is not delivered again |
| 3 | Publish a message that is not valid JSON | It goes straight to the dead-letter queue, without retries |

**Expected result:** a failing event is retried a bounded number of times, then kept aside for inspection, so it can neither be lost nor block the events behind it. These are the contract's rules 9.5 (retried, then dead-lettered after the fifth failure) and 9.6 (an unusable message goes straight to the dead-letter queue).

**Postcondition:** the test stops its own services.

**Verification:** `backend/test/integration/subscriber.integration.test.js`, "a message whose handler keeps failing is retried, then dead-lettered on the 5th failure" and "an unparseable message goes straight to the DLQ, without retries".

### NFR06-P2: Two Volunteers accept the same request at the same moment (R3, basic flow)

**Preconditions:** the Request Service's test database, built with `backend/scripts/request/load-db.sh --test`; `REQUEST_TEST_DATABASE_URL` set (see `backend/test/request/db.ts`); `npm ci` run in `backend/`. The test creates its own requests, so it changes none of the seeded ones.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | As the Resident, create a new Open request | 201 |
| 2 | Send an accept from two different Volunteers for the same window, both before either answers | One gets 201; the other gets 409 `already_assigned` |
| 3 | Count the request's active assignments in the database | 1 |
| 4 | Read the request's events in the outbox | `RequestCreated`, then one `RequestAssigned`: the refused accept wrote nothing |
| 5 | Repeat steps 1 to 4 ten times | Every round gives the same result |

**Expected result:** whatever the timing, exactly one Volunteer gets the request, and only that assignment is published. This is the contract's concurrency rule (every action on a request starts by locking its row, so actions on one request run one after another), its accept rule (Q11: `409 already_assigned`), and its publishing rule (9.3: the event is written in the same transaction as the change).

**Postcondition:** ten extra Assigned requests stay in the test database; the seeded data is unchanged.

**Verification:** `backend/test/nfr/concurrency.test.ts`, "NFR06-P2: two volunteers accepting the same request at once: one assignment, one event". Checked once by removing the request row lock from `req_accept` in a scratch database: the test failed (both Volunteers got 201), then passed again with the lock restored.

### NFR06-N2: A late event can't undo newer state (R6, alternate flow)

**Preconditions:** as NFR06-P1 (the test uses its database).

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Save a "New pickup near you" notification for a request's event with `requestSeq` 3 | It is saved as current; the event is not late |
| 2 | Save the notifications of a different event for the same request with `requestSeq` 2, as if it arrived late | The event is reported as late |
| 3 | Check what the late event expired | Nothing: a late event may still expire an older "New pickup near you", but never the newer one |
| 4 | Read both events' notifications | The newer ones are still current; the late ones are saved already expired |

**Expected result:** an event that arrives after a newer one is kept as history and can't expire or replace newer notifications. It can still expire notices older than itself (a late `RequestAssigned` still removes an old "New pickup near you"). The Notification Service then sends no signal, notification or push for it. This is the contract's ordering rule (section 11): order by `requestSeq`, not by arrival; a lower `requestSeq` is stored as already expired, with no SSE notification and no push.

**Postcondition:** the test removes the accounts, request and notifications it created.

**Verification:** `backend/test/integration/notification.integration.test.js`, "a late event is saved already expired and expires nothing newer". Checked once by making the store treat every event as current: the test failed at step 2, then passed again with the rule restored. Supporting: "a late RequestAssigned after RequestAssignmentCollected still expires older matching notices while suppressing its own" (same file) checks the older-notice side and that nothing is sent.

## References

[1] ISO/IEC 25010:2011, *Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — System and software quality models*.

[2] ISO/IEC/IEEE 29119, *Software and systems engineering — Software testing* (Part 1: General concepts, 2022).

## Results

Record one row per run. A planned case is not a pass until it has a row here.

| Case | Date | Commit | Command or steps | Result |
| --- | --- | --- | --- | --- |
| NFR06-P1, NFR06-N1, NFR06-N2 | | | `npm run test:integration` in `backend/` (needs Docker) | |
| NFR06-P2 | | | `npm run test:nfr` in `backend/`, with `REQUEST_TEST_DATABASE_URL` set | |
| Supporting tests | | | `npm test` in `backend/` (request and reward-store tests need their test databases) | |
