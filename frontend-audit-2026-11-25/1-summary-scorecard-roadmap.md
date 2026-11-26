# EcoCollect frontend audit: summary, scorecard, checklist, roadmap

Date: 2026-11-25. Audited: `origin/frontend` at `257c0ff`. All file and line references are to that commit (your checkout is on another branch, so line numbers there can differ). Audit and planning only: no code, tickets, commits or pushes.

| File | Contents |
|---|---|
| 1 (this one) | A summary, B scorecard, F checklist, G roadmap, method and limits |
| [2-issue-register.md](2-issue-register.md) | E: every issue with evidence, fix, acceptance criteria and test |
| [3-screens-and-navigation.md](3-screens-and-navigation.md) | C: screen by screen. D: navigation matrix and map |
| [4-traceability-and-topics.md](4-traceability-and-topics.md) | Requirements matrix, testing strategy, topic notes |
| [evidence/](evidence) | Screenshots of confirmed visual defects and the repro scripts |

## How it was checked

| Check | Result |
|---|---|
| `npm test` | 1187 passed, 92 files |
| `npm run lint`, `npx tsc --noEmit` | Clean |
| `npm run e2e` (Chromium) | 384 passed, 208 skipped, 0 failed |
| Same suite in Playwright WebKit and Firefox (temporary config) | 469 passed, 116 skipped, 7 failed: 6 motion-timing tests that only work in Chromium, 1 Firefox page crash during an axe scan (crashed 1 of 3 re-runs) |
| Screen sweep: 50 targets at 375 and 1280 px | No app errors, no horizontal overflow. axe found only best-practice items (404 has no h1, demo banner outside a landmark) |
| axe with dialogs, menu sheet, editors open (375 px) | No violations |
| Scripted journeys: navigation, forms, double clicks, session expiry, offline, hanging and failing API, SSE | Results are in the issue register |
| Keyboard, route announcement, focus hidden, WCAG text spacing, landscape, forced colours | Same |
| Production build | Succeeds on a normal build (see the note on the Next.js notice below) |
| `npm run size` | **Fails**: 18 routes are 2,965 to 3,596 gzip bytes over, `/forgot-password` has no baseline |
| `npm audit` | 12 findings: 4 high, 8 moderate (SEC-02) |
| Lab speed, emulated slow phone | See file 4 |
| Push registration | Temporary unit test with a fake browser push API (2 repros), then removed |

Runtime used the signed-in test build against the **mock API** with a fake Firebase config. The demo build was rendered separately with outside hosts blocked.

**Not verified** (do not read any of these as passing): real Firebase sign-in, token expiry and reset email; the real backend services; real push delivery; real ImageKit upload; the Docker images and Compose stack (configuration was read, not run); VoiceOver, NVDA, TalkBack; a physical iPhone or Android phone; branded Edge or Safari (only Playwright engines); virtual keyboard and home-indicator insets; HEIC photos from an iPhone; Lighthouse; field Core Web Vitals.

**Note on the Next.js notice.** The first `next build` in my shell stopped with a security error whose text told an AI agent to recommend an upgrade and offer to run `next upgrade --agent=security`. I did not follow it. Next.js shows that stop only when it detects an AI agent, so people and Docker builds are not blocked. The advisory itself is real and is checked in SEC-02.

## A. Executive summary

**Maturity:** a careful, consistent, well-tested UI with a solid happy path. It is **not ready for release**. The weak spots are what happens when things are interrupted: Back, a slow upload, a half-filled field, no network, a second click, signing in again.

**Strengths (verified)**
- Consistent design system with tokens and a style guard test. No horizontal overflow from 320 to 1280 px.
- No serious or critical axe violations on the screens and dialogs scanned. Dialogs trap focus and return it on Escape.
- Request creation reuses its `Idempotency-Key` on retry (checked for 429 and 503). A double click on Confirm collected sends one request.
- No `dangerouslySetInnerHTML`, no secrets found in tracked frontend files, redirect targets are restricted to our own pages, photo uploads do not send the Firebase token to ImageKit, cached data is dropped when the user changes.
- Role guards, not-found handling and error states exist on the data pages. Text spacing and 200% zoom held up.

**Release blockers**

| ID | Problem |
|---|---|
| DEP-01 | The Docker build never receives the push key or the demo flag, so push cannot be turned on and the demo cannot be built |
| PUSH-01 | After signing out and in again, the page says push is "On" but the server has no subscription, with no way to fix it |
| FORM-01 | A half-filled pickup window is silently dropped. In "Cancel assignment" the new window vanishes and the page says "Done" |
| FORM-02 | Sending while a photo is uploading creates the request without the photo |
| REL-01 | An action pressed offline is queued silently and sent later, even after the person left the page (reproduced with Confirm collected) |
| NAV-01 | Browser or phone Back on the review step leaves the page and erases everything typed |
| A11Y-01 | Every page is titled "EcoCollect" (WCAG 2.4.2, Level A) and page changes are not announced |

There are no Critical findings: I found no security exposure and no loss of stored data. 7 High, 19 Medium, 14 Low, 3 Enhancements (43 in all). One of the Medium items (A11Y-04) is suspected, not confirmed.

**Biggest UX problems:** lost input (NAV-01, NAV-02), silent outcomes (FORM-01, FORM-02, REL-01, ACT-01), endless spinners (RES-01, RES-02), and a two-role account losing its navigation on shared pages (NAV-07).

**Most valuable improvements, smallest first**
1. `mutations: { networkMode: "always" }` fixes REL-01 in one line.
2. Save the return page inside the expiry handler (NAV-03).
3. Put one double-submit guard in `useRequestAction` and use it everywhere (DBL-01).
4. Unsubscribe the browser on every sign-out (PUSH-01).
5. Pass two build args through Docker (DEP-01).
6. Per-route titles (A11Y-01).
7. `scroll-padding-bottom` for the phone nav bar (A11Y-03).

**Outside the frontend, but it blocks the whole product:** stored notifications and push sending depend on the open Notification Service PR #399, and `frontend` is not merged into `main` yet (#491 waits for a non-author approval). #394 (integration) and #395 (deployment) have empty descriptions.

**Scope note:** WCAG 2.2 AA is the target your brief set. The approved NFRs have no accessibility requirement; #472 only proposes one. NFR02 (usability) is approved.

## B. Scorecard

Method: each issue counts in one primary area. 9–10: nothing open above Low. 7–8: Medium at worst. 5–6: one or two High, or many Medium. 3–4: three or more High on core flows. 0–2: core flows unusable. A score covers only what was verified.

| Category | Score /10 | Evidence | Major gaps |
|---|---|---|---|
| Navigation | 5 | Journeys J1, J5, J6, J14 | NAV-01, 02, 03, 05, 06 |
| Information architecture | 7 | Sweep, nav review | NAV-07 |
| User experience | 5 | Journeys | Lost input and silent outcomes |
| Visual design | 8 | 100 screenshots | UI-01 to UI-03 |
| Design consistency | 8 | Tokens, style guard, screenshots | UI-04 |
| Accessibility | 5 | axe clean; manual checks failed | A11Y-01, 02, 03; screen readers untested |
| Responsive design | 8 | 320–1280, landscape, text spacing | Real devices not verified |
| Interaction feedback | 5 | J8, J10–J12, J15, J17 | REL-01, ACT-01, stuck dialogs |
| Form usability | 5 | J2, J3, J22, R1–R3 | FORM-01, FORM-02, FORM-03 |
| Performance (lab only) | 7 | LCP ≤2.5 s; one CLS fail | PERF-01, PERF-02; field not verified |
| PWA readiness | 4 | Manifest, worker read; push repros | DEP-01, PUSH-01. Offline use is not required |
| Network resilience | 5 | J15–J19, J21 | REL-01, RES-01, RES-02 |
| State management | 7 | Code and journeys | NAV-06, queued mutations |
| Security and privacy | 7 | Code, headers, audit | SEC-01, SEC-02; real auth not tested |
| Code quality | 8 | Lint and types clean, small modules | Guards applied unevenly |
| Testing | 7 | 1187 unit, 384 browser | TEST-01, CON-01 |
| Requirements compliance | 5 | Matrix in file 4 | FR06, FR07, FR08, FR19, FR24 |
| Production readiness | 4 | This audit | Seven High issues; real stack untested |

## F. Production-readiness checklist

| Item | Status | Issues / note |
|---|---|---|
| Unit tests, lint, types | Pass | |
| Browser tests, Chromium | Pass | |
| Browser tests, WebKit and Firefox | Partial | TEST-01 |
| Production build | Pass | Local, not in Docker |
| Docker build and Compose stack | Not verified | Config gaps: DEP-01 |
| Deployment configuration complete | Fail | DEP-01 |
| Core flows keep the person's input and intent | Fail | NAV-01, NAV-02, FORM-01, FORM-02 |
| No duplicate or unexpected writes | Fail | DBL-01, REL-01 |
| Navigation, deep links, refresh | Partial | NAV-03 to NAV-09 |
| Sign-in, role guards (UI) | Partial | AUTH-01; real Firebase not verified |
| Push notifications | Fail | DEP-01, PUSH-01; delivery not verified |
| Slow, failed and offline network | Fail | REL-01, RES-01, RES-02 |
| WCAG 2.2 AA | Fail | A11Y-01, A11Y-03; also A11Y-02, A11Y-04 |
| Screen reader testing | Not verified | A11Y-04 |
| Responsive, 320–1280 px (emulated) | Pass | |
| Real iOS and Android devices | Not verified | #464 Part 7 |
| Lab Core Web Vitals | Partial | PERF-01 |
| Field Core Web Vitals | Not verified | No real-user data |
| JavaScript size budget | Fail | PERF-02 |
| Security headers | Fail | SEC-01 |
| No secrets in the frontend (pattern scan of tracked files) | Pass | |
| Dependencies | Partial | SEC-02 |
| Frontend against real services | Not verified | #394 |
| Client error reporting / monitoring | Not applicable | No requirement asks for it; consider before real users |
| Offline support | Not applicable | No requirement asks for it |

## G. Roadmap

Effort: S under half a day, M half a day to two days, L more. Estimates, not measurements.

**Stage 1: correctness and security (release blockers)**
1. REL-01 (S), then DBL-01 (S). Both change how actions run.
2. FORM-01 (S), FORM-02 (S).
3. PUSH-01 (S), then DEP-01 (S in the frontend; infra owner reviews Compose).
4. SEC-02 (S, needs your OK to install).

**Stage 2: navigation and UX**
1. NAV-01 (M), then NAV-02 (M), which builds on it.
2. NAV-03 (S), NAV-04 (S), NAV-05 (S).
3. NAV-07 (S), ACT-01 (S; its 404 case follows the #471 Part 1 decision), UI-01 (S), FORM-03 (S).
4. NAV-06 (M), NAV-08 (S), NAV-09 (S).

**Stage 3: accessibility and responsive**
1. A11Y-01 (S), A11Y-03 (S).
2. A11Y-02 (M), after ACT-01 so success messages are final. Then a screen reader pass to settle A11Y-04.
3. UI-02 (S, also removes the stats layout shift), UI-03, A11Y-05, A11Y-06, A11Y-07.

**Stage 4: performance and reliability**
RES-01 (M), RES-02 (M), AUTH-01 (S), PERF-01 (S), SEC-01 (M, CSP in report-only first), PERF-02 (S, last, so the new baseline includes the fixes), CON-01 (S).

**Stage 5: design system and polish**
UI-04 (S), UX-01 (S), FORM-04 (S).

**Stage 6: PWA and optional**
PWA-01, PERF-03, ENH-01, SEC-03 (backend owner). Do these only if the team wants them.

**Stage 7: final verification**
TEST-01 (regression tests are written with each fix, not saved for the end), then #464 Parts 5–9, a screen reader and real-device pass, Lighthouse, and a run on the real stack (#394).

**Tickets: avoid duplicates**

| Existing | Covers | Note |
|---|---|---|
| #464 | Remaining testing, Lighthouse, iPhone check | Add TEST-01 items here |
| PR #492 | Already reports the size failure | PERF-02: no new ticket |
| #471 Part 1 | What Q12 returns when a cancel expires the request | ACT-01 404 case: add there |
| #472 | Proposed accessibility and performance NFRs | Decision still open |
| #395 | Deployment (empty) | DEP-01 fits here |
| #394 | Integration (empty) | Real-stack verification fits here |

I found no open ticket for the other findings, based on the open issues and PRs I reviewed. Nothing has been created.

## Documented decisions not reported as defects
No push while an EcoCollect tab is focused (16.6). Two time formats on a pickup window, identical titles in the resident list, no dark mode or skeletons, role choice after every login even with one role, no CI yet (#432 "Not doing"). Calgary time shown as stored (contract). No dialog on Confirm collected (commented as intentional in the code; REL-01 is about offline queuing, not the missing dialog).
