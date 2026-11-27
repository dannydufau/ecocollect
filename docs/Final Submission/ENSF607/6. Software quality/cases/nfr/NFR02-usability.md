# NFR02 — Usability: test cases

## Requirement

From [Non-functional requirements](../../../2.%20Non-functional%20requirements/README.md):

> The system shall provide a consistent and understandable user interface that allows Residents and Volunteers to complete their principal activities through clearly labelled controls, visible request statuses, appropriate instructions, and understandable validation messages.

## Strategy

The criteria come from the requirement's wording. Their basis is Nielsen's 10 usability heuristics [1]: each criterion is judged against the heuristics the requirement asks for (#1, #2, #4, #5, #6 and #9), and is named with the usability sub-characteristics of ISO/IEC 25010:2011 [2].

Existing evidence is cited first, and new evidence is added only where none exists:

- **Precondition:** the principal activities work. This is functional behaviour, already covered by `FR06-P` (create a request, `resident-requests.md`) and `FR13-P` (accept a request, `volunteer.md`).
- **Regression guard:** the frontend team's automated tests check labels, statuses, consistency and validation messages on every run.
- **The usability check:** NFR02-E1, an exploratory charter, applies the heuristics to the Resident and Volunteer pages. Whether an interface is understandable is a judgement no automated test can make, so it is done by a person. Exploratory testing is an experience-based technique in ISO/IEC/IEEE 29119 [3], which supports scripted and unscripted, manual and automated testing side by side.

Usability testing evaluates ease of use and interface design through heuristic reviews and observation [4], which is why NFR02-E1 is a heuristic evaluation. Usability and accessibility share a user-centred, inclusive aim [4], so the accessibility scan counts as evidence for labelled controls (NFR02-P1). Usability problems can also mask fairness defects [4], so unequal treatment is explored separately, in [NFR05-E1](NFR05-fairness.md).

Two of the frontend team's existing tests are scripted as cases: NFR02-P1 (every page's controls are labelled) and NFR02-N1 (an incomplete form is reported field by field).

**Scope:** the automated tests are the frontend team's and are cited as they are; P1, N1 and E1 were added for this requirement, P1 and N1 from existing tests. A task test with a user outside the team was not run. Heuristics #3 (user control and freedom), #7 (flexibility and efficiency of use), #8 (aesthetic and minimalist design) and #10 (help and documentation) are not part of the requirement and are not tested.

## Criteria and evidence

| # | Criterion | Nielsen heuristic [1] | ISO/IEC 25010 [2] | Evidence |
| --- | --- | --- | --- | --- |
| C1 | Residents and Volunteers can complete their principal activities | – (the outcome the heuristics serve) | Operability | `FR06-P`, `FR13-P` (precondition); NFR02-E1 |
| C2 | Controls are clearly labelled | #2 Match between the system and the real world; #6 Recognition rather than recall | Operability, accessibility | NFR02-P1; NFR02-E1 |
| C3 | Request statuses are visible | #1 Visibility of system status | Appropriateness recognizability | `frontend/e2e/visual.pw.ts`, "the \<status\> badge shows an icon"; `frontend/e2e/acceptance.pw.ts`, "the stepper shows for Open, Assigned, Collected and Delivered only"; NFR02-E1 |
| C4 | Instructions say what to do and why an action is unavailable | #5 Error prevention | Learnability | `frontend/e2e/acceptance.pw.ts`, "a disabled confirm button shows its reason in the accept dialog"; NFR02-E1 |
| C5 | Validation messages say what is wrong and where | #9 Help users recognize, diagnose and recover from errors | User error protection | NFR02-N1; `frontend/e2e/visual.pw.ts`, "an invalid field on the register page has the danger border and a message with an icon" |
| C6 | The interface is consistent across pages | #4 Consistency and standards | User interface aesthetics | `frontend/e2e/visual.pw.ts`, the "colours" and "type" tests; `frontend/e2e/routes.pw.ts`, "\<page\> loads with the expected title, headings and layout"; NFR02-E1 |

The automated tests run with `npm run e2e` (Playwright) and `npm test` (Vitest) in `frontend/`.

## Setup for E1

It runs the frontend against the mock API, so it needs no Docker, Firebase or database. From `frontend/`, after `npm ci`:

```bash
npm run mock      # mock API on http://127.0.0.1:3101 (terminal 1)
npm run e2e:app   # signed-in test build on http://localhost:3100 (terminal 2)
```

The app opens as the resident `demo-resident-1`. To act as the volunteer, run `sessionStorage.setItem("e2e-account", "demo-volunteer-1")` in the browser console and reload.

## Cases

### NFR02-P1: Every page's controls are labelled (C2, basic flow)

**Preconditions:** `npm ci` and `npx playwright install chromium` run in `frontend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Run `npm run e2e` in `frontend/` | Playwright starts the mock API and a test build of the app itself |
| 2 | For each of the 17 pages in `frontend/e2e/routes.ts`, run an axe accessibility scan | No serious or critical violations, including unlabelled fields and buttons without a name |

**Expected result:** every control on every page has a label a person and a screen reader can read.

**Postcondition:** none.

**Verification:** `frontend/e2e/routes.pw.ts`, "\<page\> has no serious or critical accessibility violations" (one test per page).

### NFR02-N1: An incomplete form is reported field by field (C5, alternate flow)

**Preconditions:** `npm ci` run in `frontend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Render the registration form and submit it empty | Nothing is sent |
| 2 | Look under each required field | Each empty field shows its own message |
| 3 | Check where the focus is | It has moved to the first field with a problem |

**Expected result:** invalid input is not sent, and each message says what is wrong next to the field it belongs to.

**Postcondition:** none.

**Verification:** `frontend/components/register-form.test.tsx`, "shows a message under each empty field, sends nothing and moves focus to the first one".

## Exploratory charter

### NFR02-E1: Heuristic evaluation of the Resident and Volunteer pages

Explore the Resident and Volunteer pages, using Nielsen's heuristics #1, #2, #4, #5, #6 and #9, to identify usability problems in the principal activities.

| | |
| --- | --- |
| **Goal** | Explore the Resident and Volunteer pages with the heuristics above to find where the interface is unclear, inconsistent or silent about what happened |
| **Time** | Min. 30 min, max. 60 min |
| **Setup** | The setup above; first as `demo-resident-1`, then as `demo-volunteer-1` |
| **Focus** | Create, edit and cancel a request; read a request's status and history; find and accept an available request; confirm collection and record a delivery; trigger a validation error on each form; compare headers, buttons and badges across pages |
| **Bugs** | |
| **Notes** | |
| **Improvements** | |

Record each finding with the page, the heuristic it breaks, and what happened.

## References

[1] J. Nielsen, "10 Usability Heuristics for User Interface Design," Nielsen Norman Group. First published 1994. https://www.nngroup.com/articles/ten-usability-heuristics/

[2] ISO/IEC 25010:2011, *Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — System and software quality models*.

[3] ISO/IEC/IEEE 29119, *Software and systems engineering — Software testing* (Part 1: General concepts, 2022; Part 3: Test documentation).

[4] M. de Morais Leça and R. de Souza Santos, "Towards User-Focused Cross-Domain Testing: Disentangling Accessibility, Usability, and Fairness," 2025. arXiv:2501.06424.

## Results

Record one row per run. A planned case is not a pass until it has a row here.

| Case | Date | Commit | Command or steps | Result |
| --- | --- | --- | --- | --- |
| NFR02-P1 and the other automated evidence | 2026-11-26 | not recorded | `npm run e2e` in `frontend/` (Chromium) | 310 passed, 1 failed, 181 skipped. Every test cited above passed. The failure is a header-layout test not cited here, reported to the frontend team |
| NFR02-N1 | 2026-11-27 | `69c3679` | `npx vitest run components/register-form.test.tsx` in `frontend/` | Pass (18 passed, 0 failed) |
| Precondition: FR06-P, FR13-P | – | – | See `resident-requests.md` and `volunteer.md` | As recorded there |
| NFR02-E1 | – | – | Charter | Not run |
| User task test (optional) | – | – | – | Not run |
