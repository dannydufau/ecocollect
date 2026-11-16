# Physical database implementation

This PostgreSQL 16 implementation follows the final [logical model](<../2. Logical model/README.md>): 25 tables, 100 columns and 30 foreign keys. The [normalization document](<../3. Normalization/README.md>) explains how the tables fit together.

## Files

| File | Purpose |
|---|---|
| `tables.sql` | Creates the schema, tables, primary keys, foreign keys, unique constraints and checks. |
| `transactions.sql` | Creates procedures for checking related rows, accepting a request, adding a preferred postal code and attaching an item photo. |
| `seed.sql` | Adds related sample data to every table. |
| `verify.sql` | Checks the dataset, tests valid changes and confirms that invalid writes are rejected. Test changes are rolled back. |
| `verify_concurrency.py` | Uses two database connections to test limits when writes happen at the same time. Requires Python 3 and `psql`. |

## Create and populate the database

Use PostgreSQL 16 and its `createdb` and `psql` commands. Set `PGHOST`, `PGPORT` and `PGUSER` for your installation, if needed. Run these commands from this folder:

```sh
createdb ecocollect608
psql -X -v ON_ERROR_STOP=1 -d ecocollect608 -f tables.sql -f transactions.sql -f seed.sql -f verify.sql
```

Use a fresh database. The scripts stop on an error, and table creation and seeding each run in one transaction. The tables are placed in the `ecocollect608` schema. Running `tables.sql` again will fail because the schema already exists; it does not delete an existing database.

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

The procedures are building blocks for those transactions. A complete service action must also write its status history and publish its event as required by the contract. For example, accepting a request needs an Assigned history entry and its event in the same service transaction. Services must adopt these write and read paths before using this schema. Processed events, outbox records and other service-support tables remain outside the course model.

## Sample data

All people, addresses, facilities, image paths and push subscriptions are sample records. Dates are based on the time the seed script runs.

| Data | Coverage |
|---|---|
| 7 accounts | Residents, volunteers and one person with both roles. A volunteer with no preferred codes and one with three. |
| 11 requests | All seven request states; two item requests sharing one creation acceptance; one reopened request and one replacement for a Missed request. |
| 13 windows and 8 assignments | Active and replaced windows, assignment history on the same window, collection, delivery and cancellation. |
| 2 deliveries and 5 awards | Separate resident and volunteer awards, self-delivery and an eligible resident-cancellation award. |
| 13 notifications | Eight request notifications and five award notifications, with read, unread, pushed and expired examples. |
| 30 request events | Shared action IDs, edited and reopened updates, and separate changed-field rows. |
| 9 categories and 3 facilities | Different accepted categories and facilities with or without instructions. |

Request owners are found through their creation acceptance. Assignment requests are found through pickup windows, and volunteers through their acceptance. Award recipients are found through the assignment and earned role. Historical pickup addresses, estimates, award points and formulas remain stored with their records.

## Verification

Tested on PostgreSQL 16.6:

- A fresh database was created and all scripts completed successfully.
- The database matched all 25 tables, 100 column names and types, nullability, and 30 foreign keys in the logical model.
- `verify.sql` rejected 29 invalid writes and rolled back its test changes.
- Two concurrent connections were tested for duplicate unfinished assignments, a fourth preferred code, duplicate awards for one assignment and role, and a photo used for both an item and delivery evidence. In each case the second writer waited for the parent lock and was rejected after the first committed.

`verify.sql` prints request-state counts, award totals and notification-source counts. The separate database-operations deliverable will use this dataset for its numbered queries and saved results.
