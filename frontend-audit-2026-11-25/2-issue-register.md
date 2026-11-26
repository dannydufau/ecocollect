# E. Issue register

References are to `origin/frontend` at `257c0ff`, paths under `frontend/` unless noted. "J", "A" and "R" numbers are the scripted checks in `evidence/scripts/`.

**Status:** *Confirmed (runtime)* = reproduced against the mock or in a test. *Confirmed (code/config)* = follows directly from the files, not run. *Suspected* = needs a check before work starts.
**Priority:** P0 before release, P1 next, P2 soon, P3 when convenient. **Effort:** S under half a day, M up to two days.

| ID | Severity | Pri | Title |
|---|---|---|---|
| DEP-01 | High | P0 | Docker build gets no push key and no demo flag |
| PUSH-01 | High | P0 | Push shows "On" with no server subscription |
| REL-01 | High | P0 | Offline actions are queued and sent later |
| FORM-01 | High | P0 | Half-filled pickup window silently dropped |
| FORM-02 | High | P0 | Photo lost when sent during upload |
| NAV-01 | High | P0 | Back on review erases the new request |
| A11Y-01 | High | P1 | One title for every page |
| NAV-02 | Medium | P1 | No protection for unsaved input |
| NAV-03 | Medium | P1 | Session expiry forgets the page |
| NAV-05 | Medium | P1 | Back after saving returns to the edit form |
| NAV-06 | Medium | P2 | List filters reset |
| NAV-07 | Medium | P1 | Two-role account loses role links |
| ACT-01 | Medium | P1 | Volunteer cancel gives no result |
| DBL-01 | Medium | P1 | Double click sends two requests |
| RES-01 | Medium | P1 | No timeout or way out of a hung call |
| RES-02 | Medium | P1 | Offline and lost live updates are invisible |
| AUTH-01 | Medium | P2 | Failed role lookup signs the person out |
| A11Y-02 | Medium | P1 | Focus lost after actions |
| A11Y-03 | Medium | P1 | Focus hidden behind the bottom bar |
| A11Y-04 | Medium | P2 | Success messages may not be announced (suspected) |
| UI-01 | Medium | P1 | Wrong waiting message for volunteers |
| FORM-03 | Medium | P1 | 500-character limit not shown |
| PERF-01 | Medium | P2 | Layout shift on Available requests |
| SEC-01 | Medium | P1 | No security headers |
| SEC-02 | Medium | P1 | Dependency advisories |
| TEST-01 | Medium | P1 | Test coverage gaps |
| NAV-04, NAV-08, NAV-09, A11Y-05, A11Y-06, A11Y-07, UI-02, UI-03, UI-04, UX-01, FORM-04, PERF-02, SEC-03, CON-01 | Low | P2–P3 | See the Low section |
| PERF-03, PWA-01, ENH-01 | Enhancement | P3 | Optional |

---

## High

### DEP-01 · Docker build gets no push key and no demo flag
Deployment · High · P0 · S · **Confirmed (config); image not built**
- **Where:** Profile (Notifications), `/demo`. `Dockerfile:15-21`; root `docker-compose.yml` frontend `build.args`; root `.env.example`; `.dockerignore` (`.env*`); `components/enable-notifications.tsx:18,46`.
- **Now:** `NEXT_PUBLIC_*` values are fixed at build time. Only the Firebase ones are build args, and `.env*` files are excluded, so `NEXT_PUBLIC_VAPID_KEY` and `NEXT_PUBLIC_DEMO` are empty. Compose has no demo profile and the Caddyfile has no `demo.localhost` site.
- **Expected:** push can be enabled in the shipped build; a demo build can be produced (17.1, 17.2).
- **Root cause:** variables added to the app were not added to the container config.
- **Impact:** everyone sees "Notifications are not set up yet." The demo cannot be deployed.
- **Fix:** add both as `ARG` in the Dockerfile and `build.args` in Compose; list them in the root `.env.example`. The demo profile and Caddy site belong to #395. Build args are the simplest option because these values are public.
- **Requirements:** FR19, FR24, contract 16.8, 17.1–17.2.
- **Done when:** a built container shows the "Turn on device notifications" button; a demo build opens on `/demo` with the banner.
- **Test:** `docker compose build frontend` with the variables set, then open the profile.
- **Depends on:** a real VAPID key pair; #399 for delivery; #395 for the demo stack.

### PUSH-01 · Push shows "On" with no server subscription
Notifications, privacy · High · P0 · S · **Confirmed (unit repro with a fake push API; not with a real push service)**
- **Where:** `lib/auth.ts:41-49`, `lib/push.ts:13-27`, `components/enable-notifications.tsx:13`, `lib/api.ts:78-87`.
- **Now:** (a) Log out deletes the subscription on the server but never calls `subscription.unsubscribe()`. At next sign-in the page sees the browser subscription, shows "On", hides the button and never re-registers. (b) If the server POST fails after the browser subscribed, an error shows once; on the next visit it says "On". (c) From code: session expiry and account deactivation do not remove the browser subscription either.
- **Expected:** "On" only when the server accepted this browser for this account.
- **Root cause:** the browser subscription is treated as proof of the server record.
- **Evidence:** temporary tests `evidence/scripts/push-repro.test.tsx`, both passed while asserting the broken behaviour.
- **User impact:** notifications stop for good with the UI saying they work. After expiry on a shared device, the earlier person's pushes may keep arriving. **Technical:** server and browser state drift.
- **Fix:** call `subscription.unsubscribe()` in every sign-out path (after the server delete when a token is available; the push service then reports the endpoint gone and 13.4 removes it). If the POST fails in `subscribe`, unsubscribe again before throwing. This keeps the existing "On" check truthful with no new API.
- **Requirements:** FR19, NFR03, NFR06, contract 3.5, 13.4, 16.8.
- **Done when:** after log out and log in the button is offered; after a failed registration it is still offered.
- **Test:** turn the two repros into tests asserting the fixed behaviour; one real-browser check once push works.
- **Depends on:** none (real delivery needs DEP-01 and #399).

### REL-01 · Offline actions are queued and sent later
Reliability · High · P0 · S · **Confirmed at runtime for Confirm collected (J17b, run twice)**; the other actions listed share the same mutation default (from code)
- **Where:** accept, cancel, confirm collected, report missed, delivery, edit, profile saves. `app/providers.tsx:17`, `lib/use-request.ts:47`.
- **Now:** offline, the button shows "Confirming..." for as long as the connection is down, with no message and nothing sent. I left the page, reconnected, and the POST went out; the request became Collected.
- **Expected:** fail at once with the existing "We could not reach the server" message; nothing is sent later.
- **Root cause:** TanStack Query's default `networkMode: "online"` pauses mutations; the UI does not read `isPaused`.
- **Impact:** an action the person thinks failed or gave up on, including irreversible ones, happens later. Create uses a plain `apiFetch` and already fails correctly (J17c).
- **Fix:** `defaultOptions.mutations.networkMode: "always"`. One line, reuses the existing error path.
- **Requirements:** NFR02, NFR06.
- **Done when:** offline, each action shows an error within seconds and sends nothing after reconnect.
- **Test:** Playwright `setOffline(true)`, press, reconnect, assert no POST.
- **Depends on:** none.

### FORM-01 · Half-filled pickup window silently dropped
Forms · High · P0 · S · **Confirmed (runtime, J2 and both resident dialogs)**
- **Where:** new request, edit, resident Cancel assignment, Report missed. `components/resident/windows-picker.tsx:42-47`, `components/resident/request-form.tsx:101-107`.
- **Now:** a row with a date and no hour (or the reverse) is filtered out before validation. New request: sent with one window instead of two. Cancel assignment with one half-filled new window: sent `{"as":"resident"}`, page says "Done. The assignment was cancelled." Report missed: the half-filled second window is left out.
- **Expected:** an error on that row. A completely empty row can still be ignored.
- **Root cause:** `updateRows` emits only complete rows, so no caller knows an incomplete one exists.
- **Impact:** the resident thinks times were offered that were not. After a cancellation the request can expire sooner. The create flow's review lists the windows, but the dialogs have no review.
- **Fix:** have the picker report "has an incomplete row" and block with "Choose both a date and an hour, or remove this window." on the row. Fixing it in the picker covers all four callers.
- **Requirements:** FR07, FR08, FR10, FR11, FR16, NFR02.
- **Done when:** each of the four flows refuses a half-filled row and focuses it.
- **Test:** one picker unit test plus one test per caller.
- **Depends on:** none.

### FORM-02 · Photo lost when sent during upload
Forms · High · P0 · S · **Confirmed (runtime, J3, J3c)**
- **Where:** new request, edit. `components/photo-picker.tsx:33-47`, `components/resident/request-form.tsx:101-107`.
- **Now:** Review stays enabled during "Uploading...". The POST had no `photo`. On edit, saving with only a new photo mid-upload says "Nothing changed, so there is nothing to save."
- **Expected:** submit waits, with a reason.
- **Root cause:** the picker reports only success; the form cannot see an upload in progress.
- **Impact:** volunteers see no photo and the resident is not told.
- **Fix:** add an `onBusyChange` to the picker; the form blocks submit and shows "Wait for the photo to finish uploading." (Record delivery already requires the uploaded id.)
- **Requirements:** FR06, FR10, NFR02.
- **Done when:** neither form can proceed during an upload.
- **Test:** component test with a pending upload promise.
- **Depends on:** pair with RES-01 so a hung upload cannot block forever.

### NAV-01 · Back on review erases the new request
Navigation · High · P0 · M · **Confirmed (runtime, J1)**
- **Where:** `/resident/requests/new`. `components/resident/new-request-form.tsx:23,86-102`.
- **Now:** review is local state with no history entry. Back goes to `/resident`; Forward gives an empty form.
- **Expected:** Back returns to the filled form.
- **Root cause:** a two-step flow inside one history entry.
- **Impact:** items, windows, notes and uploaded photos are lost, mostly on phones where the Back gesture is normal.
- **Fix:** `window.history.pushState` when entering review and a `popstate` handler that returns to the form; "Back to edit" calls `history.back()`. Keeps one component and its state, which is simpler than a second route.
- **Requirements:** FR08, NFR02.
- **Done when:** Back from review shows every value; Back again leaves the page.
- **Test:** Playwright version of J1.
- **Depends on:** none.

### A11Y-01 · One title for every page
Accessibility · High · P1 · S · **Confirmed (runtime, sweep and A1)**
- **Where:** all routes. `app/layout.tsx:9`; no other `metadata` or `document.title`.
- **Now:** 100 of 100 page visits had the title "EcoCollect". After in-app navigation Next.js's route announcer stays empty (it announces title changes) and focus stays on the clicked link.
- **Expected:** a title naming each page.
- **Root cause:** pages are client components and no route segment defines metadata.
- **Impact:** screen reader users hear nothing on navigation; tabs and history are indistinguishable.
- **Fix:** `title: { default: "EcoCollect", template: "%s · EcoCollect" }` in the root, and a small server `layout.tsx` with `metadata` per segment. Dynamic pages can use "Pickup request".
- **Standard:** WCAG 2.4.2 Page Titled (A).
- **Done when:** each route has its own title and the announcer text changes on navigation.
- **Test:** add a title column to `e2e/routes.ts`.
- **Depends on:** none.

## Medium

### NAV-02 · No protection for unsaved input
Navigation · Medium · P1 · M · **Confirmed (runtime, J4)**; the notification-tap path is from code
- **Where:** new request, edit, register. `public/sw.js:23-28` can also navigate an open tab away when a notification is tapped (that part follows contract 16.7).
- **Now:** header links, reload and Back discard everything with no warning. Profile editors are the exception: drafts survive while you stay on the page.
- **Root cause:** state is only in memory and there is no leave guard.
- **Impact:** retyping, re-uploading.
- **Fix:** a `beforeunload` warning while dirty (reload and close), and keep the new-request draft in `sessionStorage` so in-app navigation can restore it. The App Router has no route blocker, so a draft is simpler than intercepting links. Never store passwords from registration.
- **Requirements:** NFR02.
- **Done when:** reload warns; leaving and returning restores the draft; a sent request clears it.
- **Test:** J4 as Playwright. **Depends on:** NAV-01.

### NAV-03 · Session expiry forgets the page
Navigation · Medium · P1 · S · **Confirmed (runtime, J14, test build)**; not tried with real Firebase
- **Where:** `lib/api.ts:78-87`, `lib/auth-context.tsx:93-122`, `components/require-role.tsx`, `components/require-auth.tsx`.
- **Now:** a race. When `DELETE /api/session` took 300 ms or 1500 ms, the saved page was lost in 6 of 6 runs. It survived 3 of 3 only when the reply was instant.
- **Root cause:** only the route guard saves the page, but the full reload happens before the guard sees the signed-out state.
- **Impact:** after signing in again, people land on a default page.
- **Fix:** call `saveReturnTo(location.pathname + location.search)` in `endExpiredSession` before `signOut`.
- **Requirements:** NFR02, contract 16.14.
- **Done when:** with a slow delete, sign-in returns to the same request.
- **Test:** unit test on the 401 path. **Depends on:** none.

### NAV-05 · Back after saving returns to the edit form
Navigation · Medium · P1 · S · **Confirmed (runtime, J5)**
- **Where:** `app/resident/requests/[id]/edit/page.tsx:38`.
- **Now:** `router.push(back)`, so Back from the detail reopens the editor.
- **Fix:** `router.back()` when the person came from the detail page, otherwise `router.replace(back)` (deep link).
- **Impact:** a loop, and a chance to edit again by mistake. **Root cause:** push instead of replace. **Requirement:** NFR02.
- **Done when:** one Back from the saved detail reaches the page before it. **Test:** J5. **Depends on:** none.

### NAV-06 · List filters reset
Navigation, state · Medium · P2 · M · **Confirmed (runtime J6 on resident list; code for the other two)**
- **Where:** `components/resident/my-requests.tsx:20`, `app/volunteer/history/page.tsx:22`, `components/volunteer/available-requests.tsx:18`.
- **Now:** filter is component state; after opening a card and going Back, the Assigned filter returned to All (1 card became 7).
- **Fix:** keep it in the query string with `router.replace`; the URL is already the right owner for it.
- **Impact:** repeated filtering; filtered views cannot be bookmarked. **Requirement:** FR09 and FR12 are met; this is NFR02.
- **Done when:** Back and reload keep the filter. **Test:** Playwright per list. **Depends on:** none.

### NAV-07 · Two-role account loses role links
Information architecture · Medium · P1 · S · **Confirmed (runtime, J14d)** · screenshot `evidence/nav07-two-role-375.png`
- **Where:** `/profile`, `/notifications`, `/ecopoints` in a new tab, bookmark or notification. `components/app-header.tsx:165`.
- **Now:** with no role chosen in this tab, the phone bar shows only Points and More; desktop shows only EcoPoints (the desktop switcher shows nothing selected).
- **Root cause:** role links come only from `activeRole`.
- **Fix:** when a two-role account has no active role, show "My requests" and "Available". Picking one sets the role as usual. This keeps the per-tab rule.
- **Impact:** the main areas are only reachable through the logo. **Requirements:** FR02, NFR02.
- **Done when:** both destinations are one tap from every shared page. **Test:** header unit test and J14d. **Depends on:** none.

### ACT-01 · Volunteer cancel gives no result
Feedback · Medium · P1 · S · **Confirmed (runtime J8; J9 by simulating the contract 404)**
- **Where:** `components/volunteer/cancel-assignment.tsx:20-27`, `lib/use-request.ts`.
- **Now:** success jumps to history with no message and focus on the body. If the cancel expires the request, the real service answers `404 request_unavailable` (#471 Part 1); the page then says "This request is no longer available" although the cancel worked.
- **Fix:** show "Assignment cancelled" on arrival. Treat that 404 from your own cancel as success, unless #471 changes the response first.
- **Root cause:** no success state is carried over; 404 is treated as an error. **Impact:** people cannot tell whether it worked.
- **Requirements:** FR14, NFR02. **Done when:** both outcomes show a success message. **Test:** two unit tests. **Depends on:** #471 Part 1.

### DBL-01 · Double click sends two requests
Reliability · Medium · P1 · S · **Confirmed (runtime, J20b and follow-up)**
- **Where:** accept (`components/volunteer/accept-request.tsx:44`), volunteer cancel (`components/volunteer/cancel-assignment.tsx:20`), record delivery (`record-delivery.tsx:28-29`), deactivate (`app/profile/deactivate-account.tsx`).
- **Now:** a real double click sent 2 requests in each. For accept, the second got `409` and the "You accepted this request" confirmation never appeared. The resident dialogs use a `sending` ref and send once; saving the public name sent once. Add-second-role was **not verified**.
- **Root cause:** `isPending` is read from the last render, so two quick clicks both pass.
- **Impact:** lost confirmation now; duplicate writes depend entirely on server guards.
- **Fix:** move the ref guard into `useRequestAction` and reuse it for the profile mutations, replacing the per-component copies.
- **Requirement:** NFR06. **Done when:** every action sends exactly once on double click. **Test:** `userEvent.dblClick` per dialog. **Depends on:** REL-01.

### RES-01 · No timeout or way out of a hung call
Reliability · Medium · P1 · M · **Confirmed (runtime, J15, J15b, J3b)**
- **Where:** `lib/api.ts:100`, `lib/upload/upload-photo.ts:29`, `components/ui/confirm-dialog.tsx:47,56`.
- **Now:** list still loading after 30 s with no Retry. A hung submit keeps both dialog buttons disabled and Escape does nothing. A hung upload stayed "Uploading..." for 45 s with no cancel or retry (choosing another file works).
- **Root cause:** no `AbortSignal` anywhere, and query signals are not passed to `fetch`.
- **Fix:** `AbortSignal.timeout` in `request()` and the upload (longer for uploads), pass React Query's signal, and add Cancel during upload. For writes other than create, say the result is unknown and refetch before allowing a retry; only create has an idempotency key.
- **Requirement:** NFR06. **Done when:** every call ends in success or a message with a next step. **Test:** fake timers plus a never-resolving fetch. **Depends on:** none.

### RES-02 · Offline and lost live updates are invisible
Reliability · Medium · P1 · M · **Confirmed (runtime, J17, J21)**
- **Where:** all signed-in pages. `lib/sse.ts:93-110`, `lib/auth-context.tsx:77-91`.
- **Now:** offline, a newly opened list stayed on "Loading..." with no notice (watched for 3 s; from code, the query stays paused until the connection returns). When `/api/events` returned 401 or 503, it retried (5 attempts in 70 s) but the session was created only once and nothing told the user. If the first session call fails, a 401 stream can therefore never recover (the failure only logs a warning).
- **Fix:** an "You're offline" banner from `onlineManager`; call `POST /api/session` again before reopening a failed stream; after repeated failures say updates may be delayed. The 30 s notification poll stays (16.5).
- **Root cause:** no UI for connection state; session creation is not retried. **Impact:** stale pages that look current.
- **Requirements:** FR19, NFR06, contract 16.5. **Done when:** offline is visible; live updates recover after a session failure. **Test:** SSE unit test; J17. **Depends on:** REL-01.

### AUTH-01 · Failed role lookup signs the person out
Authentication · Medium · P2 · S · **Confirmed (code); trigger not reproduced**
- **Where:** `lib/auth-context.tsx:113`, `app/choose-role/page.tsx:20-25`.
- **Now:** `getRoles(user).catch(() => [])` makes a temporary token error look like an account with no roles, which the choose-role page signs out. Both halves are deliberate; together they log out a real user on a network error.
- **Fix:** keep an "could not load roles" state with Retry; sign out only when the lookup succeeds with no roles.
- **Impact:** unexpected logout on a poor connection. **Requirements:** FR02, NFR06. **Done when:** a rejected lookup shows Retry. **Test:** provider test with a rejecting lookup. **Depends on:** none.

### A11Y-02 · Focus lost after actions
Accessibility · Medium · P1 · M · **Confirmed (runtime, J8, J10–J13)**
- **Where:** accept, cancel request, cancel assignment, confirm collected, volunteer cancel, profile editor open.
- **Now:** focus ends on `body`. The button that had it is removed. (Escape and editor Cancel return focus correctly.)
- **Fix:** after success, focus the success message (`tabIndex={-1}`) or the page heading; on editor open, focus its first field.
- **Root cause:** the focused element unmounts. **Impact:** keyboard and screen reader users start over from the top.
- **Standard:** WCAG 2.4.3 Focus Order (A). **Done when:** focus is on a meaningful element after each action. **Test:** assert `document.activeElement`. **Depends on:** ACT-01.

### A11Y-03 · Focus hidden behind the bottom bar
Accessibility · Medium · P1 · S · **Confirmed (runtime, A2, Chromium 375×667)** · screenshot `evidence/a11y03-focus-hidden.png`
- **Where:** below 960 px. `app/globals.css:141-144` sets only a top scroll margin.
- **Now:** tabbing left "Today" and "Tomorrow" (new request) and an assignment card link (history) entirely behind the fixed bar; several others partly.
- **Fix:** below 960 px, `html { scroll-padding-bottom: calc(<bar height> + env(safe-area-inset-bottom)); }`.
- **Root cause:** the browser does not know the bar covers the page. **Impact:** keyboard and switch users cannot see where they are.
- **Standard:** WCAG 2.4.11 Focus Not Obscured, Minimum (AA). **Done when:** the A2 script reports none fully hidden. **Test:** add A2 to Playwright. **Depends on:** none.

### A11Y-04 · Success messages may not be announced
Accessibility · Medium · P2 · S · **Suspected: needs VoiceOver or NVDA**
- **Where:** `components/ui/alert.tsx:29-34`.
- **Now:** the `role="status"` element is inserted already containing its text. Many screen readers announce only changes to a region that already exists. The text is in the DOM (J10).
- **Fix, only if confirmed:** keep a persistent status region and change its text, or move focus to the message (A11Y-02 may be enough).
- **Standard:** WCAG 4.1.3 Status Messages (AA). **Impact:** a blind user may not learn an action worked. **Done when:** announced in VoiceOver and NVDA. **Test:** manual. **Depends on:** A11Y-02.

### UI-01 · Wrong waiting message for volunteers
Content · Medium · P1 · S · **Confirmed (runtime)** · screenshot `evidence/ui01-waiting-copy.png`
- **Where:** `components/volunteer/request-detail.tsx:147`.
- **Now:** with a pickup two days ahead, the page says "Collect the items in the selected window." and also "Waiting for the resident to confirm collection."
- **Root cause:** shown for every `Active` assignment.
- **Fix:** "After you collect the items, the resident confirms the collection."
- **Impact:** a volunteer may think there is nothing left to do. **Requirements:** FR15, NFR02. **Done when:** no conflicting instruction before pickup. **Test:** update the component test. **Depends on:** none.

### FORM-03 · 500-character limit not shown
Forms · Medium · P1 · S · **Confirmed (runtime J22 and dialogs: 600 and 501 characters accepted); server error display is from code**
- **Where:** notes (`request-form.tsx:171-176`, edit) and the four reason fields.
- **Now:** no `maxLength` or counter, though the contract caps both at 500. A new request fails only after review and terms. From code, only the cancel-request dialog shows the field's message; others show the general one. The mock does not enforce the limit (CON-01).
- **Fix:** `maxLength={500}` and a short counter in a shared textarea field.
- **Requirements:** contract limits, NFR02. **Root cause:** the limit was never copied to the UI. **Impact:** late, unclear rejection.
- **Done when:** all five fields enforce and show the limit. **Test:** unit per field. **Depends on:** none.

### PERF-01 · Layout shift on Available requests
Performance · Medium · P2 · S · **Confirmed (lab)**
- **Where:** `/volunteer`, `components/volunteer/available-requests.tsx:13-37`.
- **Now:** CLS 0.199 (good is ≤0.1). The loading block moved from y=138 to y=390 when the postal filter appeared above it.
- **Fix:** render the filter area at its final size while the profile loads, or show one loading state until both are ready.
- **Standard:** Core Web Vitals. **Impact:** content jumps as someone reaches for it. **Done when:** lab CLS ≤0.1. **Test:** re-run `perf2.mjs`. **Depends on:** none.

### SEC-01 · No security headers
Security · Medium · P1 · M · **Confirmed (response headers from `next start`, and the Caddyfile read; Caddy not run)**
- **Where:** `next.config.ts`, root `infra/caddy/Caddyfile`.
- **Now:** no CSP, `frame-ancestors`/`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` or HSTS; `X-Powered-By: Next.js` is sent. I found no XSS sink, so this is defence in depth; framing the app for clickjacking is the most direct gap.
- **Fix:** add `frame-ancestors 'none'`, `nosniff`, a referrer policy and `poweredByHeader: false` now; add HSTS at Caddy for real domains; roll CSP out report-only first, allowing Firebase Auth, ImageKit, `data:` images and Next's scripts.
- **Requirement:** NFR04. **Root cause:** never configured. **Impact:** weaker protection against framing and injection.
- **Done when:** headers present and no CSP reports across the journeys. **Test:** `curl -I` plus the browser suite. **Depends on:** coordinate with the infra owner.

### SEC-02 · Dependency advisories
Security · Medium · P1 · S · **Confirmed (`npm audit`); exploitability not assessed per advisory**
- **Where:** `package.json`, lockfile.
- **Now:** `next@16.4.3` has several moderate advisories; fix is `16.4.6` (patch). The 4 high ones come through `firebase` → Firestore → `@grpc/grpc-js`. The app imports only `firebase/app` and `firebase/auth`, so I infer that code is not in use; npm's suggested fix is a major downgrade, which I do not recommend. The rest are lint tooling. From their titles, several Next advisories concern `use cache` and Edge routes, which the app does not use; the image-optimizer and self-hosted ones should be read.
- **Fix:** upgrade Next and `eslint-config-next` to the patched version; record why the Firebase chain is accepted.
- **Requirement:** NFR04. **Root cause:** pinned version. **Impact:** known issues in a server component of the deployment.
- **Done when:** no `next` advisory; tests pass. **Test:** full suite plus size check. **Depends on:** your OK to install.

### TEST-01 · Test coverage gaps
Testing · Medium · P1 · M · **Confirmed**
- **Where:** `playwright.config.ts`, `e2e/visual.pw.ts:84-109`, root `docs/Final Submission/ENSF607/6. Software quality/`.
- **Now:** browser tests run in Chromium only; 3 motion tests assume Chromium. None of the High behaviours above is covered. `cases/volunteer.md` and `cases/points-expiry-stats.md` contain only headers (FR12–FR18, FR20, FR21, FR23); the README there still says `main` has no frontend `npm test`. Nothing runs against real services.
- **Fix:** a regression test with every fix; run WebKit and Firefox before release with the motion tests marked Chromium-only; fill the case files; track real-stack runs under #394.
- **Requirement:** NFR01. **Root cause:** tests follow the happy path. **Impact:** these bugs passed a green suite.
- **Done when:** each P0 has a failing-then-passing test and the case files have rows. **Test:** the suites. **Depends on:** #464, #394.

## Low

Each: what and where → fix → how to verify. Category and standard in brackets. All are confirmed at runtime unless marked.

- **NAV-04** (P2, S) `/resident` and `/volunteer` are not saved before sign-in (`lib/return-to.ts:6-10`; J14c). Impact: after sign-in a two-role user starts at the role picker. → allow those exact paths. Verify: unit test. [Navigation, NFR02]
- **NAV-08** (P3, S) `?created=2` keeps showing "2 requests were created" after reload (J7). → remove the parameter after reading it. Verify: reload. [Navigation, NFR02]
- **NAV-09** (P3, S) A wrong-role URL lands on "Continue as" with no reason (`components/require-role.tsx`). → add one line saying that page needs the other role. Verify: unit test. [Navigation, NFR02]
- **A11Y-05** (P3, S) 404 and route-error pages have no h1 (`components/ui/empty-state.tsx:8`), and the programmatic focus draws a ring around the page, seen as a stray line on phones (`components/route-fallback.tsx:8`). Screenshots `evidence/a11y05-404-375.png`, `-1280.png`. → heading option on EmptyState; no outline on that focused container. Verify: axe, screenshot. [Accessibility, 1.3.1 and best practice]
- **A11Y-06** (P3, S) In forced-colours mode the selected filter and role look like the others and filled buttons lose their shape (`evidence/a11y06-*.png`; Chromium emulation). → `@media (forced-colors: active)` borders or outlines for selected and primary states. Verify: emulate. [Accessibility; programmatic state is correct, so I do not claim an AA failure]
- **A11Y-07** (P3, S) The demo banner is outside any landmark (axe `region`, best practice). → wrap it in a labelled region. Verify: axe on the demo build. [Accessibility]
- **UI-02** (P2, S) Signed out at 375 px the header wraps to two rows (113 px) and, when auth resolves, pushes `/stats` down (CLS 0.071) (`components/app-header.tsx:151-159`; `evidence/ui02-header-375.png`). → fit one row (shorter label or smaller gap) and reserve its height. Verify: screenshot, CLS. [Visual, performance]
- **UI-03** (P3, S) At 375 px long status badges squeeze assignment titles into up to four lines (`app/volunteer/history/page.tsx:53`; `evidence/ui03-history-375.png`). → let the badge wrap below the title. Verify: screenshot. [Responsive, NFR02]
- **UI-04** (P3, S) Profile "Member since" includes a time, the public profile does not; the EcoPoints role pill uses `text-xs`, off the named scale (from code); sign-in uses browser validation while registration uses app messages. → align each with the dominant pattern. Verify: screenshots. [Consistency, NFR02]
- **UX-01** (P2, S) From code: the resident's Cancel request dialog on an Assigned request does not mention that a late cancellation gives the volunteer EcoPoints, while Cancel assignment does (`components/resident/cancel-request.tsx:50`). → show the same notice under the same condition. Verify: unit test. [Consistency, FR11]
- **FORM-04** (P3, S) Registration sends a 3-character password and a 120-character name (R2); the database and backend cap names at 80 and street at 255, which `openapi.yaml` does not state. Submit stays disabled until terms are ticked, hiding field errors until then. Inline server errors exist. → check length 6, add `maxLength`, and raise the missing contract limits with the user-service owner. Verify: unit test. [Forms, FR01]
- **PERF-02** (P2, S) The size check fails (see file 1). Already reported in PR #492; no new ticket. → decide whether about 3 KB gzip per route is intended, then re-baseline with the reason. Verify: `npm run size`. [Performance, NFR01]
- **SEC-03** (P3, S, backend) From code: `/verify` accepts the session cookie for every method (`backend/src/user/auth/router.cjs`, `/verify`), though the contract says it exists only for SSE. `SameSite=Lax` stops cross-site posts, so this is defence in depth; not exploited or tested. → accept the cookie only for the event stream. Verify: backend test. [Security, NFR04]
- **CON-01** (P2, S) The mock differs from the contract: it returns `validation_error` (contract: `validation_failed`), returns `200` for the Q12 case the Request Service answers with `404`, and does not enforce the 500 limit. No frontend code branches on the code name today. → align the mock. Verify: mock tests. [Testing]

### Low items: remaining register fields
The bullets above give ID, title, category, priority, effort, location, current behaviour, solution, requirement and test. **Acceptance for each: the "Verify" step shows the expected behaviour.** **Justification for each: it is the smallest change in the file that owns the behaviour, with no new dependency.** Severity is Low for all. Where a bullet has no screenshot or script, its evidence is the named file.

| ID | Expected | Root cause | User impact · technical impact | Depends on |
|---|---|---|---|---|
| NAV-04 | List pages are restored after sign-in | Allow list requires a sub-path | Extra taps · none | NAV-03 |
| NAV-08 | Banner shows once | State kept in the URL | Looks like a second submission · stale URL | – |
| NAV-09 | Redirect explains itself | Guard redirects silently | Confusion · none | NAV-07 |
| A11Y-05 | A heading, no stray ring | EmptyState title is a paragraph; focus styles apply to a focused container | Weak page structure, looks broken · none | – |
| A11Y-06 | Selected and primary states visible | States rely on fill colour | High-contrast users cannot see the selection · none | – |
| A11Y-07 | All content in landmarks | Banner has no region | Easy to miss with landmark navigation · none | – |
| UI-02 | One stable header row | Brand, link and button exceed 375 px | Less space, content jumps · CLS | – |
| UI-03 | Readable titles | Badge keeps its width beside the title | Hard to scan · none | – |
| UI-04 | Same pattern for the same thing | Built separately | Minor inconsistency · upkeep | – |
| UX-01 | Both cancel paths disclose the same consequence | Notice added to one dialog | Resident is not told of the effect · none | – |
| FORM-04 | Limits checked before sending | Limits are missing from the contract and the form | Late errors · contract gap | User-service owner |
| PERF-02 | Size check passes or the growth is explained | Baseline predates later work (inferred from the README's recorded commit) | None direct · budget no longer catches growth | PR #492 |
| SEC-03 | Cookie accepted only where needed | One verify route for all paths | None known · wider attack surface | Backend owner |
| CON-01 | Mock behaves like the contract | Written separately; one contract point still open | Hides bugs from testing · tests can pass wrongly | #471 Part 1 |

## Enhancements (optional)

For these three: severity Enhancement, priority P3, effort S, status confirmed from code and runtime sweep, no dependencies except the contract decision in PWA-01. They are not defects and have no acceptance criteria until the team chooses to do them.

- **PERF-03** On load, lists and details are fetched twice because the first SSE open invalidates everything (`lib/sse.ts:93-97`). It follows the spirit of 16.5 and closes a gap between fetch and stream, so measure before changing. Option: skip the first open only if the gap is covered another way.
- **PWA-01** The manifest has no `id` or `description`, and the worker is registered only when push is enabled, while contract 16.1 says at login (raise this mismatch: change code or contract). I do **not** recommend an offline cache: no requirement needs it and caching private API data adds risk.
- **ENH-01** A Missed, Expired or Cancelled request has no "create a new request" shortcut on its page.

## Suspected or unverified, not filed as issues
- The Available list may keep a window that has started until the next refetch or SSE message (code only).
- Tapping a notification navigates the first open EcoCollect tab, whichever it is (code only; part of NAV-02).
