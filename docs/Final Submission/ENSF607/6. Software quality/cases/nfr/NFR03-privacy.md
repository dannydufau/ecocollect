# NFR03 — Privacy: test cases

## Requirement

From [Non-functional requirements](../../../2.%20Non-functional%20requirements/README.md):

> The system shall protect private user information, exact pickup addresses, and delivery evidence by restricting access to authorized participants. Exact pickup addresses shall be visible only to the request owner and the Volunteer whose assignment is active (accepted and not yet collected). Item photographs shall be visible to the request owner and all Volunteers while the request is Open, then to the owner and the assigned Volunteer. Delivery evidence shall be visible only to the request owner and the delivering Volunteer.
>
> The system shall remove location metadata from uploaded photographs and prevent sensitive information, including exact street addresses and photograph links, from being exposed through public interfaces, event messages, and notifications.

## Strategy

The criteria come from the requirement's wording and are named with the security sub-characteristic of ISO/IEC 25010:2011 [1] that privacy falls under, confidentiality. Existing tests are cited first; the remaining gaps are ranked by risk (impact × likelihood).

**Scope:** this file scripts the event and notification path (C5), which the Notification Service owns: NFR03-P1 and NFR03-P2. Every other claim is listed with the evidence that exists, or as not yet scripted with its risk.

## Criteria and evidence

| # | Criterion | ISO/IEC 25010 [1] | Evidence | Gap and risk |
| --- | --- | --- | --- | --- |
| C1 | A street address is visible only to the request owner and the Volunteer with an active assignment | Confidentiality | `backend/test/request/get-detail.test.ts`, "the owner gets the full detail; a volunteer on an Open request gets no address or history" and "another resident, a cancelled volunteer and a malformed id all get the same 404" | Partly covered. Not yet scripted: the address is hidden again once the request is Collected. Risk: high impact, low likelihood |
| C2 | Item photos are visible to the owner and all Volunteers while Open, then to the owner and the assigned Volunteer | Confidentiality | – | Not yet scripted. Risk: medium impact, low likelihood |
| C3 | Delivery evidence is visible only to the owner and the delivering Volunteer | Confidentiality | `backend/test/request/uploads.test.ts`, "evidence: 403 before collection; 200 after, in the request folder; 404 for another volunteer or an unknown request; 400 without requestId" (who can upload it) | Partly covered: upload only, not who can view it. Risk: medium impact, low likelihood |
| C4 | Location metadata is removed from uploaded photos | Confidentiality | `frontend/lib/upload/prepare-image.ts` redraws each photo before upload, which drops its EXIF data. A browser test (`frontend/e2e/nfr03-photo-metadata.pw.ts`) is written but parked: not yet confirmed and not counted here | Not yet scripted. Risk: high impact (a home location), medium likelihood. Flagged to the frontend team |
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

## References

[1] ISO/IEC 25010:2011, *Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — System and software quality models*.

## Results

Record one row per run. A planned case is not a pass until it has a row here.

| Case | Date | Commit | Command or steps | Result |
| --- | --- | --- | --- | --- |
| NFR03-P1, NFR03-P2 | | | `npm test` in `backend/` | |
| Supporting: contract tests | | | `npm test` in `contracts/` | |