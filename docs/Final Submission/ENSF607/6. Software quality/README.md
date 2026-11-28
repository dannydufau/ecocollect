# Software quality

## Functional requirement coverage

The [functional requirements](../1.%20Functional%20Requirements/README.md) define the behavior under test. Each row below points to the file where the positive and negative cases belong. This table is an index. Test results belong with the cases and run evidence.

| ID | Functional requirement | Case file |
| --- | --- | --- |
| FR01 | Account Registration | [accounts.md](cases/accounts.md) |
| FR02 | User Login, Logout, and Role Selection | [accounts.md](cases/accounts.md) |
| FR03 | Additional Role Activation | [accounts.md](cases/accounts.md) |
| FR04 | Profile Management | [accounts.md](cases/accounts.md) |
| FR05 | Public User Profiles | [accounts.md](cases/accounts.md) |
| FR06 | Create Pickup Requests | [resident-requests.md](cases/resident-requests.md) |
| FR07 | Pickup Scheduling | [resident-requests.md](cases/resident-requests.md) |
| FR08 | Review and Confirm Pickup Requests | [resident-requests.md](cases/resident-requests.md) |
| FR09 | View Resident Pickup Requests | [resident-requests.md](cases/resident-requests.md) |
| FR10 | Edit Open Pickup Requests | [resident-requests.md](cases/resident-requests.md) |
| FR11 | Cancel Pickup Requests | [resident-requests.md](cases/resident-requests.md) |
| FR12 | Volunteer Request Discovery | [volunteer.md](cases/volunteer.md) |
| FR13 | Accept Pickup Requests | [volunteer.md](cases/volunteer.md) |
| FR14 | Cancel Volunteer Assignment | [volunteer.md](cases/volunteer.md) |
| FR15 | Confirm Item Collection | [volunteer.md](cases/volunteer.md) |
| FR16 | Report Missed Pickup | [volunteer.md](cases/volunteer.md) |
| FR17 | Record Facility Delivery | [volunteer.md](cases/volunteer.md) |
| FR18 | EcoPoints Calculation and Awarding | [points-expiry-stats.md](cases/points-expiry-stats.md) |
| FR19 | In-App Notifications and Push Notifications | [notifications-demo.md](cases/notifications-demo.md) |
| FR20 | Automatic Request Expiration | [points-expiry-stats.md](cases/points-expiry-stats.md) |
| FR21 | Volunteer Pickup History | [volunteer.md](cases/volunteer.md) |
| FR22 | Terms and Conditions, including Safety Guidelines | [accounts.md](cases/accounts.md) |
| FR23 | Public Community Impact Statistics | [points-expiry-stats.md](cases/points-expiry-stats.md) |
| FR24 | Interactive Demo Mode | [notifications-demo.md](cases/notifications-demo.md) |

## Non-functional requirement coverage

The [non-functional requirements](../2.%20Non-functional%20requirements/README.md) define the qualities under test. Each NFR has its own file in `cases/nfr/`, with the requirement, its criteria, the evidence for each criterion, and a Results table.

| ID | Non-functional requirement | Case file | Scripted cases |
| --- | --- | --- | --- |
| NFR01 | Maintainability | [NFR01-maintainability.md](cases/nfr/NFR01-maintainability.md) | P1, P2, N1 |
| NFR02 | Usability | [NFR02-usability.md](cases/nfr/NFR02-usability.md) | P1, N1, E1 (charter) |
| NFR03 | Privacy | [NFR03-privacy.md](cases/nfr/NFR03-privacy.md) | P1, P2, P3 |
| NFR04 | Security | [NFR04-security.md](cases/nfr/NFR04-security.md) | P1, P2, N1 |
| NFR05 | Fairness | [NFR05-fairness.md](cases/nfr/NFR05-fairness.md) | P1, N1, E1 (charter) |
| NFR06 | Reliability | [NFR06-reliability.md](cases/nfr/NFR06-reliability.md) | P1, P2, N1, N2 |

### NFR strategy

- **Criteria** come from each requirement's wording, named with ISO/IEC 25010:2011, with Nielsen's usability heuristics for NFR02 and the fairness testing definition of de Souza Santos et al. for NFR05. Each file gives its references.
- **Existing tests are cited first.** The remaining gaps are ranked by risk, impact × likelihood, following ISO/IEC/IEEE 29119. The scale is in [NFR03](cases/nfr/NFR03-privacy.md#strategy). High-risk gaps get new cases; the others are listed with their rating as not yet scripted.
- **The technique fits the quality.** NFR cases use the Lecture 12 scripted test case format, with exploratory charters where a judgement no script can make is needed (usability, fairness). ISO/IEC/IEEE 29119-3 supports scripted and unscripted, manual and automated testing side by side. The positive and negative rule below applies to functional requirements.
- **Scope:** the cases go deepest in the event, notification and messaging paths. Each file states its own scope.

## Case format

Use two IDs per requirement. For example, `FR01-P` is a positive case that checks the expected result of valid use, and `FR01-N` is a negative case that checks the expected rejection or constraint. Add more cases with a numeric suffix such as `FR01-N2` if needed.

Record the setup, input, and steps for each case. State the expected result, including the status code, displayed message, or persistent state when relevant. In the **Verification** column, give the automated test file and test name, or label the case **Manual** and include reproducible steps. Keep observed results with the run evidence so a planned case is never counted as a pass.

The five files in `cases/` share the same columns. Add case rows to the file listed in the coverage index.

## Run the suites

Run the following commands from the repository root in Bash. Use the Node version required by the packages and run `npm ci` in each package before its first run.

### Non-functional

```bash
(cd backend && npm ci && npm run test:nfr)
```

`npm run test:nfr` runs the new tests in `backend/test/nfr/`. They are also part of `npm test`. The database tests (NFR03-P3, NFR06-P2) need the Request Service's test database: run `backend/scripts/request/load-db.sh --test` and set `REQUEST_TEST_DATABASE_URL` (see `backend/test/request/db.ts`). Without the variable they are skipped, like the other request tests; with it set but the database down, they fail. The other cases cite existing tests in their own suites; each file's Results table names the command.

### Backend

```bash
(cd backend && npm ci && npm test)
```

The backend suite checks service routes, validation, contracts at the service boundaries, and other application logic. Database-backed cases are skipped unless their database URL is set.

### Frontend

The frontend on `main` currently has no `npm test` script. When the automated suite reaches the branch under test, run `cd frontend && npm test` from the repository root. For the current frontend, `npm run lint` is available after `npm ci`. It checks source code style and common errors. Use documented browser steps to verify functional cases that have no automated test.

### Database and integration

Use an empty scratch PostgreSQL database. Load `db/init/001_schema.sql` and the User schema using the [User database setup](../../../../backend/scripts/user/README.md) before enabling the backend database tests. Set `TEST_DATABASE_URL` to the scratch connection URL with the setup permissions required by the suite. Use separate scratch services for tests that write data.

```bash
(cd backend && TEST_DATABASE_URL="$SCRATCH_DATABASE_URL" npm test)
```

For broker integration tests, configure the local Compose environment as described in the [project README](../../../../README.md) and run the script below. It starts the Compose RabbitMQ service and runs the integration suite. Set `RABBITMQ_URL` and `RABBITMQ_MGMT_URL` if the local broker differs from the script defaults. Provide `TEST_DATABASE_URL` for integration tests that also need PostgreSQL.

```bash
bash backend/scripts/test-integration.sh
```

Record the command, commit, environment, and observed pass, fail, and skip counts for each run. For manual cases, record the observed result and the build or commit tested.
