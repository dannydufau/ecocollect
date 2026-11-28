# Software quality

## Functional test report

**[test-report.pdf](test-report.pdf)** has all the functional testing in one place:

- the results, the coverage of FR01 to FR23, the test setup, and how to run the cases;
- 46 test cases, each with its steps, expected result and what happened;
- screenshots from the local runs, except FR02-P and FR08-P;
- the team's own records of their 38 manual cases, with their screenshots where they saved them.

All testing is manual. **44 cases pass, 1 fails and 1 is partly verified.** Every case has been run.

**Failed:** FR11-N. After the pickup window ended, the resident page still showed Cancel assignment. The app refused the cancellation and the request did not change. This run used one account as both resident and volunteer.

**Partly verified:** FR22-P. Terms acknowledgement passed. The version 3 safety guidelines were not verified.

## Acceptance and system tests

[cases/acceptance.md](cases/acceptance.md) has AT-1, AT-2 and ST-1, which check the whole system. They are not part of the report.
