# Software quality

## Functional requirement coverage

The [functional requirements](../1.%20Functional%20Requirements/README.md) define the behavior under test. Each row below points to the file where the positive and negative cases belong. The last two columns are the results from the [run below](#results).

| ID | Functional requirement | Case file | Positive | Negative |
| --- | --- | --- | --- | --- |
| FR01 | Account Registration | [accounts.md](cases/accounts.md) | Pass | Pass |
| FR02 | User Login, Logout, and Role Selection | [accounts.md](cases/accounts.md) | Not run | Pass |
| FR03 | Additional Role Activation | [accounts.md](cases/accounts.md) | Pass | Pass |
| FR04 | Profile Management | [accounts.md](cases/accounts.md) | Pass | Pass |
| FR05 | Public User Profiles | [accounts.md](cases/accounts.md) | Pass | Pass |
| FR06 | Create Pickup Requests | [resident-requests.md](cases/resident-requests.md) | Pass | Pass |
| FR07 | Pickup Scheduling | [resident-requests.md](cases/resident-requests.md) | Pass | Pass |
| FR08 | Review and Confirm Pickup Requests | [resident-requests.md](cases/resident-requests.md) | Not run | Pass |
| FR09 | View Resident Pickup Requests | [resident-requests.md](cases/resident-requests.md) | Pass | Pass |
| FR10 | Edit Open Pickup Requests | [resident-requests.md](cases/resident-requests.md) | Pass | Pass |
| FR11 | Cancel Pickup Requests | [resident-requests.md](cases/resident-requests.md) | Pass | Pass |
| FR12 | Volunteer Request Discovery | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR13 | Accept Pickup Requests | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR14 | Cancel Volunteer Assignment | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR15 | Confirm Item Collection | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR16 | Report Missed Pickup | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR17 | Record Facility Delivery | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR18 | EcoPoints Calculation and Awarding | [points-expiry-stats.md](cases/points-expiry-stats.md) | Pass | Pass |
| FR19 | In-App Notifications and Push Notifications | [notifications-demo.md](cases/notifications-demo.md) | Not run | Not run |
| FR20 | Automatic Request Expiration | [points-expiry-stats.md](cases/points-expiry-stats.md) | Pass | Pass |
| FR21 | Volunteer Pickup History | [volunteer.md](cases/volunteer.md) | Pass | Pass |
| FR22 | Terms and Conditions, including Safety Guidelines | [accounts.md](cases/accounts.md) | Pass | Pass |
| FR23 | Public Community Impact Statistics | [points-expiry-stats.md](cases/points-expiry-stats.md) | Pass | Pass |
| FR24 | Interactive Demo Mode | [notifications-demo.md](cases/notifications-demo.md) | Not run | Pass |

## Case format

Use two IDs per requirement. For example, `FR01-P` is a positive case that checks the expected result of valid use, and `FR01-N` is a negative case that checks the expected rejection or constraint. Add more cases with a numeric suffix such as `FR01-N2` if needed.

Record the setup, input, and steps for each case. State the expected result, including the status code, displayed message, or persistent state when relevant. In the **Verification** column, give the automated test file and test name, or label the case **Manual** and include reproducible steps. Keep observed results with the run evidence so a planned case is never counted as a pass.

The five files in `cases/` share the same columns, ending with **Result**: Pass, Fail with the reason, or Not run with the reason. Add case rows to the file listed in the coverage index.

## Results

Run on 2026-11-27 at commit `56785bf`: `main` at `fac33fe` plus [`resident-cases.test.ts`](../../../../backend/test/request/resident-cases.test.ts). Each saved file starts with its command, commit, date and environment.

| Suite | Passed | Failed | Skipped | Saved output |
| --- | --- | --- | --- | --- |
| Backend, no database | 180 | 1 | 16 | [backend.txt](results/backend.txt) |
| Backend with the database tests | 246 | 1 | 1 | [database.txt](results/database.txt) |
| Integration (PostgreSQL and RabbitMQ) | 9 | 0 | 0 | [integration.txt](results/integration.txt) |
| Frontend (93 test files) | 1226 | 0 | 0 | [frontend.txt](results/frontend.txt) |
| API contracts | 41 | 0 | 0 | [contracts.txt](results/contracts.txt) |

The two backend rows overlap: the second repeats the first with the database cases switched on. Frontend lint and the type check also passed (see the end of `frontend.txt`).

- **The one failure**, in both backend runs: “the frontend gets every NEXT_PUBLIC_ value as a build arg, in Compose and in its Dockerfile”. `frontend/.env.example` is missing `NEXT_PUBLIC_DEMO=false`. It is a settings check, not a requirement case. [PR #502](https://github.com/dannydufau/ecocollect/pull/502) adds the line and was not merged when this ran.
- **The one skip with a database:** the eighteenth-birthday midnight check, because this Node version has older Calgary time zone data.
- **Not run:** the browser tests (`npm run e2e`) and the backend type check (`npm run typecheck`, TypeScript was not installed on the machine).
- **Environment:** packages were not reinstalled with `npm ci`. The installed versions matched the lockfiles; the backend's came from the app's Docker image and lack only type definitions.

### Cases

All 24 requirements have a positive and a negative case, 48 in total: **43 pass and 5 are not run**. No case failed.

| How the case was checked | Passed |
| --- | --- |
| Automated tests (FR15-N also has a team run) | 28 |
| Team manual runs only | 15 |

**Not run:**

- **FR02-P:** signing out, then checking that protected pages need a new sign-in.
- **FR08-P:** correcting a request on the review step before sending it.
- **FR19-P and FR19-N:** notifications on the running stack, including web push.
- **FR24-P:** needs a demo site with its own Firebase project.

Each of these rows gives its reason. A passing supporting test does not make its case a pass.

### Team manual runs

The team ran 38 manual cases and marked all of them as passed. Their documents are saved as PDFs. Each one numbers its cases from TC001, so a case is named by its document and number.

| Document | Cases | Screenshots |
| --- | --- | --- |
| [FR01–05 and FR11–15](results/manual/fr01-05-fr11-15.pdf), dated November 26 | 20 | Yes |
| [FR06–10](results/manual/fr06-10.pdf) | 10 | Yes |
| [FR20–23](results/manual/fr20-23.pdf) | 8 | No |

These runs are separate from the saved run above and were not repeated for it, and the tested commit was not recorded. The case tables use some of these cases; the rest are extra checks. A password visible in the TC001 screenshot of the first document is blacked out in the saved copy.

The automated Request Service cases call the real service and a real PostgreSQL database. The tests set the gateway's identity headers themselves and use a stand-in for ImageKit, so Caddy, Firebase and ImageKit are not part of those results.

## Run the suites

Run from the repository root in Bash, with Node 22.18 or newer. Run `npm ci` in `backend/`, `frontend/` and `contracts/` first; some backend tests load packages from `contracts/`.

### Backend, frontend and contracts

```bash
(cd backend && npm test)
(cd frontend && npm test)
(cd frontend && npm run lint && npx next typegen && npx tsc --noEmit)
(cd contracts && npm test)
```

Without a database URL, the backend skips its database cases.

### Database

Use a throwaway PostgreSQL 16 server: the SQL creates server-wide logins, and the tests write data. Set `SCRATCH` to an admin connection without a database name, for example `postgres://postgres:your_password@localhost:55432`. Run the tests soon after loading, because the sample dates are relative to load time. To run again, use a new server or new database names.

```bash
load() { db=$1; shift; psql -X -q -v ON_ERROR_STOP=1 "$SCRATCH/postgres" -c "CREATE DATABASE $db"; for f in "$@"; do psql -X -q -v ON_ERROR_STOP=1 "$SCRATCH/$db" -f "$f" > /dev/null || return 1; done; }
load q607_shared db/init/*.sql db/request/*.sql db/reward/*.sql db/notification/*.sql backend/test/reward-seed.sql
load q607_request db/init/*.sql db/request/*.sql backend/test/request/seed.sql
load q607_profile db/init/*.sql
(cd backend && TEST_DATABASE_URL="$SCRATCH/q607_shared" REQUEST_TEST_DATABASE_URL="$SCRATCH/q607_request" PROFILE_EDIT_TEST_DATABASE_URL="$SCRATCH/q607_profile" npm test)
```

To check one case, run its test by name with the same URL, for example:

```bash
(cd backend && REQUEST_TEST_DATABASE_URL="$SCRATCH/q607_request" node --test --test-name-pattern="FR10-P" test/request/resident-cases.test.ts)
```

### Integration

With the local Compose environment set up as in the [project README](../../../../README.md), run:

```bash
bash backend/scripts/test-integration.sh
```

It starts Compose's RabbitMQ and PostgreSQL, so use a development setup. The saved run used the test command at the end of the script, against throwaway containers, to leave the local setup alone.
