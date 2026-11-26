# Physical database implementation

This PostgreSQL 16 implementation follows the final [logical model](<../2. Logical model/README.md>): 25 tables, 100 columns and 30 foreign keys. The [normalization document](<../3. Normalization/README.md>) explains how the tables fit together.

## Submission checklist

- [x] Database structure: [tables.sql](tables.sql) creates all 25 tables with the columns and types in the final logical model.
- [x] Keys: [tables.sql](tables.sql) defines the primary keys, 30 foreign keys and required unique constraints.
- [x] Constraints: [tables.sql](tables.sql) checks individual rows; [transactions.sql](transactions.sql) checks rules involving related rows.
- [x] Population: [seed.sql](seed.sql) fills every table with related sample data covering the request states and main workflows.
- [x] Reproducible setup: the commands below create, populate and check a fresh database using only the submitted files. [verify.sql](verify.sql) and [verify_concurrency.py](verify_concurrency.py) provide the checks.

Rechecked on PostgreSQL 16.6: the documented file order builds a fresh database successfully, repeat verification passes, and all 41 rejected-write checks and six concurrency checks pass. This confirms the standalone course submission; application service integration remains tracked separately in #191.

## Files

| File | Purpose |
|---|---|
| `tables.sql` | Creates the schema, tables, primary keys, foreign keys, unique constraints and checks. |
| `transactions.sql` | Creates procedures for checking related rows and new requests, accepting a request, adding a preferred postal code, attaching an item photo and removing a facility/category link. |
| `seed.sql` | Adds related sample data to every table. |
| `verify.sql` | Checks the dataset, tests valid changes and confirms that invalid writes are rejected. Test changes are rolled back. |
| [tests.sql](tests.sql) | Runs `verify.sql` and adds ten assertions for database structure, data changes, query results and rollback. |
| `verify_concurrency.py` | Uses two database connections to test limits when writes happen at the same time. Requires Python 3 and `psql`. |
| `results/` | Saved output from the verification and concurrency checks. |

## Create and populate the database

Use PostgreSQL 16 and its `createdb` and `psql` commands. Set `PGHOST`, `PGPORT` and `PGUSER` for your installation, if needed. Run these commands from this folder:

```sh
createdb ecocollect608
psql -X -v ON_ERROR_STOP=1 -d ecocollect608 -f tables.sql -f transactions.sql -f seed.sql -f verify.sql
```

Use a fresh database. The scripts stop on an error, and table creation and seeding each run in one transaction. The tables are placed in the `ecocollect608` schema. Running `tables.sql` again will fail because the schema already exists; it does not delete an existing database.

`ecocollect608` contains the complete course model for running these files together. The application uses the service schemas in contract sections 2.1 and 8: `users`, `requests`, `rewards`, `notifications` and `cleanup`. Application migrations keep the same table names, columns, keys and relationships, placing each table in its service schema and qualifying references across schemas. Terms acceptance remains the shared insert-only table described in section 8. Each service has write access to its own tables and the required read access to other schemas. Application integration is tracked in #191; these course scripts do not configure service users or permissions.

The SQL equivalent of `createdb ecocollect608` is `CREATE DATABASE ecocollect608;`. Connect to that database before running the files.

To check the same database again:

```sh
psql -X -v ON_ERROR_STOP=1 -d ecocollect608 -f verify.sql
```

Run the concurrency checks on the freshly seeded database:

```sh
python3 verify_concurrency.py ecocollect608
```

On Windows, use `python` instead of `python3` if that is the command for your Python 3 installation.

The check uses temporary test records and removes them afterward. Use `--psql` followed by the executable path if `psql` is not on your PATH.

## SQL choices

Table definitions use `CREATE TABLE`, `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`, `NOT NULL` and `CHECK`. The seed uses ordinary `INSERT INTO ... VALUES` statements with named columns.

The PostgreSQL types `UUID` and `TIMESTAMPTZ` match the logical model. Exact weights and points use `NUMERIC`. Timestamps describe real instants; pickup dates and start hours describe local Calgary slots. Window checks convert those slots using `America/Edmonton` so daylight-saving time is handled consistently.

The age check also uses the Calgary calendar date, so changing the connection's time zone cannot allow registration before the eighteenth birthday.

PostgreSQL syntax is used for schema selection, postal-code and username patterns, time-zone conversion and procedure bodies. No extensions are needed. Primary keys and unique constraints create their own indexes.

All four postal-code columns use the contract's format check: `^T[0-9][A-Z][0-9][A-Z][0-9]$`. This checks six uppercase letter/digit characters starting with T; it does not prove that a code exists or that an address is in Calgary. The service must check the Calgary address separately.

Terms document IDs remain `UUID` values, as in the logical model. The API sends them as strings. Services must check a supplied ID before casting it to UUID and return `409 terms_outdated` if it is malformed, unknown or no longer current. A malformed ID must not reach a UUID cast and become a `500`. The contract examples use the current terms UUID from `seed.sql`.

## Constraints and transactions

Primary keys prevent duplicate records. Foreign keys require the referenced account, acceptance, request, window, award or event to exist. Unique constraints prevent repeated delivery evidence, multiple deliveries for one assignment, repeated predecessor links and multiple notifications for one award. Checks reject invalid quantities, hours, status values, update fields, points and assignment times.

Some rules involve several rows. `check_business_rules()` checks those rows together, including account roles, current terms, active windows, assignment limits, award roles, notification sources, event sequences and rescheduling. It also requires every facility to accept at least one category and every category to have at least one accepting facility, matching the ER diagram's ACCEPTS relationship. Run it after the related writes and before committing:

```sql
BEGIN;
SET search_path TO ecocollect608, public;
-- Lock the parent row, then perform the related writes.
CALL check_business_rules();
COMMIT;
```

Use the default `READ COMMITTED` isolation level. All writers of the same rule must lock the same parent before checking or changing its related rows:

| Change | Row to lock with `SELECT ... FOR UPDATE` |
|---|---|
| Add an assignment or replace active windows | Pickup request |
| Change preferred postal codes | Volunteer |
| Attach an item or delivery photo | Photo; also lock the request when editing it |
| Create an award and its role row | Assignment |
| Create a notification and its source row | Notification |
| Change account roles | Account |
| Change facility/category links | Affected facility rows first, then category rows, each in ID order |

`accept_request`, `add_preferred_code`, `attach_item_photo` and `remove_facility_category` perform their parent-row locks. To replace an acceptance link, add the replacement first, then call `remove_facility_category` in the same transaction. For changes involving several parents, lock all affected facility rows first and category rows second, each in ID order. An award and exactly one role row must be inserted in one transaction. A notification and exactly one source row must likewise be inserted together. The checker does not run automatically: direct table writes can bypass checks involving several rows. There are no triggers or partial indexes.

Call `check_new_request(request_id)` during creation to check the current weight, copied profile address and any rescheduled item facts. A replacement gets a fresh weight estimate. It can be edited normally while Open; these creation checks do not freeze its later values. Earlier requests and awards keep their historical values.

Consumed event records may arrive later or out of order. Their sequences may have gaps or lag behind the request's published counter, but cannot exceed it.

`accept_request` inserts the assignment, records Assigned in the status history and advances the request's published sequence. A complete service action must also publish its event in the same transaction as required by the contract. Services must adopt these write and read paths before using this schema. Processed events, outbox records and other service-support tables remain outside the course model.

## Sample data

All people, addresses, facilities, image paths and push subscriptions are sample records. Dates are based on the time the seed script runs.

| Data | Coverage |
|---|---|
| 7 accounts | Residents, volunteers and one person with both roles. A volunteer with no preferred codes and one with three. |
| 11 requests | All seven request states; two item requests sharing one creation acceptance; one reopened request and one replacement for a Missed request. |
| 13 windows and 8 assignments | Active and replaced windows, assignment history on the same window, collection, delivery and cancellation. |
| 2 deliveries and 5 awards | Separate resident and volunteer awards, self-delivery and an eligible resident-cancellation award. |
| 13 notifications | Eight request notifications and five award notifications, with read, unread, pushed and expired examples. |
| 33 request events | Shared action IDs, separate cancellation and reopening events, edited updates and separate changed-field rows. |
| 9 categories and 3 facilities | Different accepted categories and facilities with or without instructions. |

Request owners are found through their creation acceptance. Assignment requests are found through pickup windows, and volunteers through their acceptance. Award recipients are found through the assignment and earned role. Historical pickup addresses, estimates, award points and formulas remain stored with their records.

## Verification

### Database test cases and results

Run the full suite from this folder against a fresh database:

```sh
createdb ecocollect608_test
psql -X -v ON_ERROR_STOP=1 -d ecocollect608_test -f tables.sql -f transactions.sql -f seed.sql -f tests.sql
python3 verify_concurrency.py ecocollect608_test
```

To repeat the SQL tests against the same seeded database, run `psql -X -d ecocollect608_test -f tests.sql`. The script stops at the first unexpected result and rolls back its test writes.

| Case | Expected result | Observed |
|---|---|---|
| DB01 | The schema has 25 base tables, 100 columns and one primary key per table. | Pass |
| DB02 | All 30 foreign keys are present and validated. | Pass |
| DB03 | Deleting a referenced category fails with SQLSTATE `23503`. | Pass |
| DB04 | The latest-status query returns the expected counts for all seven request states. | Pass |
| DB05 | The delivery join returns two deliveries with 5.60 kg of estimated weight in total. | Pass |
| DB06 | The awards query returns two resident awards worth 18.70 points and three volunteer awards worth 60.40 points. | Pass |
| DB07 | The query returns eight request notifications and five award notifications with 13 distinct sources. | Pass |
| DB08 | One eligibility link is removed, its replacement is present, and the business-rule procedure accepts the change. | Pass |
| DB09 | An account update changes exactly one row and returns the new value on readback. | Pass |
| DB10 | Rollback restores the seed records affected by the test writes. | Pass |
| Existing SQL verification | Valid writes succeed and 41 invalid writes are rejected with their expected SQLSTATEs. | Pass on both runs |
| Concurrent writes | Six competing writes wait on the parent lock and fail with SQLSTATE `23514` after the first writer commits. | Pass |

Both SQL runs and the concurrency run passed on PostgreSQL 18.6 on November 26, 2026. The [saved output](results/database-tests.txt) records the setup, assertions and concurrency results. The retrieval cases above cover representative queries on the course dataset. Verify the complete numbered operations catalog against the same seed once [PR #443](https://github.com/dannydufau/ecocollect/pull/443) is merged into `main`.

### Earlier PostgreSQL 16.6 verification

Tested on PostgreSQL 16.6:

- A fresh database was created and all scripts completed successfully.
- The database matched all 25 tables, 100 column names and types, nullability, and 30 foreign keys in the logical model.
- `verify.sql` rejected 41 invalid writes and rolled back its test changes.
- Removing a facility's last category or a category's last accepting facility was rejected, with the unlinked record's ID and name in the error. Moving a category to another accepting facility in one transaction passed.
- Postal-code checks accept the API's format across resident addresses, preferred codes, pickup addresses and facilities, while rejecting lowercase, spaces and a wrong prefix. The format-only test values are rolled back.
- Valid cases cover replacement edits, a recalculated replacement estimate, delayed events, late cancellation awards and accepting an available request with current terms.
- Two concurrent connections were tested for duplicate unfinished assignments, a fourth preferred code, duplicate awards for one assignment and role, a photo used for both an item and delivery evidence, and concurrent removals of the last facility/category links in both directions. In each case the second writer waited for the parent lock and was rejected after the first committed.

`verify.sql` prints request-state counts, award totals and notification-source counts. The separate database-operations deliverable will use this dataset for its numbered queries and saved results.
