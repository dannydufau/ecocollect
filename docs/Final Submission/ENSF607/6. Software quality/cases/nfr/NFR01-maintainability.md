# NFR01 — Maintainability: test cases

## Requirement

From [Non-functional requirements](../../../2.%20Non-functional%20requirements/README.md):

> The system shall use a modular design that separates user interfaces, user management, pickup request management, notification processing, EcoPoints management and data cleanup operations into clearly defined components. Changes to one component shall not require unnecessary modifications to unrelated components.

## Strategy

The tests check the design by reading the repository's files (the imports in the source) without starting any service, so they run in under a second, as part of every `npm test`. NFR01-N1 shows the import check catches a real violation.

**Scope:** NFR01-P1 and NFR01-N1 check that no component reaches into another's code; NFR01-P2 checks that each outside service is reached from one place, with the messaging facade as the example. The other criteria are listed with the evidence that exists.

## Criteria and evidence

The criteria come from the requirement's two sentences. Each is grouped under the maintainability sub-characteristic it shows in ISO/IEC 25010:2011 [1] (modularity, reusability, analysability, modifiability, testability).

| # | Criterion | ISO/IEC 25010 [1] | Evidence |
| --- | --- | --- | --- |
| C1 | Each part named in the requirement is its own component | Modularity | `docker-compose.yml`: `frontend`, `user`, `request`, `notification`, `reward` and `cleanup` are separate services, each started from its own folder; `backend/test/compose.test.js` checks how they are wired |
| C2 | No component imports another component's code | Modularity | NFR01-P1, NFR01-N1 |
| C3 | Components interact only through declared interfaces: the API, events and the listed shared columns | Modularity | `contracts/test/openapi.test.js` and `contracts/test/asyncapi.test.js` (the API and events match their specs); `contracts/README.md`, "Who writes and who reads" (the shared columns) |
| C4 | Each outside service's library is used inside one component or behind one shared module | Modularity | NFR01-P2 |
| C5 | A likely change stays inside one component | Modifiability | Not scripted |

## Cases

### NFR01-P1: No component imports another component's code (C2, basic flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | List the folders in `backend/src` | Services `user`, `request`, `notification`, `reward`, `cleanup`; shared modules `messaging`, `api` |
| 2 | For each file in a service folder, resolve every relative import | Each resolves to the same service folder or to a shared module |
| 3 | Check the frontend's imports | None reach outside `frontend/` |

**Expected result:** components depend on each other only through the shared modules, never on another component's internals.

**Postcondition:** none (read-only).

**Verification:** `backend/test/nfr/modularity.test.js`, "NFR01-P1: no service imports another service's code".

### NFR01-N1: A cross-component import is caught (C2, alternate flow)

**Preconditions:** as NFR01-P1, on a scratch branch.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Add `require('../user/db/pool.ts');` to `backend/src/reward/handlers.js` | The file is changed |
| 2 | Run `npm run test:nfr` in `backend/` | NFR01-P1 fails and names `reward -> user` and the file |
| 3 | Revert the change and run `npm run test:nfr` again | NFR01-P1 passes |

**Expected result:** the test detects a component reaching into another component's code.

**Postcondition:** the scratch branch is deleted; nothing is committed.

**Verification:** Manual, using the automated test.

### NFR01-P2: Each outside service is reached from one place (C4, basic flow)

**Preconditions:** a checkout of `main`; `npm ci` run in `backend/`.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Find the files that import `amqplib` (RabbitMQ) | Only files in `backend/src/messaging/`, plus the known exception below |
| 2 | Find the files that import `firebase-admin` (Firebase) | Only files in `backend/src/user/` |
| 3 | Find the files that import `@imagekit/nodejs` (ImageKit) | Only files in `backend/src/request/` |

**Expected result:** replacing or reconfiguring the broker, Firebase or ImageKit changes one place each.

**Known exception:** the request relay (`backend/src/request/messaging/publisher.ts`) opens its own broker connection instead of using the messaging module.

**Not covered:** `pg`, the database driver, is used by every service that stores data. All services share one database by design, and each uses its own schema.

**Postcondition:** none (read-only).

**Verification:** `backend/test/nfr/modularity.test.js`, "NFR01-P2: each external service's library is used in one place".

## References

[1] ISO/IEC 25010:2011, *Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — System and software quality models*.

## Results

Record one row per run. A planned case is not a pass until it has a row here.

| Case | Date | Commit | Command or steps | Result |
| --- | --- | --- | --- | --- |
| NFR01-P1, NFR01-P2 | 2026-11-26 | `f0300c7` | `npm run test:nfr` in `backend/` | Pass: both passed (4 passed, 0 failed in the run; the NFR06 database test was skipped, no database URL set) |
| NFR01-N1 | 2026-11-26 | `f0300c7` | Steps above, on a scratch branch | Pass: with the planted import, NFR01-P1 failed and reported `reward -> user: backend/src/reward/handlers.js '../user/db/pool.ts'`; after the revert, it passed |
