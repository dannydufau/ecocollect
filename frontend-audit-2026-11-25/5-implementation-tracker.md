# EcoCollect Frontend Remediation — Implementation Tracker

- **Audit baseline commit:** `origin/frontend` @ `257c0ff`
- **Implementation branch:** `frontend-remediation` (branched from `origin/frontend` @ `257c0ff`; `origin/frontend` remains at `257c0ff`; `origin/main` advanced to `0cf661b`)
- **Upstream PRs reviewed:** PR #491 (`frontend` → `main`, open, `CONFLICTING`), PR #492 (`fe-130-screenshot-comparison-464` → `frontend`, open; reports 18 routes over JS budget and `/forgot-password` missing baseline)
- **Open coordination issues:** #394 (real-stack integration), #395 (deployment/Docker), #399 (Notification Service PR), #464 (testing/a11y/device verification), #471 Part 1 (Q12 404 vs 204 decision), #472 (proposed a11y/perf NFRs)

## Verification summary (`frontend-remediation`, final closure state)

| Check | Result | Verification tier |
|---|---|---|
| Unit tests (`vitest run`) | **1,210 passed / 0 failed** (93 files: 1,166 sandboxed across 91 files + 44 loopback across 2 files) | Unit / jsdom + mock HTTP |
| Lint (`npm run lint`) | **Clean** (0 errors, 0 warnings) | Static |
| Type check (`npx tsc --noEmit`) | **Clean** (0 errors) | Static |
| Production build (`npm run build`) | **Passed** (`next@16.4.6`, 19/19 routes, 0 warnings/nudges) | Production build |
| Demo + VAPID production build | **Passed** (`NEXT_PUBLIC_DEMO=true NEXT_PUBLIC_VAPID_KEY=BTestPublicVapidKey12345` baked into `.next/static/`; 0 private secrets leaked; `public/sw.js` & `manifest.webmanifest` built) | Production build |
| Bundle size (`npm run size`) | **Passed** (0 exit code across all 19 routes including `/forgot-password` after authorized `npm run size -- --write`; raw 669,980–712,507 B, gzip 202,644–215,583 B) | Build budget |
| Dependency audit (`npm audit --omit=dev`) | **0 Next.js advisories**; 4 high transitive `@grpc/grpc-js` advisories via `firebase@13.1.0` → `@firebase/firestore@4.19.0`, proven non-bundled and unreachable in client/SSR output | Security / lockfile |
| Complete Chromium Playwright suite | **393 passed / 223 skipped / 0 failed** (616 discovered across 4 specs × 4 viewports `320, 375, 768, 1280`; 0 retries, 0 flakes; 0 CSP console errors) | Browser (mock API) |
| Complete Firefox Playwright suite | **387 passed / 228 skipped / 1 intermittent browser crash** (616 discovered across 4 specs × 4 viewports; `routes.pw.ts` `[firefox-375] my-requests` hit known Firefox `AxeBuilder.analyze()` `Page crashed`; clean `routes.pw.ts` re-run **102 passed / 34 skipped / 0 failed**; 0 assertion failures) | Browser (mock API) |
| Complete WebKit Playwright suite | **388 passed / 228 skipped / 0 failed** (616 discovered across 4 specs × 4 viewports; 0 retries, 0 flakes) | Browser (mock API) |
| Lab CLS / LCP (5 runs/route; 375×667, 150 ms RTT, 1.6 Mbps, 4× CPU) | `/login` CLS **0.0000**, LCP **764 ms**; `/stats` CLS **0.0000** (down from 0.071), LCP **752 ms**; `/resident` CLS **0.0000**, LCP **2,248 ms**; `/volunteer` CLS **0.0000** (down from 0.199), LCP **2,264 ms**; `/resident/requests/new` CLS **0.0267**, LCP **2,360 ms**; `/profile` CLS **0.0000**, LCP **2,452 ms** | Browser (throttled lab) |
| Docker image build (`docker compose build frontend`) | **Blocked** — Docker daemon not running on host (`/var/run/docker.sock` absent) | Infrastructure |
| Real-stack integration (#394) & Push E2E (#399) | **Pending** — requires live backend, Caddy, Firebase Auth, ImageKit, VAPID | Real stack |
| Screen reader verification (`A11Y-04`, #464) | **Pending** — requires manual VoiceOver (macOS/iOS) & NVDA (Windows) pass | Manual assistive tech |

## Issue tracker (all 43 findings)

| Issue | Severity | Status | Implementation | Verification evidence | Blocker |
|---|---|---|---|---|---|
| REL-01 | High | Resolved and verified | `app/providers.tsx` (`mutations.networkMode: "always"`) | Unit (`providers.test.tsx`) + Complete Chromium, Firefox & WebKit `e2e/remediation.pw.ts` | None |
| DBL-01 | Medium | Resolved and verified | `lib/use-locked-mutation.ts` wired into `useRequestAction`, profile & notification mutations; duplicate refs removed | Unit (`use-request.test.tsx`, `accept-request.test.tsx`, `deactivate-account.test.tsx`, 230/230) | None |
| FORM-01 | High | Resolved and verified | `windows-picker.tsx` (`onIncompleteChange`, `showIncomplete`), wired into `request-form.tsx`, `cancel-assignment.tsx`, `report-missed.tsx` | Unit (75/75 across 4 suites) | None |
| FORM-02 | High | Resolved and verified | `photo-picker.tsx` (`onBusyChange`), `request-form.tsx` (disables submit with hint while uploading) | Unit (46/46 across 2 suites) | None |
| RES-01 | Medium | Resolved and verified | `lib/api.ts` (`REQUEST_TIMEOUT_MS = 15_000`, `ApiTimeoutError`, `signal`), `lib/upload/upload-photo.ts` (`UPLOAD_TIMEOUT_MS = 45_000`, `signal`), `photo-picker.tsx` (Cancel upload), `lib/use-request.ts` (refetch on write timeout) | Unit (70/70 across 4 suites) | None |
| PUSH-01 | High | Resolved and verified | `lib/push.ts` (unsubscribe on failed POST), `lib/auth.ts` (browser unsubscribe on sign-out/deactivation `skipServer`), `lib/auth-context.tsx`, `lib/api.ts` (unsubscribe on 401 expiry) | Unit (58/58 across 5 suites) | Real push delivery needs DEP-01 & #399 |
| DEP-01 | High | Partially verified — Docker host blocked | `frontend/Dockerfile`, `docker-compose.yml`, `.env.example` (`NEXT_PUBLIC_VAPID_KEY`, `NEXT_PUBLIC_DEMO` build args) | Verified `next build` with demo + VAPID env vars (`BTestPublicVapidKey12345` in `.next/static/`, 0 private secrets leaked, `public/sw.js` & `manifest.webmanifest` built) | Docker daemon unavailable on host; infra review (#395) |
| SEC-02 | Medium | Resolved and verified | Upgraded `next` and `eslint-config-next` from `16.4.3` to `16.4.6` (`--save-exact`) | `npm audit --omit=dev` (0 Next.js advisories; `@grpc/grpc-js` proven absent from `.next/static/` & `.next/server/`); clean `next build` & 1,210/1,210 unit tests | None |
| NAV-01 | High | Resolved and verified | `new-request-form.tsx` (`#review` history state + `popstate` + stale `#review` cleanup on mount) | Unit (`new-request-form.test.tsx` 28/28) + Complete Chromium, Firefox & WebKit `e2e/remediation.pw.ts` | None |
| NAV-02 | Medium | Resolved and verified | `lib/use-unsaved-warning.ts`, user-scoped `sessionStorage` draft in `new-request-form.tsx`, `beforeunload` on edit & register (no passwords stored); fixed `auth-context.tsx` to preserve draft across initial `null → uid` hydration | Unit (`new-request-form.test.tsx`, `edit/page.test.tsx`, `register-form.test.tsx`) + Complete Chromium, Firefox & WebKit `e2e/remediation.pw.ts` | None |
| NAV-03 | Medium | Resolved and verified | `lib/api.ts` (`saveReturnTo` in `endExpiredSession` before `signOut`) | Unit (`lib/api.test.ts` 22/22) | None |
| NAV-04 | Low | Resolved and verified | `lib/return-to.ts` (allow exact `/resident` and `/volunteer` + `roleOf`) | Unit (`lib/return-to.test.ts` 11/11) | None |
| NAV-05 | Medium | Resolved and verified | `app/resident/requests/[id]/edit/page.tsx` (`router.replace(back)`) | Unit (`edit/page.test.tsx` 14/14) | None |
| NAV-07 | Medium | Resolved and verified | `components/app-header.tsx` (show My requests & Available for two-role accounts with no active role) | Unit (`app-header.test.tsx` 41/41) + Complete Chromium, Firefox & WebKit `e2e/remediation.pw.ts` (`375` & `1280`) | None |
| ACT-01 | Medium | Resolved and verified | `volunteer/cancel-assignment.tsx` (`?cancelled=1`, treats 404 `request_unavailable` as success), `volunteer/history/page.tsx` (focusable banner + strip param) | Unit (`volunteer/cancel-assignment.test.tsx`, `volunteer/history/page.test.tsx`) | #471 Part 1 (tracks final Q12 contract wording) |
| UI-01 | Medium | Resolved and verified | `volunteer/request-detail.tsx` ("After you collect the items, the resident confirms the collection.") | Unit (`volunteer/request-detail.test.tsx` 31/31) | None |
| FORM-03 | Medium | Resolved and verified | `maxLength={500}` + `N / 500 characters` counter on all 5 notes/reason textareas | Unit (all 5 suites passing) | None |
| NAV-06 | Medium | Resolved and verified | URL-backed filters (`router.replace`) + reactive Back/Forward sync on `my-requests.tsx`, `volunteer/history/page.tsx`, `volunteer/available-requests.tsx` | Unit (3 suites) + Complete Chromium, Firefox & WebKit `e2e/remediation.pw.ts` | None |
| NAV-08 | Low | Resolved and verified | `components/resident/my-requests.tsx` (strip `?created=N` via `router.replace` after reading) | Unit (`my-requests.test.tsx` 21/21) | None |
| NAV-09 | Low | Resolved and verified | `components/require-role.tsx` (`?need=${role}`), `app/choose-role/page.tsx` (info alert) | Unit (`require-role.test.tsx`, `choose-role/page.test.tsx`) | None |
| A11Y-01 | High | Resolved and verified | `app/layout.tsx` (`template: "%s · EcoCollect"`) + 17 route segment `layout.tsx` metadata titles; nested `title: { default, template }` on resident, volunteer, and request-detail layouts | Complete `e2e/routes.pw.ts` across all 4 viewports (`320, 375, 768, 1280`) in Chromium, Firefox & WebKit | None |
| A11Y-03 | Medium | Resolved and verified | `app/globals.css` (`scroll-padding-bottom` & `scroll-margin-bottom` below 960 px) | Complete Chromium, Firefox & WebKit `e2e/remediation.pw.ts` (`320, 375, 768`) | None |
| A11Y-02 | Medium | Resolved and verified | `app/profile/editable.tsx` (focus first field on open), `resident/request-detail.tsx`, `volunteer/request-detail.tsx`, `volunteer/history/page.tsx` (focus notice on action) | Unit (passed, lint/tsc clean) | None |
| A11Y-04 | Medium | Awaiting manual verification | A11Y-02 focuses action notices; screen reader speech output requires VoiceOver / NVDA | Automated axe 0 violations across all 17 routes (`routes.pw.ts`); manual AT checklist prepared | VoiceOver / NVDA unavailable in automated environment (#464) |
| UI-02 | Low | Resolved and verified | `components/app-header.tsx` (single-row signed-out header at 375 px; `"Stats"` with `aria-label="Community stats"` below `sm:`) | Unit (`app-header.test.tsx` 41/41) + 5-run Lab CLS on `/stats` = **0.0000** (down from 0.071) | None |
| UI-03 | Low | Resolved and verified | `app/volunteer/history/page.tsx` (`flex flex-wrap` header row for long status badges) | Unit (`history/page.test.tsx` 20/20) | None |
| A11Y-05 | Low | Resolved and verified | `components/ui/empty-state.tsx` (`heading` prop for `<h1>`), `components/route-fallback.tsx` (`heading` + `outline-none`) | Lint/tsc + axe clean | None |
| A11Y-06 | Low | Resolved and verified | `app/globals.css` (`@media (forced-colors: active)` outlines/borders for selected & primary controls) | CSS/lint verified | Manual Windows High Contrast check (#464) |
| A11Y-07 | Low | Resolved and verified | `components/demo-banner.tsx` (`<aside aria-label="Demo mode">`) | Unit (`demo-banner.test.tsx` 3/3) | None |
| RES-02 | Medium | Resolved and verified | `components/connection-banner.tsx` (offline + delayed SSE banner), `lib/sse.ts` (`startSession` before retry + `delayed` state), `app/providers.tsx` | Unit (`sse.test.tsx`, `providers.test.tsx`) + Complete Chromium, Firefox & WebKit `e2e/remediation.pw.ts` | None |
| AUTH-01 | Medium | Resolved and verified | `lib/auth-context.tsx` (`rolesError`, `retryRoles`), `app/choose-role/page.tsx` (`QueryError` with Try again instead of signOut) | Unit (`auth-context.test.tsx`, `choose-role/page.test.tsx`, 33/33) | None |
| PERF-01 | Medium | Resolved and verified | `components/volunteer/available-requests.tsx` (single loading state until both profile codes and requests are ready) | Unit (`available-requests.test.tsx` 19/19) + 5-run Lab CLS on `/volunteer` = **0.0000** across all 5 runs (down from 0.199) | None |
| SEC-01 | Medium | Resolved and verified | `next.config.ts` (`poweredByHeader: false`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, enforced `Content-Security-Policy` with `'unsafe-eval'` scoped to dev only + `worker-src 'self'` + `object-src 'none'`) | Complete Chromium, Firefox & WebKit `e2e/remediation.pw.ts` + zero CSP console errors across all 17 routes in `routes.pw.ts` | Caddy HSTS on real HTTPS domain (#395) |
| CON-01 | Low | Resolved and verified | `frontend/mock/` (`validation_error` → `validation_failed`, 500-char limits on notes & reason) | Unit (`mock/routes/*` + `mock/resident-actions.test.ts` 34/34) | #471 Part 1 (tracks final Q12 404/204 contract) |
| UI-04 | Low | Resolved and verified | `app/profile/page.tsx` (date-only Member since), `app/ecopoints/page.tsx` (`text-caption` pill), `app/login/page.tsx` (`noValidate` + inline field errors) | Unit (`profile/page.test.tsx`, `ecopoints/page.test.tsx`, `login/page.test.tsx`) | None |
| UX-01 | Low | Resolved and verified | `components/resident/cancel-request.tsx` (late-cancel EcoPoints warning when Assigned & `outsideCancellationWindow`) | Unit (`cancel-request.test.tsx` 17/17) | None |
| FORM-04 | Low | Resolved and verified | `lib/validate-account.ts` (min 6-char password, max 80-char names, max 255-char street), `register-form.tsx` & `address-fields.tsx` (`maxLength`) | Unit (`validate-account.test.ts`, `register-form.test.tsx`) | User-service owner to document lengths in `openapi.yaml` |
| PWA-01 | Enhancement | Resolved and verified | `app/manifest.ts` (`id: "/"`, `description`); registered `/sw.js` at login in `lib/auth-context.tsx` per Contract §16.1 (zero offline caching) | Unit (`auth-context.test.tsx`) + Build/lint/tsc clean + `public/sw.js` & `manifest.webmanifest` built | None |
| PERF-03 | Enhancement | Deferred with justification | Kept initial SSE `onopen` invalidation to prevent missed updates across initial-fetch-to-stream gap (Contract §16.5) | Unit (`lib/sse.test.tsx` 22/22) | None (optional perf/correctness trade-off) |
| ENH-01 | Enhancement | Resolved and verified | `components/resident/request-detail.tsx` ("Create a new request" shortcut on terminal `Missed`, `Expired`, `Cancelled` pages when `!request.rescheduledAs`) | Unit (`resident/request-detail.test.tsx`) + Complete Chromium, Firefox & WebKit `e2e/acceptance.pw.ts` | None |
| SEC-03 | Low | Blocked (backend-owned) | Backend-owned (`backend/src/user/auth/router.cjs` `/verify` + `infra/caddy/Caddyfile` trust boundary); exact spec & tests documented without modifying `backend/` | Inspected `backend/src/user/auth/router.cjs`, `backend/test/user/auth/session.test.cjs`, `infra/caddy/Caddyfile`, `docker-compose.yml` | Backend owner |
| PERF-02 | Low | Resolved and verified | Root-cause split documented (+2,965–3,596 B gzip from prior PRs `f9161be`..`257c0ff`; +968–1,789 B gzip net remediation + `next@16.4.6` across previously baselined routes, 0 new runtime deps); `baseline-js.json` updated via authorized `npm run size -- --write` (19 routes incl. `/forgot-password`) | `npm run size` exits **0** across all 19 routes on final production build | Coordinate `baseline-js.json` with PR #492 |
| TEST-01 | Medium | Resolved for mock-API suite; real-stack pending | Added `e2e/remediation.pw.ts` (6 tests across applicable viewports), route `<title>` assertions in `e2e/routes.pw.ts`, `E2E_BROWSER` config in `playwright.config.ts`, Chromium-only `allow-discrete` markers in `e2e/visual.pw.ts` | 1,210/1,210 unit tests; Complete 616-test suites: Chromium 393/0 fail, Firefox 387/1 known Axe crash (102/0 on routes re-run), WebKit 388/0 fail | Real-stack integration (#394) & manual AT/device (#464) |

## Summary counts (all 43 findings)

- **Resolved and verified:** **39/43** (includes `PERF-02` after authorized baseline update; `TEST-01` resolved for mock-API automated regression across all 3 browsers)
- **Partially verified — infra blocked:** **1/43** (`DEP-01`: demo & VAPID production builds and secret scans passed; Docker daemon not running on host)
- **Awaiting manual verification:** **1/43** (`A11Y-04`: automated axe 0 violations; manual VoiceOver / NVDA screen reader pass required)
- **Blocked (backend-owned):** **1/43** (`SEC-03`: backend `/verify` cookie route restriction)
- **Deferred with justification:** **1/43** (`PERF-03`: keeps initial SSE `onopen` invalidation for correctness per Contract §16.5)
- **Remaining unaddressed:** **0/43**
