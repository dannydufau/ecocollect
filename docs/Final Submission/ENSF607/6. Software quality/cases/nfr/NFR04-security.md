# NFR04 — Security: test cases

## Requirement

From [Non-functional requirements](../../../2.%20Non-functional%20requirements/README.md):

> The system shall protect user accounts, sensitive information, and protected operations through secure password storage, authenticated access, server-side authorization, input validation, controlled file uploads, and encrypted communication in deployment.

## Strategy

The criteria come from the requirement's wording and are named with the security sub-characteristics of ISO/IEC 25010:2011 [1] (confidentiality, integrity, non-repudiation, accountability, authenticity).

Existing tests are cited first. Following ISO/IEC/IEEE 29119 [2], the remaining gaps are ranked by risk, impact × likelihood, on this scale:

| Level | Impact | Likelihood |
| --- | --- | --- |
| High | Exposes personal data, changes points or money, or breaks a whole service | Untested, and complex, concurrent or driven by outside input |
| Medium | Shows non-identifying data to the wrong person, or blocks one action | Untested but simple |
| Low | Cosmetic | Related behaviour is already tested |

High-risk gaps in the event, notification and messaging paths get scripted cases; other gaps are listed with their rating as not yet scripted.

**Scope:** this file scripts the Notification Service's push path: NFR04-P1 (pushes are signed and encrypted) and NFR04-N1 (the push subscription endpoint rejects unauthenticated and unsafe requests). Every other claim is listed with the evidence that exists, or as not yet scripted with its risk.

## Criteria and evidence

| # | Criterion | ISO/IEC 25010 [1] | Evidence | Gap and risk |
| --- | --- | --- | --- | --- |
| C1 | Passwords are stored securely | Confidentiality | Firebase Authentication stores and checks passwords; the system never receives or stores them | Not testable by the team (outside the system). Covered by design |
| C2 | Protected operations need an authenticated user | Authenticity | NFR04-N1; `infra/caddy/testing/test.sh` (no token → 401 on protected paths; forged `X-User-Id` and `X-User-Roles` headers are replaced or stripped); `backend/test/user/auth/ownership.test.cjs`, "revoked tokens, revoked cookies and disabled accounts still return 401"; `backend/test/notification-events.test.js`, "without X-User-Id the request gets 401 and no stream is opened" | Covered |
| C3 | Each service checks on the server that the caller may act | Confidentiality, integrity | `backend/test/notification-list.test.js`, "N4 marks the caller's own notification read and tells their tabs; anyone else gets 404"; `backend/test/request/uploads.test.ts`, "item photo: 200 for a resident, in their folder; 403 for a volunteer; 400 for a gif" | Covered for notifications and uploads; other Request Service actions are tested in the FR cases |
| C4 | Input is validated | Integrity | NFR04-N1; `backend/test/user/auth/session.test.cjs`, "POST /api/session returns 400 for a body that is not valid JSON"; the 400 cases in the Request Service tests | Covered |
| C5 | File uploads are controlled | Integrity | `backend/test/request/uploads.test.ts`, the item photo and evidence tests (role, request and file type checks) | Covered |
| C6 | Communication is encrypted in deployment | Confidentiality | NFR04-P1; `infra/caddy/testing/test.sh` runs every check against the gateway over HTTPS | Partly covered. Not yet scripted: traffic between services and RabbitMQ is plain AMQP on the internal Docker network; broker TLS is a planned follow-up. Risk: medium impact (internal network only), low likelihood |

## Cases

### NFR04-P1: A push is signed and encrypted (C6, basic flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Start a fake push service and save one browser subscription that points at it | The user has one subscription |
| 2 | Send a push with the title "New pickup near you" | One push is delivered |
| 3 | Read the request the push service received | It is a POST with `Content-Encoding: aes128gcm` and a VAPID `Authorization` header signed with the server's key |
| 4 | Search the received body for the title | The text is not there: only the browser can decrypt it |

**Expected result:** every push is signed by the server and encrypted for the browser, so the push service relaying it cannot read it.

**Postcondition:** none (the fake service is closed).

**Verification:** `backend/test/notification-push.test.js`, "the sender POSTs a signed, encrypted push to each of the user's browsers".

### NFR04-N1: The push subscription endpoint rejects unauthenticated and unsafe requests (C2, C4, alternate flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | POST a valid subscription with no `X-User-Id` | 401 |
| 2 | POST a subscription with only an endpoint, no keys | 400 |
| 3 | POST a subscription whose endpoint is `http://postgres:5432/x` | 400: an endpoint must be HTTPS on a push-service host, so the server cannot be made to call an internal address |
| 4 | POST a valid subscription as the user, then DELETE it | 201, then 204; the user has no subscriptions left |

**Expected result:** only an authenticated user can register a push endpoint, and only a real push service's HTTPS address is accepted.

**Postcondition:** none (in-memory store).

**Verification:** `backend/test/notification-push.test.js`, "POST /api/push/subscriptions saves the caller's subscription, DELETE removes it".

## References

[1] ISO/IEC 25010:2011, *Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — System and software quality models*.

[2] ISO/IEC/IEEE 29119, *Software and systems engineering — Software testing* (Part 1: General concepts, 2022).

## Results

Record one row per run. A planned case is not a pass until it has a row here.

| Case | Date | Commit | Command or steps | Result |
| --- | --- | --- | --- | --- |
| NFR04-P1, NFR04-N1 | | | `npm test` in `backend/` | |
| Supporting: gateway | | | `./infra/caddy/testing/test.sh` (needs Docker) | |
