# Requirement traceability

**UI met** = the frontend provides it and nothing found here breaks it, **against the mock only**. It is not an end-to-end pass. **Partial** = a listed issue affects it. Rules enforced by services are outside this audit. All listed unit tests pass.

| Requirement | Frontend implementation | Automated frontend tests | Checked at runtime | Status | Issues |
|---|---|---|---|---|---|
| FR01 Registration | `app/register`, `register-form`, `validate-account` | register page, form, validation | Sweep, R1, R2 | UI met | FORM-04 |
| FR02 Login, logout, role choice | `login`, `choose-role`, `forgot-password`, `logout-button`, `auth-context` | their tests | Sweep, J14 | Partial | AUTH-01, NAV-03; real Firebase unverified |
| FR03 Second role | `profile/second-role` | second-role | Panel scan | UI met | submit not run |
| FR04 Profile, lock, deactivate | `app/profile/*` | page, editors, deactivate | Sweep, J13, dialog | UI met (rules server-side) | DBL-01, A11Y-02 |
| FR05 Public profile | `app/profiles/[accountId]` | page | Sweep | UI met | |
| FR06 Create with photo, weight | `new-request-form`, `request-form`, `photo-picker`, `lib/upload/*` | form, picker, upload, image | J3, J18 | **Partial** | FORM-02 |
| FR07 Windows | `windows-picker`, `validate` | picker, form | J2 | **Partial** | FORM-01 |
| FR08 Review and correct | `review-request` | new-request | J1 | **Partial** | NAV-01 |
| FR09 List, filter, details | `my-requests`, `request-detail` | both | Sweep, J6 | UI met | NAV-06 |
| FR10 Edit Open | `[id]/edit` | edit page | J3c, J5 | **Partial** | FORM-01, FORM-02 |
| FR11 Cancel rules | `cancel-request`, resident `cancel-assignment` | both | J11, dialogs | Partial | FORM-01, UX-01 |
| FR12 Discovery, address hidden | `available-requests`, `postal-filter`, detail | all | Sweep | UI met (hiding is server-side) | PERF-01 |
| FR13 Accept window, own request | `accept-request` | accept | J10, double click | UI met | DBL-01 |
| FR14 Volunteer cancel | volunteer `cancel-assignment` | test | J8, J9 | Partial | ACT-01 |
| FR15 Owner confirms collection | `confirm-collected` | test | J12, J17b | Partial | REL-01, UI-01 |
| FR16 Report missed, reschedule | `report-missed` | test | Dialog with patched actions | Partial; full path not run | FORM-01 |
| FR17 Delivery with photo | `record-delivery`, `facility-picker` | both | Double click, dialog | UI met | DBL-01 |
| FR18 EcoPoints | `app/ecopoints` (display) | page | Sweep | Display met; calculation server-side | |
| FR19 In-app and push | bell, notifications, `sse`, `push`, `sw.js` | all | A7, push repros | **Not met for push**; list UI met | DEP-01, PUSH-01, RES-02; #399 |
| FR20 Expiry | status text, `refreshAt` | use-request, detail | Expired screens | UI met; rule server-side | |
| FR21 Volunteer history | `volunteer/history` | page | Sweep | UI met | UI-03 |
| FR22 Terms | `terms-checkbox` on register, add role, review, accept, reschedule | checkbox and callers | R1, J10, J18, dialog | UI met | |
| FR23 Public stats | `app/stats` | page | Sweep, J19b | UI met | |
| FR24 Demo | `app/demo`, `demo-banner`, `lib/demo` | both | Demo build | **Partial: cannot be deployed** | DEP-01; real session unverified |
| NFR01 Maintainability | structure, types | 92 files | Lint, types | Met (size budget failing) | PERF-02, TEST-01 |
| NFR02 Usability | whole UI | style guard, tokens | Screenshots, journeys | Partial | UI-01, FORM-03, NAV-*, ACT-01 |
| NFR03 Privacy | image re-encode, public profile, neutral reset message | image, profile, forgot | Code | Partial | PUSH-01 |
| NFR04 Security | token handling, upload checks, redirect allow list | api, return-to, sw | Headers, audit | Partial | SEC-01, 02, 03 |
| NFR05 Fairness | shows `already_assigned` message | api | – | Not applicable (server) | |
| NFR06 Reliability | idempotency key, 409 refetch, SSE retry | several | J17–J21 | Partial | REL-01, DBL-01, RES-01, RES-02 |

**Contract §16 spot check:** 16.2–16.14 behaviours I traced are implemented, with these exceptions: 16.1 service worker is not registered at login (PWA-01); the 404 case of Q12 (ACT-01, #471). All public operations in `openapi.yaml` that the browser needs are called; `/verify` is internal.

# Testing strategy

| Layer | Keep | Add |
|---|---|---|
| Unit and component (Vitest) | 1187 tests | A regression test for every issue fixed |
| Browser (Playwright) | Routes, acceptance, visual, axe | J1, J2, J3, J4, J5, J14 with a slow delete, J17b, A2; a title per route; axe with dialogs open |
| Cross-browser | – | WebKit and Firefox before release; motion tests Chromium-only |
| Contract | type generation | Mock checked against `openapi.yaml`, error codes included (CON-01) |
| Integration | – | One real-stack run per core journey (#394): register, create, accept, collect, deliver, points, notification |
| Manual | – | VoiceOver (Safari, iOS), NVDA (Firefox or Chrome), a real iPhone and Android: keyboard, camera upload including HEIC, safe areas, push |
| Performance | size check | Lighthouse (#464 Part 6); real-user data only after launch |

Remaining parts of #464 (5–9) already cover part of this; add to it instead of opening parallel tickets. CI is a recorded "not doing"; revisit it, since the size failure shows checks drifting when run by hand.

# Topic notes

## Performance (lab, not field)
Emulation: Chromium, 375×667, 1.6 Mbps, 150 ms latency, 4× CPU slowdown, local server, test build, median of 3. TTFB is not meaningful here (it is the emulated latency). "Ready" = loading messages gone.

| Page | FCP ms | LCP ms | Ready ms | CLS | Blocking ms | Requests | Transfer KB (JS) |
|---|---:|---:|---:|---:|---:|---:|---:|
| /login | 724 | 724 | 1911 | 0 | 36 | 30 | 283 (213) |
| /register | 704 | 704 | 2155 | 0 | 44 | 25 | 277 (209) |
| /stats | 716 | 716 | 2093 | 0.071 | 37 | 26 | 270 (206) |
| /resident | 720 | 2216 | 2668 | 0 | 20 | 51 | 306 (221) |
| New request | 716 | 2324 | 2711 | 0.027 | 38 | 48 | 299 (221) |
| Request detail | 712 | 2444 | 2719 | 0 | 25 | 45 | 312 (233) |
| /volunteer | 716 | 2224 | 2685 | **0.199** | 25 | 45 | 294 (217) |
| /profile | 720 | 2424 | 2404 | 0 | 46 | 45 | 306 (229) |

- Signed-in pages are 56 to 284 ms under the 2.5 s LCP line, and real Firebase and services will add time. Measure again on the real stack.
- INP cannot be measured in the lab. Longest tap or key event on a 4× slower CPU: filter 72 ms, More 48, dialog 40, add item 32, typing 24.
- Static chunks are cached as immutable; `sw.js` is `max-age=0`.
- `README.md` records older Lighthouse runs from another commit; they were not repeated.

## Debounce, throttle, events
No type-ahead or scroll handlers need debouncing: the postal filter applies on an explicit Add, and forms send on submit. **Do not add debounce.** The real timing problems are double submit (DBL-01) and submit during upload (FORM-02), which need guards. Stale responses: query keys include the filter and id, and the photo picker ignores old uploads by attempt number (code).

## PWA
Installable pieces exist (manifest, 192, 512 and maskable icons). The worker handles push and notification clicks only. No offline requirement exists, so offline caching is not recommended. What matters is that push works (DEP-01, PUSH-01). iOS web push needs the app added to the Home Screen: not verified here, and worth stating in the UI if iPhone push is expected.

## State management
Server data lives in TanStack Query with keys that match the contract; the cache is cleared when the user changes; the active role is per tab. Gaps: view state that belongs in the URL (NAV-06), drafts (NAV-02), paused mutations (REL-01).

## Security and privacy
Checked in code: no `dangerouslySetInnerHTML`, `innerHTML` or `eval`; no matching secrets in tracked frontend files; `target="_blank"` links use `noopener noreferrer`; tokens come from the Firebase SDK and go only to our API; return paths and notification URLs are limited to our own origin; console messages are warnings with error objects (check none carry personal data against real services); photos are re-encoded before upload, which removes metadata (unit tested, not checked on a real camera photo). Session cookie is specified `HttpOnly; Secure; SameSite=Lax`; mutations send a Bearer token. Open: SEC-01, SEC-02, SEC-03, PUSH-01. This was not a penetration test.

## Animations
Existing browser tests confirm the approved durations and reduced motion in Chromium. WebKit and Firefox close dialogs and the sheet without the exit animation, which the CSS comments describe as the accepted fallback. No changes recommended.

## Responsive and cross-browser
No overflow at 320, 375, 768, 1280 (suite and sweep, Chromium; suite also in WebKit and Firefox at 375 and 1280). WCAG text spacing: no clipping on 8 pages. Landscape 667×375 and 640×360: header and bar take 31–33% of the height, dialog buttons stay on screen. At 320 the header is two rows (113 px). Not verified: virtual keyboard, safe areas, real devices, Edge.

## Accessibility summary by criterion
| Criterion | Result |
|---|---|
| 2.4.2 Page Titled (A) | Fail, A11Y-01 |
| 2.4.3 Focus Order (A) | Fail after actions, A11Y-02 |
| 2.4.11 Focus Not Obscured (AA) | Fail, A11Y-03 |
| 4.1.3 Status Messages (AA) | Not verified, A11Y-04 |
| 1.4.3 Contrast (AA) | No axe violations on scanned states; token contrast tests pass |
| 1.4.10 Reflow, 1.4.12 Text Spacing (AA) | Pass on pages tested |
| 2.4.1 Bypass Blocks (A) | Pass (skip link) |
| 2.5.8 Target Size (AA) | Pass on swept screens: the only target under 24 px high is a link inside a sentence, which the criterion exempts |
| 2.1.1 Keyboard, 2.1.2 No Trap | Spot checks passed; not every control was exercised |
| All others | Only what axe covers; not a full conformance review |

## Edge cases
| Case | Result |
|---|---|
| Double submit | Fail for four actions, DBL-01 |
| Refresh or leave mid-form | Fail, NAV-02 |
| Expired session | Signs out; page forgotten, NAV-03 |
| Offline | Fail, REL-01, RES-02 |
| 429, 503 | Message shown; create reuses its key |
| 500 | Error with Retry after 7.4 s (3 retries). Acceptable; reconsider if users find it slow |
| HTML answer with 200 | List pages show the route error with Try again; stats shows a retry message |
| Never answers | Fail, RES-01 |
| Long names, addresses, usernames | Wrap correctly |
| Empty data | Empty states present |
| Invalid ids | Not-available pages |
| Missing photo or failed image | `RequestPhoto` has a refetch path (code, tests) |
| Blocked storage | Role and return path are wrapped in try/catch (code); not run in a browser with storage blocked |
| Multiple tabs | Not verified |
| Denied notification permission | "Blocked" message (code, unit test) |
| Other device time zone or locale | Times are formatted for Calgary with fixed locales (code, tests) |
| Very large lists | Request lists have no paging in the contract; not load tested |

## Code quality
Small modules, shared UI primitives, typed from the contract, few dependencies (React, Next, TanStack Query, Firebase). No new library is needed for any fix here. The one structural lesson: shared behaviour (double-submit guard, timeout, incomplete rows, upload busy) belongs in the shared hook or component, not in each caller.
