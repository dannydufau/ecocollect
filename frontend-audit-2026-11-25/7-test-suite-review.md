# Frontend test suite review

The comparison starts with the contributor working tree after the maintainability cleanup. The case inventory lists the expanded unit test names and Playwright projects before and after. The historical requirement map covers FR01–24 and NFR01–06. The remediation tracker records the verification tier and open dependencies for all 43 findings. These records include manual, infrastructure and backend checks outside the automated frontend suite.

## Redundancy and coverage register

| Original tests or fixtures | Decision and equivalent protection |
|---|---|
| Resident request-actions, five terminal-state labels | Consolidate. Every row actually rendered the same empty allowed-actions array. The component receives no status. One empty-list case retains its assertion. Other allowed-action combinations and role detail tests remain. |
| Volunteer Open request, privacy and expiration cases | Consolidate into existing Open privacy and top-card tests. Preserve both full-body exclusions, unique closing-time label, formatted date and top-card containment. Reuse the Delivered fixture with an evidence-photo override. |
| Accent contrast against background and raised surface | Remove two lower-bound assertions. The retained 4.5:1 checks use exactly the same pairs and formula as the 3:1 checks. |
| Query provider and import-alias smoke tests | Remove the scaffolding spec. Actual stats queries depend on both the provider and alias. Move the exact single-digit hour expectation into the time suite. |
| Award query invalidation | Remove a repeated event, request ID and expected key array already exercised by the parameterized invalidation test. |
| Assigned resident status copy in time tests | Remove misplaced assertion. NextStepPanel's status-change test checks the same copy in rendered output. |
| Upload field serialization and successful upload | Consolidate the same input and response in the success case. Retain the exact serialized fields and success result. |
| ImageKit HTTP 400 message and cause | Consolidate. Both assertions inspect the same rejection, including the original cause. |
| Ten route-test response recorders | Replace the repeated status/body recorders with one small test-only response factory. Keep request inputs, expected errors and production mock routes intact. Remove duplicate terms seeding. |
| Browser heading order and horizontal overflow | Move assertions into the existing smoke navigation for each of 17 routes on the same engines and widths. Retain page readiness, heading visibility, level ordering, overflow and error checks. |
| Phone first-action bounds for seven statuses and two roles | Retain separate geometry and order tests. Combining them caused four repeatable Firefox page crashes even with one worker. Restoring the separate checks gave a clean full run. |
| Touch target sizes on four routes | Strengthen. Previously only the last page was measured. Each case now uses its own account, verifies the URL and measures the actual route. |
| Signed-in browser and screenshot setup | Share fixed clock and per-page account initialization. Route assertions, font readiness and screenshot waits stay with their callers. Poll the pressed scale instead of sleeping for 250 ms. |
| Offline reconnect observation, stream recovery, duplicate writes, upload timeouts, silent push replacement | Retain. These distinguish events, timing, roles or failure paths that a successful request alone cannot exercise. |

## Risk-based browser matrix

Every engine retains route, title, browser-error and action-order checks at 320, 375, 768 and 1280 px. Heading order and axe scans run at 375 and 1280 px. Overflow and bottom-navigation focus checks run at 320, 375 and 768 px. The four-route touch-target sweep uses 375 px. Header alignment covers additional desktop widths. The security header, reload-filter and offline mutation cases retain one desktop viewport per engine. Browser-specific exit-transition timing keeps its Chromium scope.

The full browser suite exercises the mock stack. The existing manual assistive technology, real-stack integration, push delivery, Docker and backend security limitations remain. The screenshot script captures artifacts separately from automated assertions.

Two targeted mutations in isolated copies made the retained component tests fail: displaying an action for an empty permission list and displaying the wrong expiration time. These checks support those specific consolidations. No statement, branch, function or line percentage is available for either run. The repository does not install a Vitest coverage provider. No instrumentation dependency was added.

## Results

| Metric | Before | After |
|---|---:|---:|
| Unit cases / files | 1,210 / 93 | 1,197 / 92 |
| Browser cases discovered per engine / specs | 616 / 4 | 492 / 4 |
| Browser cases executed across engines | 1,169 | 923 |
| Test and support source lines, including e2e utilities | 11,993 | 11,933 |
| Equivalent mock status/body recorders | 10 | 1 |
| Unit runner duration | 20.7 s | 34.0 s |
| Chromium passed / failed / skipped | 393 / 0 / 223 | 311 / 0 / 181 |
| Firefox passed / failed / skipped | 388 / 0 / 228 | 306 / 0 / 186 |
| WebKit passed / failed / skipped | 388 / 0 / 228 | 306 / 0 / 186 |
| Chromium / Firefox / WebKit duration | 105.2 / 167.8 / 129.5 s | 55.3 / 109.4 / 129.5 s |
| Sum of unit and engine durations | 423.2 s | 328.2 s |

These single-run timings include different build cache states and host load. The totals exclude targeted reruns. Unit execution took longer in the final measurement. The reproducible efficiency improvement is 246 fewer browser executions with identical engine support.

Lint, TypeScript, all final unit tests and the production build passed. The bundle check failed on all 19 routes with the documented public settings. The size output exactly matched the preceding maintainability review, including the uniform 26 raw byte and 10 gzip byte overage. All final axe checks passed. During the rejected consolidation, Firefox reported four page crashes measuring phone action bounds and one during a volunteer-request axe scan. The historical remediation run also recorded a Firefox axe crash, while this audit’s pre-change Firefox baseline passed.

[Expanded case inventory](evidence/test-case-inventory.tsv) · [FR and NFR coverage map](4-traceability-and-topics.md) · [43-finding remediation evidence](5-implementation-tracker.md)
