# Database operations and queries

25 SQL operations on the [physical model](<../4. Physical model/README.md>), grouped by the section 5 category table. `operations.sql` has the operations; `results/operations.txt` has their output.

## Run

On a fresh database, from this folder:

```sh
createdb ecocollect608
psql -X -v ON_ERROR_STOP=1 -d ecocollect608 -f "../4. Physical model/tables.sql" \
  -f "../4. Physical model/transactions.sql" -f "../4. Physical model/seed.sql"
psql -X -a -v ON_ERROR_STOP=1 -d ecocollect608 -f operations.sql > results/operations.txt 2>&1
```

Run it right after seeding, because seed dates are relative to load time.

Writes run inside `BEGIN … ROLLBACK`, so the data is unchanged afterwards. The view `request_current_status` and the procedures `mark_all_read` and `mark_read` stay in the database, and rerunning the file is safe.
