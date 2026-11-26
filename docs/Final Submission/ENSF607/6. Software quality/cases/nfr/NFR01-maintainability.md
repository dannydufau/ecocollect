# NFR01 — Maintainability: test cases

## Requirement

From [Non-functional requirements](../../../2.%20Non-functional%20requirements/README.md):

> The system shall use a modular design that separates user interfaces, user management, pickup request management, notification processing, EcoPoints management and data cleanup operations into clearly defined components. Changes to one component shall not require unnecessary modifications to unrelated components.

## Criteria

The criteria come from the requirement's two sentences. Each is grouped under the maintainability sub-characteristic it shows in ISO/IEC 25010 (modularity, reusability, analysability, modifiability, testability).

| # | Criterion | ISO/IEC 25010 | Cases |
| --- | --- | --- | --- |
| C1 | Each part named in the requirement is its own component | Modularity | NFR01-P1 |
| C2 | No component imports another component's code | Modularity | NFR01-P2, NFR01-N1 |
| C3 | Components interact only through declared interfaces: the API, events and the listed shared columns | Modularity | NFR01-P3 |
| C4 | Each external service's library is used inside one component or behind one shared module | Modularity | NFR01-P4 |
| C5 | A likely change stays inside one component | Modifiability | NFR01-P5 |

## Cases

### NFR01-P1: Each named part is its own component (C1, basic flow)

**Preconditions:** a checkout of `main` that includes #103 (Notification Service); `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | List the services in `docker-compose.yml` | `frontend`, `user`, `request`, `notification`, `reward` and `cleanup` are present |
| 2 | Read each backend service's start command | Each starts its own entry point, `backend/src/<part>/index.*` |
| 3 | Read the frontend service's build context | It builds from `frontend/` |
| 4 | Find the `CREATE SCHEMA` statements under `db/` | `users`, `requests`, `notifications`, `rewards` and `cleanup` each exist |

**Expected result:** each of the six parts named in the requirement is a separate component with its own folder and Compose service, and each backend service has its own schema.

**Postcondition:** none (read-only).

**Verification:** `backend/test/nfr/modularity.test.js`, "NFR01-P1: each part named in NFR01 is its own component".

### NFR01-P2: No component imports another component's code (C2, basic flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | List the folders in `backend/src` | Services `user`, `request`, `notification`, `reward`, `cleanup`; shared modules `messaging`, `api` |
| 2 | For each file in a service folder, resolve every relative import | Each resolves to the same service folder or to a shared module |
| 3 | Check the frontend's imports | None reach into `backend/` |

**Expected result:** components depend on each other only through the shared modules, never on another component's internals.

**Postcondition:** none (read-only).

**Verification:** `backend/test/nfr/modularity.test.js`, "NFR01-P2: no service imports another service's code".

### NFR01-N1: A cross-service import is caught (C2, alternate flow)

**Preconditions:** as NFR01-P2, on a scratch branch.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Add `require('../user/db/pool.ts');` to `backend/src/reward/handlers.js` | The file is changed |
| 2 | Run `npm run test:nfr` in `backend/` | NFR01-P2 fails and names `reward -> user` and the file |
| 3 | Revert the change and run `npm run test:nfr` again | NFR01-P2 passes |

**Expected result:** the test detects a component reaching into another component's code.

**Postcondition:** the scratch branch is deleted; nothing is committed.

**Verification:** Manual, using the automated test.

### NFR01-P3: Components interact only through declared interfaces (C3, basic flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `contracts/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Run `npm test` in `contracts/` | All tests pass |
| 2 | Check "every call in the README is in the spec, with its method and path, and nothing else" | Passes: the HTTP API is exactly the declared one |
| 3 | Check "each consumer queue receives exactly the events the README gives it" | Passes: each service receives only its declared events |
| 4 | Read section 8, "Who writes and who reads", in `contracts/README.md` | Each table has one writing service; reads by other services are listed |

**Expected result:** services interact only through the declared API, the declared events and the listed shared columns.

**Postcondition:** none (read-only).

**Verification:** `contracts/test/openapi.test.js` and `contracts/test/asyncapi.test.js` (steps 1–3); Manual (step 4).

### NFR01-P4: External services are reached through one place each (C4, basic flow)

**Preconditions:** a checkout of `main` that includes #103 (messaging facade); `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Find the files that import `amqplib` (RabbitMQ) | Only `backend/src/messaging/connection.js`, plus the known exception below |
| 2 | Find the files that import `firebase-admin` (Firebase) | Only files in `backend/src/user/` |
| 3 | Find the files that import `@imagekit/nodejs` (ImageKit) | Only files in `backend/src/request/` |

**Expected result:** replacing or reconfiguring the broker, Firebase or ImageKit changes one place each.

**Known exception:** the request relay (`backend/src/request/messaging/publisher.ts`) opens its own broker connection instead of using the messaging module. Planned follow-up: one shared relay behind the facade that calls each service's stored procedures.

**Not covered:** `pg`, the database driver, is used by every service that stores data. All services share one database by design, and each uses only its own schema (NFR01-P1, NFR01-P3).

**Postcondition:** none (read-only).

**Verification:** `backend/test/nfr/modularity.test.js`, "NFR01-P4: each external service's library is used in one place".

### NFR01-P5: A change to EcoPoints stays in the Reward Service (C5, basic flow)

**Preconditions:** a checkout of `main`, on a scratch branch; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Find where delivery points are calculated | Only `backend/src/reward/points.js` (`deliveryPoints`) |
| 2 | Change the volunteer formula in `points.js` | The file is changed |
| 3 | Run `npm test` in `backend/` | Only the Reward Service's tests fail (they check the old point values) |
| 4 | Run `git diff --stat` | Only files in `backend/src/reward/` changed |

**Expected result:** a change to how EcoPoints are calculated needs no change in any other component. Other services receive the result in the `PointsAwarded*` events.

**Postcondition:** the scratch branch is deleted; nothing is committed.

**Verification:** Manual.

## Results

Record one row per run. A planned case is not a pass until it has a row here.

| Case | Date | Commit | Command or steps | Result |
| --- | --- | --- | --- | --- |
| | | | | |
