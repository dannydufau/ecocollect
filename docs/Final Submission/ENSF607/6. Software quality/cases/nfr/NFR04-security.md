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

**Scope:** this file scripts the Notification Service's push path: NFR04-P1 (pushes are signed and encrypted) and NFR04-N1 (the push subscription endpoint rejects unauthenticated and unsafe requests). It is chosen because it carries the highest impact on the scale: it is the only place the system sends user data to an outside service, and the only place it accepts an address that the server will then call. NFR04-P2 adds the Notification Service's connection to RabbitMQ, encrypted when the stack is started with the TLS Compose file. Every other claim is listed with the evidence that exists, or as not yet scripted with its risk.

## Criteria and evidence

| # | Criterion | ISO/IEC 25010 [1] | Evidence | Gap and risk |
| --- | --- | --- | --- | --- |
| C1 | Passwords are stored securely | Confidentiality | Firebase Authentication stores and checks passwords; the system never receives or stores them | Not testable by the team (outside the system). Covered by design |
| C2 | Protected operations need an authenticated user | Authenticity | NFR04-N1; `infra/caddy/testing/test.sh` (no token → 401 on protected paths; forged `X-User-Id` and `X-User-Roles` headers are replaced or stripped); `backend/test/user/auth/ownership.test.cjs`, "revoked tokens, revoked cookies and disabled accounts still return 401"; `backend/test/notification-events.test.js`, "without X-User-Id the request gets 401 and no stream is opened" | Covered |
| C3 | Each service checks on the server that the caller may act | Confidentiality, integrity | `backend/test/notification-list.test.js`, "N4 marks the caller's own notification read and tells their tabs; anyone else gets 404"; `backend/test/request/uploads.test.ts`, "item photo: 200 for a resident, in their folder; 403 for a volunteer; 400 for a gif" | Covered for notifications and uploads; other Request Service actions are tested in the FR cases |
| C4 | Input is validated | Integrity | NFR04-N1; `backend/test/user/auth/session.test.cjs`, "POST /api/session returns 400 for a body that is not valid JSON"; the 400 cases in the Request Service tests | Covered |
| C5 | File uploads are controlled | Integrity | `backend/test/request/uploads.test.ts`, the item photo and evidence tests (role, request and file type checks) | Covered |
| C6 | Communication is encrypted in deployment | Confidentiality | NFR04-P1; NFR04-P2; `infra/caddy/testing/test.sh` runs every check against the gateway over HTTPS | Partly covered. The Notification Service's connection to RabbitMQ uses TLS when the stack is started with `docker-compose.tls.yml` (opt-in; development certificates from `infra/rabbitmq/gen-certs.sh`). Not yet covered: the other services still use plain AMQP on the internal Docker network, and the default stack does not use TLS. Each could switch the same way, since every connection is opened in `backend/src/messaging/connection.js`, except the Request Service's relay, which has its own connection. Risk: medium impact (internal network only), low likelihood |

## Cases

### NFR04-P1: A push is signed and encrypted (C6, basic flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Start a fake push service and save one browser subscription that points at it | The user has one subscription |
| 2 | Send a push with the title "New pickup near you" | One push is delivered |
| 3 | Read the request the push service received | It is a POST with `Content-Encoding: aes128gcm` and a VAPID `Authorization` header signed with the server's key |
| 4 | Search the received body for the title | The text is not there: only the browser can decrypt it |

**Expected result:** every push is signed by the server and encrypted for the browser, so the push service relaying it cannot read it. This is the contract's push rule (13.4): the payload is encrypted with the subscription keys.

**Postcondition:** none (the fake service is closed).

**Verification:** `backend/test/notification-push.test.js`, "the sender POSTs a signed, encrypted push to each of the user's browsers".

### NFR04-P2: The Notification Service's connection to RabbitMQ is encrypted (C6, basic flow)

**Preconditions:** a checkout of the #505 branch; `npm ci` run in `backend/`. For steps 4 and 5, Docker and `infra/rabbitmq/gen-certs.sh` run once.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Open a connection to an `amqps://` URL with the CA file set | The connection trusts only certificates signed by that CA |
| 2 | Open a connection to a plain `amqp://` URL | Nothing extra is passed: the other services connect as before |
| 3 | Read the merged Compose settings of `docker-compose.tls.yml` | Only `notification` and `rabbitmq` change: the Notification Service uses `amqps://…@rabbitmq:5671` with the CA mounted; RabbitMQ keeps 5672 and adds a TLS listener on 5671 |
| 4 | Start the stack with `docker compose -f docker-compose.yml -f docker-compose.tls.yml up --build`, then run `docker compose exec rabbitmq rabbitmqctl list_connections peer_host ssl ssl_protocol` (or open the management UI's Connections tab) | Only the Notification Service's connection shows TLS (`true`, `tlsv1.3`); the other services' connections are plain. Its log shows `[subscriber] consuming notification.events` and no connection error |
| 5 | From the host, run `openssl s_client -connect localhost:5671 -CAfile infra/rabbitmq/certs/ca.pem`, then again with a different CA file | Verify return code 0 (ok), then a verify error: a certificate not signed by our CA is not trusted |

**Expected result:** with the TLS Compose file, the Notification Service receives events over an encrypted connection, it accepts only the broker certificate signed by our CA, and the other services are unchanged.

**Postcondition:** `docker compose down` (the certificates stay in `infra/rabbitmq/certs/`, which git ignores).

**Verification:** steps 1–3: `backend/test/broker-tls.test.js` ("an amqps URL with a CA file trusts only that CA; otherwise nothing changes", "openConnection passes the CA to amqplib", "the TLS override moves only the Notification Service to amqps on 5671, with our CA"). Steps 4–5: manual, on the Docker stack.

### NFR04-N1: The push subscription endpoint rejects unauthenticated and unsafe requests (C2, C4, alternate flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | POST a valid subscription with no `X-User-Id` | 401 |
| 2 | POST a subscription with only an endpoint, no keys | 400 |
| 3 | POST a subscription whose endpoint is `http://postgres:5432/x` | 400: an endpoint must be HTTPS on a push-service host, so the server cannot be made to call an internal address |
| 4 | POST a valid subscription as the user, then DELETE it | 201, then 204; the user has no subscriptions left |

**Expected result:** only an authenticated user can register a push endpoint, and only a real push service's HTTPS address is accepted. Steps 1, 2 and 4 are the contract's N6 and N7 (201, or 400 and 401; DELETE 204). Step 3 goes further than N6: the server later sends pushes to this address, so limiting it to push-service hosts stops it being pointed at an internal service (server-side request forgery).

**Postcondition:** none (in-memory store).

**Verification:** `backend/test/notification-push.test.js`, "POST /api/push/subscriptions saves the caller's subscription, DELETE removes it".

## References

[1] ISO/IEC 25010:2011, *Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — System and software quality models*.

[2] ISO/IEC/IEEE 29119, *Software and systems engineering — Software testing* (Part 1: General concepts, 2022).

## Results

Record one row per run. A planned case is not a pass until it has a row here.

| Case | Date | Commit | Command or steps | Result |
| --- | --- | --- | --- | --- |
| NFR04-P1, NFR04-N1, NFR04-P2 (steps 1–3) | 2026-11-27 | `47f65d1` | `npm test` in `backend/` | Pass (198 pass, 0 fail) |
| NFR04-P2 (step 4) | 2026-11-27 | `47f65d1` (run before the rebase onto `main`; same TLS files) | Docker stack with `docker-compose.tls.yml`; `rabbitmqctl list_connections` and the management UI | Pass: 1 of 8 connections on TLS 1.3 (the Notification Service, `172.18.0.8`), 7 plain; `consuming notification.events`, no connection error; events received over it |
| NFR04-P2 (step 5) | | | `openssl s_client` | Not run |
| Supporting: gateway | | | `./infra/caddy/testing/test.sh` (needs Docker) | |
