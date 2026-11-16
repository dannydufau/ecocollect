# Physical database implementation

This PostgreSQL 16 implementation follows the final [logical model](<../2. Logical model/README.md>): 25 tables, 100 columns and 30 foreign keys. The [normalization document](<../3. Normalization/README.md>) explains how the tables fit together.

## Files

| File | Purpose |
|---|---|
| `tables.sql` | Creates the schema, tables, primary keys, foreign keys, unique constraints and checks. |
| `transactions.sql` | Creates procedures for checking related rows and new requests, accepting a request, adding a preferred postal code and attaching an item photo. |
| `seed.sql` | Adds related sample data to every table. |
| `verify.sql` | Checks the dataset, tests valid changes and confirms that invalid writes are rejected. Test changes are rolled back. |
| `verify_concurrency.py` | Uses two database connections to test limits when writes happen at the same time. Requires Python 3 and `psql`. |
| `results/` | Saved output from the verification and concurrency checks. |

## Create and populate the database

Use PostgreSQL 16 and its `createdb` and `psql` commands. Set `PGHOST`, `PGPORT` and `PGUSER` for your installation, if needed. Run these commands from this folder:

```sh
createdb ecocollect608
psql -X -v ON_ERROR_STOP=1 -d ecocollect608 -f tables.sql -f transactions.sql -f seed.sql -f verify.sql
```

Use a fresh database. The scripts stop on an error, and table creation and seeding each run in one transaction. The tables are placed in the `ecocollect608` schema. Running `tables.sql` again will fail because the schema already exists; it does not delete an existing database.

The SQL equivalent of `createdb ecocollect608` is `CREATE DATABASE ecocollect608;`. Connect to that database before running the files.

To check the same database again:

```sh
psql -X -v ON_ERROR_STOP=1 -d ecocollect608 -f verify.sql
```

Run the concurrency checks on the freshly seeded database:

```sh
python verify_concurrency.py ecocollect608
```

The check uses temporary test records and removes them afterward. Use `--psql` followed by the executable path if `psql` is not on your PATH.

## SQL choices

Table definitions use `CREATE TABLE`, `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`, `NOT NULL` and `CHECK`. The seed uses ordinary `INSERT INTO ... VALUES` statements with named columns.

The PostgreSQL types `UUID` and `TIMESTAMPTZ` match the logical model. Exact weights and points use `NUMERIC`. Timestamps describe real instants; pickup dates and start hours describe local Calgary slots. Window checks convert those slots using `America/Edmonton` so daylight-saving time is handled consistently.

The age check also uses the Calgary calendar date, so changing the connection's time zone cannot allow registration before the eighteenth birthday.

PostgreSQL syntax is used for schema selection, postal-code and username patterns, time-zone conversion and procedure bodies. No extensions are needed. Primary keys and unique constraints create their own indexes.

Postal-code checks validate the stored format. The service must check that the supplied address is in Calgary.

## Constraints and transactions

Primary keys prevent duplicate records. Foreign keys require the referenced account, acceptance, request, window, award or event to exist. Unique constraints prevent repeated delivery evidence, multiple deliveries for one assignment, repeated predecessor links and multiple notifications for one award. Checks reject invalid quantities, hours, status values, update fields, points and assignment times.

Some rules involve several rows. `check_business_rules()` checks those rows together, including account roles, current terms, active windows, assignment limits, award roles, notification sources, event sequences and rescheduling. Run it after the related writes and before committing:

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

`accept_request`, `add_preferred_code` and `attach_item_photo` perform their parent-row locks. An award and exactly one role row must be inserted in one transaction. A notification and exactly one source row must likewise be inserted together. The checker does not run automatically: direct table writes can bypass checks involving several rows. There are no triggers or partial indexes.

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

Tested on PostgreSQL 16.6:

- A fresh database was created and all scripts completed successfully.
- The database matched all 25 tables, 100 column names and types, nullability, and 30 foreign keys in the logical model.
- `verify.sql` rejected 36 invalid writes and rolled back its test changes.
- Valid cases cover replacement edits, a recalculated replacement estimate, delayed events, late cancellation awards and accepting an available request with current terms.
- Two concurrent connections were tested for duplicate unfinished assignments, a fourth preferred code, duplicate awards for one assignment and role, and a photo used for both an item and delivery evidence. In each case the second writer waited for the parent lock and was rejected after the first committed.

`verify.sql` prints request-state counts, award totals and notification-source counts. The separate database-operations deliverable will use this dataset for its numbered queries and saved results.
