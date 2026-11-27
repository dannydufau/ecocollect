# NFR05 — Fairness: test cases

## Requirement

From [Non-functional requirements](../../../2.%20Non-functional%20requirements/README.md):

> The system shall apply consistent request discovery, pickup acceptance, assignment, and EcoPoints rules to all eligible users. Delivery EcoPoints and cancellation EcoPoints shall be calculated according to the same approved rules for every eligible user, without hidden priority or additional rewards based on account identity or saved pickup-region preferences.

## Strategy

ISO/IEC 25010 has no fairness characteristic, so the basis is fairness testing as defined by de Souza Santos et al. [1]: "the process of verifying and validating the software to reveal fairness bugs", where a fairness bug is a flaw that causes a discrepancy between the software's actual behaviour and its fairness conditions. The paper notes that fairness testing can be applied to non-ML components, such as EcoCollect's rules. The fairness conditions below come from the requirement's wording.

Two strategies practitioners report in the paper are used here. Manipulating user attributes: NFR05-N1 runs the same delivery and the same late cancellation for different accounts and saved pickup regions. Exploratory testing, an experience-based technique in ISO/IEC/IEEE 29119 [2]: NFR05-E1 explores discovery and acceptance, where unfairness could come from features combining rather than from one rule. Fairness-oriented exploratory charters are also what the Bita assistant from the same research group generates [3].

Existing tests are cited first. Following ISO/IEC/IEEE 29119 [2], the remaining gaps are ranked by risk on the scale in [NFR03](NFR03-privacy.md#strategy).

**Scope:** the EcoPoints rules (F3, F5) are scripted: NFR05-P1 cites the Reward Service's test and NFR05-N1 is new. Discovery and acceptance (F1, F2) are explored in NFR05-E1. Simultaneous accepts (F2) are tested in NFR06-P2.

## Fairness conditions and evidence

| # | Fairness condition | Evidence | Gap and risk |
| --- | --- | --- | --- |
| F1 | Every eligible Volunteer sees the same Open requests; the only filter is the postal codes they choose | `backend/test/request/list-available.test.ts`, "200 in the contract shape, Open requests only; postalCodes filters on the pickup code". By design, the query (`requests.req_list_available`) receives only the chosen postal codes, never the caller's account, and orders by creation time. This is the contract's discovery rule (Q6): Available means Open and not yet expired, filtered only by the postal codes the Volunteer chooses, and it includes the Volunteer's own requests; NFR05-E1 | Covered |
| F2 | Acceptance and assignment follow the same rules for everyone: the first valid accept wins, with one active assignment per request | `backend/test/request/accept.test.ts`, "201 with the detail as the assigned volunteer; a second volunteer then gets 409 already_assigned" | Covered, including accepts at the same moment: [NFR06-P2](NFR06-reliability.md). Explored in NFR05-E1 |
| F3 | Delivery points come only from the request: Volunteer = 3 × quantity + 4 × weight (kg); the Resident gets exactly half | NFR05-P1 | Covered |
| F4 | Cancellation points follow one rule: when the Resident cancels an Assigned request within 24 hours of its selected window, the Volunteer gets one award; an earlier cancellation gives none, and so does cancelling one's own request (contract 12.4 and 15.2, events E6 and E12) | `backend/test/reward-handlers.test.js`, "late cancellation: one award for the volunteer", "early cancellation: no points", "cancellation of your own request: no points" | Covered |
| F5 | No hidden priority or extra reward based on account identity or saved pickup regions | NFR05-N1 (EcoPoints); NFR05-E1 (discovery and acceptance) | Covered for EcoPoints; explored for discovery and acceptance |

The rule "cancelling one's own request gives no points" (F4) compares the Volunteer with the Resident, so it does look at identity. It is an approved rule that applies the same way to every account, not a hidden preference. Self-delivery works the other way: an account with both roles that delivers its own request earns both awards (26 + 13 = 39 for the contract example). This is also an approved rule (BR11, BR55), applied the same way to every account with both roles.

## Cases

### NFR05-P1: Delivery points follow the approved formula (F3, basic flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Calculate the points for the contract example: 2 laptops, 5.0 kg | Volunteer 26, Resident 13 |
| 2 | Calculate the points for a range of quantities and weights | The Resident's award is always exactly half the Volunteer's |
| 3 | Pass a quantity below 1, or a weight that is negative or has more than 2 decimals | Rejected |

**Expected result:** delivery points depend only on the request's quantity and weight, by the approved formula.

**Postcondition:** none.

**Verification:** `backend/test/reward-points.test.js`, "the contract example: 2 laptops, 5.0 kg -> 26 and 13", "the resident award is always exactly half", "rejects a quantity that is not a whole number of at least 1" and "rejects a weight that is negative, not a number, or has more than 2 decimals".

### NFR05-N1: Account identity and saved regions do not change the points (F5, alternate flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Build one delivery event (2 laptops, 5.0 kg) for four pairs of accounts: one with no saved regions, one with one, one with three, one with an empty list | – |
| 2 | Pass each to the Reward Service's delivery handler | Every run gives the Volunteer 26 points and the Resident 13, by the same formulas |
| 3 | Repeat with the Resident cancelling the same assignment within 24 hours of its window | Every run gives the Volunteer 26 points |

**Expected result:** the same delivery, or the same late cancellation, earns the same points whoever the accounts are and whatever regions they have saved.

**Postcondition:** none (no database or broker used).

**Verification:** `backend/test/nfr/fairness.test.js`, "NFR05-N1: the same delivery earns the same points for any account or saved region" and "NFR05-N1: the same late cancellation earns the same points for any account or saved region". Checked once by adding a bonus for Volunteers with saved regions to the handler: both tests failed, then passed again after the change was removed.

## Exploratory charter

### NFR05-E1: Fairness of discovery and acceptance across saved regions

Explore request discovery and acceptance as Volunteers with a matching saved region, a different saved region and no saved region, using fairness conditions F1, F2 and F5, to find any priority based on saved pickup regions that the contract and the app do not state.

| | |
| --- | --- |
| **Goal** | Find whether a Volunteer's saved region, or a request's postal code, changes who can find a request, where it is listed, or who can accept it, in a way the rules do not state |
| **Time** | Min. 30 min, max. 60 min |
| **Setup** | The full stack (`docker compose up`); one Resident; three Volunteers: **A** saved the postal code of the first request, **B** saved a different code, **C** saved none |
| **Focus** | (1) Who hears first: create a request in A's code; note who gets a push, an in-app notification and a live list update. (2) Order: create requests in A's code, B's code and a code no one saved, a few minutes apart; check A's and B's filtered lists and C's list. (3) Same view: B clears the filter; compare B's list with C's. (4) Same acceptance: B or C accepts a request in A's code before A does; then A tries |
| **Bugs** | |
| **Notes** | |
| **Improvements** | |

Expected, because the rules state it:

- Only A gets the push and the notification (event E1, `matchedVolunteerUids`: exact postal-code match, on purpose). The profile page says a Volunteer with no saved codes gets no new-request notifications.
- Every list is newest first (Q6, `GET /api/requests`): filtered lists show only their codes, and C's list shows every area. The request in the code no one saved is in C's list.
- B's list without the filter is the same as C's: the same requests in the same order (contract 16.9: the list can always be browsed without the filter). Both lists hide expired requests and include the Volunteer's own requests (Q6).
- B's or C's accept succeeds; A then gets `409 already_assigned` (Q11).

Record as a bug, with the accounts involved and the condition it bears on (F1, F2 or F5):

- A request a Volunteer looks for and cannot find, including after clearing the filter.
- Any list not in creation order, for example the request in the code no one saved placed after newer requests. The cause does not need to be known: a different order means an unstated rule.
- An accept that behaves differently depending on the request's postal code or the Volunteer's saved codes.

A request in a code no one saved reaches Volunteers only when they browse, and sinks as newer requests arrive. Both follow stated rules, so record any effect on its chance of being taken under Improvements, not Bugs.

## References

[1] R. de Souza Santos, M. de Morais Leça, R. Santos and C. Magalhães, "Software Fairness Testing in Practice," 2025. arXiv:2506.17095.

[2] ISO/IEC/IEEE 29119, *Software and systems engineering — Software testing* (Part 1: General concepts, 2022).

[3] K. Johnson, C. Magalhães and R. de Souza Santos, "Bita: A Conversational Assistant for Fairness Testing," 2025. arXiv:2512.05428.

## Results

Record one row per run. A planned case is not a pass until it has a row here.

| Case | Date | Commit | Command or steps | Result |
| --- | --- | --- | --- | --- |
| NFR05-P1 | 2026-11-27 | `69c3679` | `npm test` in `backend/` | Pass (198 passed, 0 failed) |
| NFR05-N1 | 2026-11-27 | `69c3679` | `npm run test:nfr` in `backend/` | Pass (6 passed, 0 failed) |
| NFR05-E1 | – | – | Charter | Not run |
