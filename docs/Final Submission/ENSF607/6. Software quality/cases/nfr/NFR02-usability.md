# NFR02 — Usability: test cases

## Requirement

From [Non-functional requirements](../../../2.%20Non-functional%20requirements/README.md):

> The system shall provide a consistent and understandable user interface that allows Residents and Volunteers to complete their principal activities through clearly labelled controls, visible request statuses, appropriate instructions, and understandable validation messages.

## Criteria

The criteria come from the requirement's wording. Each is grouped under the usability sub-characteristic it shows in ISO/IEC 25010:2011 (appropriateness recognizability, learnability, operability, user error protection, user interface aesthetics, accessibility).

| # | Criterion | ISO/IEC 25010 | Cases |
| --- | --- | --- | --- |
| C1 | Residents and Volunteers can complete their principal activities | Operability | NFR02-P1, NFR02-P2 |
| C2 | Controls are clearly labelled | Operability, accessibility | NFR02-P3 |
| C3 | Request statuses are visible | Appropriateness recognizability | NFR02-P1, NFR02-P2, NFR02-P4 |
| C4 | Instructions say what to do and why an action is unavailable | Learnability | NFR02-P4 |
| C5 | Validation messages say what is wrong and where | User error protection | NFR02-N1 |
| C6 | The interface is consistent across pages | User interface aesthetics | NFR02-P4 |

## Setup for the manual cases

The manual cases run the frontend against the mock API, so they need no Docker, Firebase or database. From `frontend/`, after `npm ci`:

```bash
npm run mock      # mock API on http://127.0.0.1:3101 (terminal 1)
npm run e2e:app   # signed-in test build on http://localhost:3100 (terminal 2)
```

The app opens as the resident `demo-resident-1`. To act as the volunteer, run `sessionStorage.setItem("e2e-account", "demo-volunteer-1")` in the browser console and reload.

## Cases

### NFR02-P1: A Resident creates a pickup request (C1, C3, basic flow)

**Preconditions:** the manual setup is running; signed in as `demo-resident-1`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Open `/resident` | The page is titled "My requests" and each request shows its status |
| 2 | Start a new request | The "New pickup request" page opens; every field has a visible label and the optional ones say so |
| 3 | Choose a category, a quantity and one pickup window, then continue | The review step shows the entered values |
| 4 | Confirm the request | The new request appears in "My requests" with the status Open |

**Expected result:** the Resident completes the principal activity without outside help, and the new request's status is visible.

**Postcondition:** the mock store holds one more Open request (reset by restarting `npm run mock`).

**Verification:** Manual.

### NFR02-N1: A Resident submits a form with missing fields (C5, alternate flow)

**Preconditions:** the manual setup is running; signed out (open `/register` in a private window).

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Open `/register` and submit the form empty | Nothing is sent; each empty required field shows a message under it, with an icon, and focus moves to the first one |
| 2 | Fill in the first field and look at its message | The message for that field clears; the others stay |
| 3 | Fill in the remaining fields correctly and submit | The form is accepted |

**Expected result:** each validation message names the problem next to the field it belongs to, and the user can recover without starting over.

**Postcondition:** none.

**Verification:** Manual. Supporting automated checks: `frontend/components/register-form.test.tsx`, "shows a message under each empty field, sends nothing and moves focus to the first one"; `frontend/e2e/visual.pw.ts`, "an invalid field on the register page has the danger border and a message with an icon".

### NFR02-P2: A Volunteer accepts a request (C1, C3, basic flow)

**Preconditions:** the manual setup is running; signed in as `demo-volunteer-1`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Open `/volunteer` | The page is titled "Available requests"; each request shows its category, quantity and area, without a street address |
| 2 | Open an Open request and accept it, choosing one of its pickup windows | The accept dialog says what is being accepted; Confirm stays disabled, with its reason shown, until a window is chosen |
| 3 | Confirm | The request page shows the status Assigned and the next action |
| 4 | Open `/volunteer/history` | The page is titled "My assignments" and lists the accepted request with its status |

**Expected result:** the Volunteer completes the principal activity, and each step shows the request's current status and what to do next.

**Postcondition:** the mock store holds the request as Assigned (reset by restarting `npm run mock`).

**Verification:** Manual.

### NFR02-P3: Every page's controls are labelled (C2, basic flow)

**Preconditions:** `npm ci` and `npx playwright install chromium` run in `frontend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Run `npm run e2e` in `frontend/` | Playwright starts the mock API and the test build itself |
| 2 | Check "\<page\> loads with the expected title, headings and layout" for each of the 17 pages | Each page has its expected title and heading |
| 3 | Check "\<page\> has no serious or critical accessibility violations" for each page | The axe scan finds no serious or critical violations, including unlabelled fields and buttons without a name |

**Expected result:** every control on every page has a label that a person and a screen reader can read.

**Postcondition:** none.

**Verification:** `frontend/e2e/routes.pw.ts` (both tests, every route in `frontend/e2e/routes.ts`).

### NFR02-P4: Statuses, instructions and styles are shown the same way everywhere (C3, C4, C6, basic flow)

**Preconditions:** as NFR02-P3.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Run `npm run e2e` in `frontend/` | All tests pass |
| 2 | Check "the \<status\> badge shows an icon" | Every status badge has an icon and text, so status is not told by colour alone |
| 3 | Check "the stepper shows for Open, Assigned, Collected and Delivered only" | A request's progress is shown wherever it applies |
| 4 | Check "a disabled confirm button shows its reason in the accept dialog" | An unavailable action says why |
| 5 | Check the "colours" and "type" tests | Every page uses the same colours and fonts |

**Expected result:** statuses and instructions are visible and look the same on every page.

**Postcondition:** none.

**Verification:** `frontend/e2e/visual.pw.ts` (steps 2 and 5); `frontend/e2e/acceptance.pw.ts` (steps 3 and 4).

## Results

Record one row per run. A planned case is not a pass until it has a row here.

| Case | Date | Commit | Command or steps | Result |
| --- | --- | --- | --- | --- |
| | | | | |
