# ENSF 608 application database tests

These SQL cases check the 25 course relations in the application's PostgreSQL schemas. They use the existing application setup scripts and Request test seed. The tests check database behavior directly. Service endpoints and broker delivery have separate tests.

## Run

Use a separate PostgreSQL instance and a fresh database. Set `PGHOST`, `PGPORT`, and `PGUSER` to the test instance. The setup user needs permission to create the database, schemas, and roles used by the init scripts.

From the repository root in Bash:

```bash
createdb ecocollect_608_test
for file in db/init/*.sql db/request/*.sql backend/test/request/seed.sql; do
  psql -X -v ON_ERROR_STOP=1 -d ecocollect_608_test -f "$file" || exit 1
done
psql -X -v ON_ERROR_STOP=1 -d ecocollect_608_test -f backend/test/ensf608/application.sql
```

Run the last command again to repeat the checks without reloading the seed. The test writes roll back.

## Cases and results

| Case | Expected result | Observed |
| --- | --- | --- |
| APP01 | The four application schemas contain 25 course tables, 100 columns, 25 primary keys, and 30 validated foreign keys. | Pass |
| APP02 | A join from delivery through assignment and window to request returns two deliveries with a combined estimated weight of 5.60 kg. | Pass |
| APP03 | Two facilities accept phones, and the first example facility accepts eight categories. | Pass |
| APP04 | A valid award notification can be inserted and joined to its award. | Pass |
| APP05 | An award notification referencing an unknown award is rejected with `23503`. | Pass |
| APP06 | A duplicate facility and category pair is rejected with `23505`. | Pass |
| APP07 | PostgreSQL rejects a zero quantity with `23514` and a missing public name with `23502`. | Pass |
| APP08 | Updating the notification's read state and deleting the notification both succeed. Its award remains. | Pass |
| APP09 | The test award is absent after rollback. | Pass |

All nine cases passed twice on PostgreSQL 18.6. See the [saved output](results/application.txt).
