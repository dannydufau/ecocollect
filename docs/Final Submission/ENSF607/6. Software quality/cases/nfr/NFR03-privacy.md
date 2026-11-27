# NFR03 — Privacy: test cases

## Requirement

From [Non-functional requirements](../../../2.%20Non-functional%20requirements/README.md):

> The system shall protect private user information, exact pickup addresses, and delivery evidence by restricting access to authorized participants. Exact pickup addresses shall be visible only to the request owner and the Volunteer whose assignment is active (accepted and not yet collected). Item photographs shall be visible to the request owner and all Volunteers while the request is Open, then to the owner and the assigned Volunteer. Delivery evidence shall be visible only to the request owner and the delivering Volunteer.
>
> The system shall remove location metadata from uploaded photographs and prevent sensitive information, including exact street addresses and photograph links, from being exposed through public interfaces, event messages, and notifications.

## Strategy

The criteria come from the requirement's wording and are named with the security sub-characteristic of ISO/IEC 25010:2011 [1] that privacy falls under, confidentiality.

Existing tests are cited first. Following ISO/IEC/IEEE 29119 [2], the remaining gaps are ranked by risk, impact × likelihood, on this scale:

| Level | Impact | Likelihood |
| --- | --- | --- |
| High | Exposes personal data, changes points or money, or breaks a whole service | Untested, and complex, concurrent or driven by outside input |
| Medium | Shows non-identifying data to the wrong person, or blocks one action | Untested but simple |
| Low | Cosmetic | Related behaviour is already tested |

High-risk gaps in the event, notification and messaging paths get scripted cases; other gaps are listed with their rating as not yet scripted.

**Scope:** this file scripts the event and notification path (C5), which the Notification Service owns: NFR03-P1 and NFR03-P2. It is chosen because it carries the highest impact on the scale: every event passes through it, and a leak there would send an address or photo link to every matched Volunteer's browser and to an outside push service. NFR03-P3 follows one request from Open to Delivered and checks who sees the address, the photo and the delivery evidence at each step (C1–C3). Photo metadata removal (C4) is listed with the evidence that exists.

## Criteria and evidence

| # | Criterion | ISO/IEC 25010 [1] | Evidence | Gap and risk |
| --- | --- | --- | --- | --- |
| C1 | A street address is visible only to the request owner and the Volunteer with an active assignment | Confidentiality | NFR03-P3; `backend/test/request/get-detail.test.ts`, "the owner gets the full detail; a volunteer on an Open request gets no address or history" and "another resident, a cancelled volunteer and a malformed id all get the same 404" | Covered |
| C2 | Item photos are visible to the owner and all Volunteers while Open, then to the owner and the assigned Volunteer | Confidentiality | NFR03-P3 | Covered |
| C3 | Delivery evidence is visible only to the owner and the delivering Volunteer | Confidentiality | NFR03-P3; `backend/test/request/uploads.test.ts`, "evidence: 403 before collection; 200 after, in the request folder; 404 for another volunteer or an unknown request; 400 without requestId" (who can upload it) | Covered |
| C4 | Location metadata is removed from uploaded photos | Confidentiality | `frontend/lib/upload/prepare-image.ts` redraws each photo before upload, which drops its EXIF data | Not yet scripted. Risk: high impact (a home location), medium likelihood. Flagged to the frontend team |
| C5 | No street address or photo link reaches a public interface, an event message or a notification | Confidentiality | NFR03-P1, NFR03-P2; the contract and User Service tests below | Covered |

Supporting evidence for C5 (not scripted here):

| Path | Test | What it shows |
| --- | --- | --- |
| Event and public schemas | `contracts/test/asyncapi.test.js`, "no street address, notes or photo can travel in an event, SSE message or push (NFR03)"; `contracts/test/openapi.test.js`, "lists, notifications and public data never carry a street address, notes or a photo URL (NFR03)" | No event, SSE, push, list, notification or public response schema has an address, notes or photo field |
| Public stream | `contracts/test/asyncapi.test.js`, "the public stream sends only the two README messages (13.5), with no user data" | The public SSE stream carries no user data |
| User Service events | `backend/test/user/profile-update.test.ts`, "the shared schema enforces role and latest request state, and the event omits address data" | A profile change publishes no address |

## Cases

### NFR03-P1: Private fields in an event never reach a browser (C5, basic flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Build a `RequestCreated` event that also carries a street address, a unit number, a resident name and a photo link | The event has the private fields |
| 2 | Pass it to the Notification Service's `requestCreated` handler | One delivery each for the resident and every matched volunteer |
| 3 | Read each delivery's SSE signal | It has only `requestId` and `type` |
| 4 | Search each delivery's stored notification for the four private values | None of them appears |

**Expected result:** whatever an event carries, the SSE signals and notifications built from it contain no address, name or photo link.

**Postcondition:** none (no database or broker used).

**Verification:** `backend/test/notification-handlers.test.js`, "RequestCreated: private fields never reach a signal or a notification".

### NFR03-P2: A push carries only the fields it needs (C5, basic flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Build a notification about a request | The notification has its full set of fields |
| 2 | Pass it to `pushPayload` | The payload has exactly `notificationId`, `title`, `body`, `url`, `tag` and `silent` |
| 3 | Repeat with a notification about an award | The tag is `award-<id>` instead of `request-<id>` |

**Expected result:** the push sent to a browser's push service carries only a fixed set of fields, so no other field can travel with it.

**Postcondition:** none.

**Verification:** `backend/test/notification-push.test.js`, "pushPayload keeps only what the OS notification needs, tagged by request or award".

### NFR03-P3: Each person sees the address, photo and evidence only while the rules allow (C1, C2, C3, basic flow)

**Preconditions:** the Request Service's test database, built with `backend/scripts/request/load-db.sh --test`; `REQUEST_TEST_DATABASE_URL` set (see `backend/test/request/db.ts`); `npm ci` run in `backend/`. The test uses the fake ImageKit and creates its own request, so it changes none of the seeded ones.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | As the Resident, create a request with an item photo; read it as a Volunteer | The Volunteer sees the photo, not the address |
| 2 | As that Volunteer, accept it; read it as that Volunteer and as another Volunteer | The assigned Volunteer sees the address and the photo; the other Volunteer gets 404 `request_unavailable` |
| 3 | As the Resident, confirm the pickup; read it as the assigned Volunteer | The address is hidden again; the photo is still shown |
| 4 | As the Volunteer, record the delivery with an evidence photo; read it as the Resident, the delivering Volunteer and another Volunteer | The Resident and the delivering Volunteer see the evidence; the other Volunteer gets 404 `request_unavailable` |

**Expected result:** at every step, the address, the item photo and the delivery evidence reach only the people the requirement names.

**Postcondition:** one extra Delivered request stays in the test database; the seeded data is unchanged.

**Verification:** `backend/test/nfr/privacy.test.ts`, "NFR03-P3: the address, photo and delivery evidence reach only the people the rules allow, at each step". Checked once by changing the address rule in a scratch database so it no longer hides the address after collection: the test failed at step 3, then passed again with the rule restored.

## References

[1] ISO/IEC 25010:2011, *Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — System and software quality models*.

[2] ISO/IEC/IEEE 29119, *Software and systems engineering — Software testing* (Part 1: General concepts, 2022).

## Results

Record one row per run. A planned case is not a pass until it has a row here.

| Case | Date | Commit | Command or steps | Result |
| --- | --- | --- | --- | --- |
| NFR03-P1, NFR03-P2 | | | `npm test` in `backend/` | |
| NFR03-P3 | | | `npm run test:nfr` in `backend/`, with `REQUEST_TEST_DATABASE_URL` set | |
| Supporting: contract tests | | | `npm test` in `contracts/` | |
