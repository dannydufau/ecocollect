# Software quality

## Functional test report

**[test-report.pdf](test-report.pdf)** has all the functional testing in one place:

- the results, the coverage of FR01 to FR23, and how to run the cases;
- 46 test cases, each with its steps, expected result and how it was checked;
- screenshots from the local runs, except FR02-P and FR08-P;
- the team's own records of their 38 manual cases, with their screenshots where they saved them.

All testing is manual. **45 cases pass and 1 fails.** Every case has been run.

**Failed:** FR11-N. After the pickup window ended, the resident page still showed Cancel assignment. The app refused the cancellation and the request did not change. This run used one account as both resident and volunteer.

## Acceptance and system tests

[cases/acceptance.md](cases/acceptance.md) has AT-1, AT-2 and ST-1, which check the whole system. They are not part of the report.

## Update the report

Edit [report/test-report.tex](report/test-report.tex), then rebuild from the `report/` folder with [Tectonic](https://tectonic-typesetting.github.io/):

```bash
tectonic test-report.tex --outdir ..
```

The first build may download LaTeX packages. Commit the `.tex` and the rebuilt PDF together.

- Each case is one `\testcase` entry. When a result changes, also update the totals, the coverage table and this page.
- Add screenshots to `report/screenshots/` with `\shot`. This repository is public, so crop out the browser bars and black out personal details first.
- The team's records are in `report/team-records/`. If one changes, check its page count and `\record` lines.
