# ENSF 608 database submission

This folder contains the standalone EcoCollect database for ENSF 608. Start here to review the design, build the database, run the tests, and reproduce the query results.

| Deliverable | Files |
| --- | --- |
| Conceptual model | [ER diagram](<1. Conceptual Model(ER diagram)/ER-Diagram.drawio>) |
| Logical model | [Relational schema and constraints](<2. Logical model/README.md>) and [logical diagram](<2. Logical model/Logical Database Model.drawio>) |
| Normalization | [First, second, and third normal form](<3. Normalization/README.md>) |
| Physical database and setup | [Setup guide](<4. Physical model/README.md>), [tables and constraints](<4. Physical model/tables.sql>), and [transaction procedures](<4. Physical model/transactions.sql>) |
| Sample data | [Course seed](<4. Physical model/seed.sql>) |
| SQL operations and queries | [Query guide](<5. Database operations and queries/README.md>), [25 operations](<5. Database operations and queries/operations.sql>), and [saved query output](<5. Database operations and queries/results/operations.txt>) |
| Database tests and results | [SQL verification](<4. Physical model/verify.sql>), [concurrency tests](<4. Physical model/verify_concurrency.py>), [saved results](<4. Physical model/results/>), and the expanded tests in [PR #499](https://github.com/dannydufau/ecocollect/pull/499) |
| Contribution history | [ENSF 608 commit history](https://github.com/dannydufau/ecocollect/commits/main/docs/Final%20Submission/ENSF608) |

## Run the course database

Use PostgreSQL and Python 3. From this folder, run the commands below against a fresh database. Set `PGHOST`, `PGPORT`, and `PGUSER` if your connection uses different defaults.

```sh
createdb ecocollect608_test
psql -X -v ON_ERROR_STOP=1 -d ecocollect608_test -f "4. Physical model/tables.sql" -f "4. Physical model/transactions.sql" -f "4. Physical model/seed.sql"
psql -X -v ON_ERROR_STOP=1 -d ecocollect608_test -f "4. Physical model/verify.sql"
python3 "4. Physical model/verify_concurrency.py" ecocollect608_test
psql -X -v ON_ERROR_STOP=1 -d ecocollect608_test -f "5. Database operations and queries/operations.sql"
```

The course seed includes terms documents, item categories, facilities, and the links between categories and facilities. The `facility_accepts` table lets a facility accept several categories and a category be accepted by several facilities.

## Application database

The application stores the 25 course relations in four schemas. Use the existing scripts to set up a separate test instance of the application database.

| Schema | Application SQL |
| --- | --- |
| `users` | [Account and terms tables](../../../db/init/005_user_tables.sql) and [terms seed](../../../db/init/031_user_seed.sql) |
| `requests` | [Request tables](../../../db/init/010_request_tables.sql) and [category, facility, and eligibility seed](../../../db/init/011_request_seed.sql) |
| `rewards` | [EcoPoints tables](../../../db/init/012_reward_tables.sql) |
| `notifications` | [Notification tables](../../../db/init/040_notification_tables.sql) |

The 608 diagrams and normalization write-up cover these course relations. Operational tables such as outboxes and processed-event records are outside the model.

See the [application database guide](../../../db/README.md) and [backend guide](../../../backend/README.md) for the service setup and tests. The Section 5 catalog and the course verification commands above currently use the standalone schema. Use the application database for Sections 5 and 6 once the catalog, fixtures, and tests have been updated and their results saved.
