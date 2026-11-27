# ENSF 608 database submission

This submission uses EcoCollect's application database. Use a fresh test instance for setup, queries, and testing.

| Section | Deliverable |
| --- | --- |
| 1. Conceptual database model | [ER diagram](<1. Conceptual Model(ER diagram)/ER-Diagram.drawio>) |
| 2. Logical database model | [Relational schema and constraints](<2. Logical model/README.md>) and [logical diagram](<2. Logical model/Logical Database Model.drawio>) |
| 3. Normalization | [First, second, and third normal form](<3. Normalization/README.md>) |
| 4. Physical database implementation | [Setup, schema files, and seed load order](<4. Physical model/README.md>) |
| 5. Database operations and queries | [Run instructions](<5. Database operations and queries/README.md>), [25 SQL operations](<5. Database operations and queries/operations.sql>), and [saved output](<5. Database operations and queries/results/operations.txt>) |
| 6. Database testing | [Test cases and commands](../../../backend/test/ensf608/README.md), [SQL tests](../../../backend/test/ensf608/application.sql), and [saved results](../../../backend/test/ensf608/results/application.txt) |

Follow Section 4 once, then run Sections 5 and 6 on the same database. The diagrams and normalization write-up cover the 25 course relations. Outbox and processed-event tables support the application and are outside the course model.

## Contribution evidence

See the pull requests for the [conceptual model](https://github.com/dannydufau/ecocollect/pull/106), [logical model](https://github.com/dannydufau/ecocollect/pull/172), [normalization](https://github.com/dannydufau/ecocollect/pull/185), [physical SQL and review](https://github.com/dannydufau/ecocollect/pull/198), [query catalog](https://github.com/dannydufau/ecocollect/pull/443), and [database tests](https://github.com/dannydufau/ecocollect/pull/500).
