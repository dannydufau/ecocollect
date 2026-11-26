# Frontend maintainability review

The comparison starts with the uncommitted remediation working tree on `frontend-remediation` at `257c0ff`. Comparing directly to the commit would attribute earlier contributors’ work to this cleanup. The inventory covered 280 tracked or non-ignored frontend files, including route conventions, mocks, public assets, configuration, scripts and tests. Review combined file inventories, static scans, reference checks and closer reading of candidates and consumers. It does not establish that every line or comment received an individual manual review.

## Change register

| Area | Before | After and reason | Verification |
|---|---|---|---|
| Mock response serialization | Five route modules defined identical JSON writers. The error writer performed the same serialization separately. | Accounts, notifications, uploads, residents and volunteers import one writer from the existing store module. The error helper calls it with the original error envelope. Headers, status, fields, call sites and authorization rules retain their previous behavior. | 138 mock route tests plus full unit and browser suites |
| Terms query | `api.get<{ termsDocumentId: string; content: string; publishedAt: string }>` | `api.get<TermsDocument>` uses the existing OpenAPI schema alias. A contract change now reaches this query through type generation. The request is identical. | TypeScript and unit suite |
| Registration validation comment | Described the date picker maximum as the oldest qualifying birth date | Identifies the latest eligible birth date. The leap-day rule stays beside the code. | Comment-only diff |
| Header navigation test | Each case repeated the active role, e.g. `["resident", "resident", "/resident"]` | `["resident", "/resident"]` supplies both the title parameter and role used by the test. Both roles still assert the exact brand link. | Header suite, TypeScript unused-parameter check |
| Browser regression description | NAV-06 title claimed history Back coverage, but the test reloads the page | Title now describes the reload assertion. No test steps changed. | Playwright discovery and browser suites |
| ESLint | Four default ignore patterns repeated the Next.js preset | The project adds just the alternate test build folder to the preset. | Inspected installed preset and ran lint |
| Frontend README | Named an obsolete budget commit and Next.js version, omitted the engine selector, presented an old dependency report without a date, and promised a demo screenshot | Documents three browser commands, current budget provenance and the screenshot limitation. Links to dated remediation evidence. | Checked package scripts, Playwright servers, screenshot targets, build and audit records |

No files were removed, renamed or relocated. Five copies of one function were consolidated without introducing a module. No CSS, asset, lockfile, threshold or test assertion changed.

## Scorecard

Scores are reviewer judgments on a ten-point scale. Half-point changes indicate localized improvements. Execution results are recorded separately.

| Category | Before | After | Evidence |
|---|---:|---:|---|
| Simplicity | 8 | 8.5 | One response writer serves five route modules |
| Readability | 8 | 8.5 | Shorter terms query and two-column navigation fixture |
| Naming | 8 | 8 | Route, hook and component names generally identify their responsibilities |
| Comments | 8 | 8.5 | Corrected reversed cutoff description and removed copied config commentary |
| File organization | 8 | 8 | Route metadata, colocated tests and mock route discovery justify separate files |
| Architecture clarity | 8 | 8 | Authentication, API access and stream recovery have distinct responsibilities |
| TypeScript | 8 | 8.5 | Terms query now derives its response type from the contract |
| React and Next.js | 8 | 8 | Server metadata layouts and client mutation guards serve distinct lifecycle needs |
| Duplication | 7.5 | 8 | Five mock response writers became one |
| Test maintainability | 8 | 8.5 | Removed duplicated fixture values and corrected overstated test name |
| Documentation | 7 | 8 | Browser, screenshot and budget instructions reflect current configuration |
| Configuration | 7 | 7.5 | ESLint inherits framework defaults. Docker context still excludes imported fixtures |
| Overall maintainability | 8 | 8.5 | Fewer independent representations of the same response and clearer verification instructions |

## Repository statistics

Physical lines include comments and blanks. Source includes frontend scripts, mock code and executable configuration. Test counts include fixtures, setup and browser helpers. Generated API types are separate. Counts exclude ignored build output, dependencies and the audit directory outside the frontend.

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Handwritten source files | 157 | 157 | 0 |
| Handwritten source lines | 8,718 | 8,692 | −26 |
| Test and support files | 106 | 106 | 0 |
| Test and support lines | 11,993 | 11,993 | 0 |
| Frontend Markdown files | 2 | 2 | 0 |
| Generated API source files / lines | 1 / 2,665 | 1 / 2,665 | 0 |
| Other assets and configuration files | 14 | 14 | 0 |
| Unused TS imports identified | 0 | 0 | 0 |
| Confirmed unused test parameters | 1 | 0 | −1 |
| Runtime dependencies | 5 | 5 | 0 |
| First-load gzip range, README placeholder configuration | 202,654–215,593 B | 202,654–215,593 B | 0 B on every route |

The unused-parameter count covers the compiler finding. There is no repo-wide proof that every public export is reachable. Public barrel entries alone do not justify deleting their implementations.

## Complexity retained

- A synchronous mutation lock covers a second click before React renders the pending state. Query retry policy, offline behavior, timeout handling, upload cancellation and idempotency address different failure modes.
- Stream connection invalidation covers updates between the initial query and the SSE connection. Reauthentication on reconnect and the delayed-connection banner serve separate purposes.
- Drafts are scoped to the user and the current navigation flow. The unload listener, review-step history and role selection each protect a different transition. Role selection after login and per-tab role state remain intact.
- Metadata layouts set titles for individual routes. Focus restoration, mobile navigation clearance, forced colors, reduced motion and browser-specific animation assertions cover distinct accessibility and rendering conditions.
- Focused tabs suppress ordinary pushes. The service worker’s silent replacement path updates an existing notification under the separate contract rule. Logout and manual unsubscribe also have different error-handling requirements.
- Calgary formatting and both pickup-window formats implement existing contracts. Resident and volunteer actions retain distinct permissions, messages and confirmation behavior. No offline cache, debouncing or memoization was added.

## Separate functional findings

- The Docker build context excludes `mock/` and includes browser test sources that import its fixtures. A temporary tree reproducing the exclusion yielded five TS2307 errors. The image itself still needs a Docker build. Fixing its build context changes deployment behavior and merits independent verification.
- The screenshot harness disables demo mode. Its demo target therefore captures a 404. Capturing the demo requires a separate build.
- The birth-date validator can call `toISOString()` on an invalid date when a string has the expected shape but an impossible month. The mock upload MIME check uses inherited object membership. Both require validation behavior changes and targeted regression tests.

## Final verification

| Gate | Previous remediation record | Cleanup run |
|---|---|---|
| Vitest | 1,210 passed | 1,210 passed in 93 files. Before editing, the restricted run failed on HTTP listeners and the loopback-enabled retry passed all 1,210. |
| Chromium | 393 passed, 223 skipped | 393 passed, 223 skipped |
| Firefox | 387 passed, 228 skipped, one axe browser crash. Route-suite rerun passed. | 388 passed, 228 skipped |
| WebKit | 388 passed, 228 skipped | 388 passed, 228 skipped |
| Browser coverage | 616 discovered per engine | 616 per engine across four viewport projects. Included acceptance, remediation, visual and route tests, serious/critical axe checks at 375 and 1280 px, and browser security-header assertions. |
| Lint and TypeScript | Clean | Both passed, including a final compiler run with unused locals and parameters enabled. |
| Production and demo builds | Passed | Both passed in a clean copy with the installed dependencies. Turbopack repeatedly failed to bind its CSS loader port in the original checkout. Demo build contained the test public VAPID key and emitted the manifest. Public static chunks contained no PEM private-key headers. |
| Bundle budget | 19/19 passed | 0/19 with the documented placeholder settings. Each route exceeded its recorded limit by 26 raw bytes and 10 gzip bytes both before and after cleanup. The two size reports matched exactly. A separate final build with local settings also exceeded the limits. Budget file intact. |
| Dependency audit | Four high transitive findings | Four high findings in the Firebase / Firestore / gRPC dependency chain. No Next.js advisory reported. |
| Performance | Five-run lab measurements recorded in the tracker | Compared route JS bytes and ran the existing browser visual/layout assertions. No new throttled Lighthouse or field measurements. |

The cleanup-only diff contains 28 insertions and 52 deletions across 12 existing frontend files. It was compared against a snapshot of the contributor working tree and checked for reverse applicability. The tracker still lists all 43 findings. The behavioral suites passed, including mock contracts and the remediation browser cases. Full closure still depends on the Docker image, real-stack integration and push delivery, manual assistive-technology/device checks and backend-owned cookie-route work. PERF-03 keeps the initial stream invalidation. PERF-02 has a reproducible discrepancy between the recorded budget and both builds made with the documented public settings.

The cleanup is ready for code review. The passing behavioral checks and identical before/after bundle sizes support a behavior-preserving change. Integration sign-off remains open on the budget discrepancy and deployment verification.
