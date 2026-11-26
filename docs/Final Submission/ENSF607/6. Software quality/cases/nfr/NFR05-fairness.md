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
| F1 | Every eligible Volunteer sees the same Open requests; the only filter is the postal codes they choose | `backend/test/request/list-available.test.ts`, "200 in the contract shape, Open requests only; postalCodes filters on the pickup code". By design, the query (`requests.req_list_available`) receives only the chosen postal codes, never the caller's account, and orders by creation time; NFR05-E1 | Covered |
| F2 | Acceptance and assignment follow the same rules for everyone: the first valid accept wins, with one active assignment per request | `backend/test/request/accept.test.ts`, "201 with the detail as the assigned volunteer; a second volunteer then gets 409 already_assigned" | Covered, including accepts at the same moment: [NFR06-P2](NFR06-reliability.md). Explored in NFR05-E1 |
| F3 | Delivery points come only from the request: Volunteer = 3 × quantity + 4 × weight (kg); the Resident gets exactly half | NFR05-P1 | Covered |
| F4 | Cancellation points follow one rule: a late cancellation gives the Volunteer one award; an early cancellation, or cancelling one's own request, gives none | `backend/test/reward-handlers.test.js`, "late cancellation: one award for the volunteer", "early cancellation: no points", "cancellation of your own request: no points" | Covered |
| F5 | No hidden priority or extra reward based on account identity or saved pickup regions | NFR05-N1 (EcoPoints); NFR05-E1 (discovery and acceptance) | Covered for EcoPoints; explored for discovery and acceptance |

The rule "cancelling one's own request gives no points" (F4) compares the Volunteer with the Resident, so it does look at identity. It is an approved rule that applies the same way to every account, not a hidden preference.

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

**Verification:** `backend/test/reward-points.test.js`, "the contract example: 2 laptops, 5.0 kg -> 26 and 13" and "the resident award is always exactly half".

### NFR05-N1: Account identity and saved regions do not change the points (F5, alternate flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Build one delivery event (2 laptops, 5.0 kg) for four pairs of accounts: one with no saved regions, one with one, one with three, one with an empty list | – |
| 2 | Pass each to the Reward Service's delivery handler | Every run gives the Volunteer 26 points and the Resident 13, by the same formulas |
| 3 | Repeat with a late cancellation of the same assignment | Every run gives the Volunteer 26 points |

**Expected result:** the same delivery, or the same late cancellation, earns the same points whoever the accounts are and whatever regions they have saved.

**Postcondition:** none (no database or broker used).

**Verification:** `backend/test/nfr/fairness.test.js`, "NFR05-N1: the same delivery earns the same points for any account or saved region" and "NFR05-N1: the same late cancellation earns the same points for any account or saved region". Checked once by adding a bonus for Volunteers with saved regions to the handler: both tests failed, then passed again after the change was removed.

## Exploratory charter

### NFR05-E1: Fairness of discovery and acceptance across saved regions

Explore request discovery and acceptance as Volunteers with a matching saved region, a different saved region and no saved region, using fairness conditions F1, F2 and F5, to identify unequal treatment, such as who learns about a request first and who can accept it.

| | |
| --- | --- |
| **Goal** | Find whether a Volunteer's saved region, or lack of one, gives an advantage that the rules do not state |
| **Time** | Min. 30 min, max. 60 min |
| **Setup** | The full stack (`docker compose up`); three Volunteer accounts: one whose saved region matches a new request's postal code, one with a different region, one with none; one Resident |
| **Focus** | Create a request as the Resident; note which Volunteers get a push, an in-app notification and a live list update, and when; have the Volunteers accept in different orders; compare what each one can see and do |
| **Bugs** | |
| **Notes** | |
| **Improvements** | |

Record each finding with the accounts involved, the condition it bears on (F1, F2 or F5), and what happened. A known question to check: pushes go only to Volunteers matched by postal area, and the first valid accept wins, so matched Volunteers may learn about requests first.

## References

[1] R. de Souza Santos, M. de Morais Leça, R. Santos and C. Magalhães, "Software Fairness Testing in Practice," 2025. arXiv:2506.17095.

[2] ISO/IEC/IEEE 29119, *Software and systems engineering — Software testing* (Part 1: General concepts, 2022).

[3] K. Johnson, C. Magalhães and R. de Souza Santos, "Bita: A Conversational Assistant for Fairness Testing," 2025. arXiv:2512.05428.

## Results

Record one row per run. A planned case is not a pass until it has a row here.

| Case | Date | Commit | Command or steps | Result |
| --- | --- | --- | --- | --- |
| NFR05-P1 | | | `npm test` in `backend/` | |
| NFR05-N1 | | | `npm run test:nfr` in `backend/` | |
| NFR05-E1 | | | Charter | |
