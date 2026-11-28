# Database operations and queries

The [27 SQL operations](operations.sql) use the application schemas and the sample data loaded in [Section 4](<../4. Physical model/README.md>). Use the same test database as the [Section 6 suite](../../../../backend/test/ensf608/README.md).

The course requires at least 25. G3 (expired requests per month) and C2 (delivered quantities per item category) were added for questions 3 and 5 in our project proposal.

From the repository root in Bash:

```bash
psql -X -a -v ON_ERROR_STOP=1 -d ecocollect_608_test \
  -f "docs/Final Submission/ENSF608/5. Database operations and queries/operations.sql"
```

The write examples roll back. The catalog creates a helper schema for its status view and two demonstration procedures, then removes that schema after the last operation. Run the catalog shortly after loading the date-relative seed.

If a run stops on an error, fix the reported error and use a new test database for the retry. Follow the Section 4 setup with an unused database name and pass that same name to `psql -d` above. A failed run can leave the `ensf608_queries` helper schema in the previous test database.

See the [saved output](results/operations.txt) for the actual results.
