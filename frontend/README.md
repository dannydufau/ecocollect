# EcoCollect frontend

The web app for EcoCollect, Calgary's community e-waste courier: residents request pickups, volunteers collect the items and deliver them to a facility.

Next.js (App Router), React, TypeScript, Tailwind and TanStack Query. Login goes through Firebase, everything else through the `/api` gateway.

## Run it

1. Install and copy the env file:

   ```bash
   npm install
   cp .env.example .env.local
   ```

2. Fill in the Firebase web config in `.env.local` (Firebase console, Project settings, Your apps). `NEXT_PUBLIC_VAPID_KEY` can stay empty, the notifications button then says it is not set up.

3. Pick an API to talk to. `GATEWAY_URL` in `.env.local` is where `/api/*` is forwarded (default `http://localhost:8080`).
   - The mock API: `npm run mock` (listens on 8080, or set `MOCK_PORT`). It keeps data in memory and needs no backend.
     Set `MOCK_NOW=2026-11-22T18:00:00Z` before starting it to freeze fixture and API timestamps for repeatable tests. Firebase emulator tokens use the emulator's wall clock.
     Import seeded request IDs from `mock/fixtures.mjs`. Use `demo-resident-1` for all seven request statuses and `demo-volunteer-1` for available pickups and delivery history. Use `demo-both-1` for both roles, `demo-long-1` for a 50-character username and long profile text, and `demo-empty-1` for empty resident lists. These IDs can be sent directly as Bearer tokens to the mock API.
   - The real stack: `docker compose up` from the repo root, see the [main README](../README.md).

4. Start the app:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>. Sign in with a seeded demo account, set up as in [scripts/seed/README.md](../scripts/seed/README.md). Login always uses the real Firebase project, even with the mock API.

## Environment variables

All of them go in `.env.local` (copied from `.env.example`). The `NEXT_PUBLIC_` ones are baked in at build time.

| Variable | What it is for |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web config: the project's browser API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase web config: the sign-in domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase web config: the project id |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase web config, part of the standard snippet (the app stores no files in Firebase) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase web config, part of the standard snippet |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web config: the web app id |
| `GATEWAY_URL` | Where the Next.js rewrite sends `/api/*`, server side only (the mock or the Caddy gateway) |
| `NEXT_PUBLIC_VAPID_KEY` | Public VAPID key for web push. Empty turns the notifications button into a "not set up" message |
| `NEXT_PUBLIC_DEMO` | `true` builds the demo version (banner and Start demo page instead of login) |

## Signed-in test mode

For browser tests and screenshots. It skips Firebase and signs in as a mock account, so it only works with the mock API.

```bash
npm run mock
npm run e2e:app   # builds into .next-e2e and serves on http://localhost:3100
```

It opens as `demo-resident-1`. To use another mock account, run `sessionStorage.setItem("e2e-account", "demo-volunteer-1")` in the browser console and reload.

Never set `NEXT_PUBLIC_E2E` or `E2E_BUILD_CONFIRM` for a deployed build. The build refuses to run without `E2E_BUILD_CONFIRM=1`, and the signed-in shortcut only works on `localhost`, `127.0.0.1` and `[::1]`, so any other address still goes to the real login.

## Browser tests

From `frontend/`, install the browser engines you want to test. Chromium is the default:

```bash
npx playwright install chromium firefox webkit
npm run e2e
E2E_BROWSER=firefox npm run e2e
E2E_BROWSER=webkit npm run e2e
```

Playwright starts its own mock API on port 3101 and signed-in test build on port 3100. Keep those ports free. The mock and browser share a fixed date, and the suite uses synthetic accounts without Firebase credentials. Route smoke tests run at 320, 375, 768 and 1280 px. Axe scans run at 375 and 1280 px and fail on serious or critical violations. The browser runs with reduced motion on, so a scan never catches an alert halfway through its fade-in (that read as low contrast and failed some runs). A test that checks an animation turns it back on with `test.use({ reducedMotion: "no-preference" })`.

`e2e/acceptance.pw.ts` checks how the pages behave (the main action in view on a phone, the button order, the header, the menus and dialogs, heading levels, no sideways scroll). `e2e/visual.pw.ts` checks the design's values as the browser draws them (colours, fonts, sizes, transition times, badge icons, the invalid-field style). A failure names the route or status in its title and the width in its project.

To cover another page, add its path, expected heading and mock account to `e2e/routes.ts`. Use an account or request ID from `mock/fixtures.mjs`, or set the account to `null` for signed-out pages. Set `destination` if the route redirects. The demo page requires a separate demo build.

Run a single viewport or route using Playwright's filters:

```bash
npm run e2e -- --project=chromium-375 --grep registration
```

### Screenshots for pull requests

```bash
npm run e2e:shots                      # every screen, at 375 and 1280 px
npm run e2e:shots -- --only request    # only the screens with "request" in their name
```

It takes a picture of every route, every request status as the resident and as the volunteer, the empty account's pages, the long-data account's profile and lists, and a 404, and saves them as `e2e/shots/<screen name>/<width>.png`. The folder is not tracked by git. The demo capture uses a separate run with demo mode enabled and checks the “Try EcoCollect” heading before capturing. To add a screen, add it to `e2e/shot-targets.ts`.

## About page data

The categories and EcoPoints text on `/about` are typed into `components/about/content.ts`. Keep them in step with the database and the Reward Service:

| When this changes | Update in `content.ts` |
|---|---|
| Item categories in `../db/init/011_request_seed.sql` (`requests.item_category`) | `acceptedCategories`. The heading count follows the array. |
| `VOLUNTEER_FORMULA` or `RESIDENT_FORMULA` in `../backend/src/reward/points.js` (the text stored in `rewards.ecopoints_award.formula`) | `volunteerFormulaText` and `residentFormulaText`, copied exactly |
| Either formula, or the Monitors weight in the seed | Every string in `workedExample`: the title, both calculations and both point totals |

Then run `npm test`. `components/about/content.test.ts` fails if `acceptedCategories` or the formula text no longer match. Nothing checks `workedExample`, so work it out by hand.

## Frontend pull requests

Before you open one, run `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run e2e`. Attach before and after images of the screens you changed (`npm run e2e:shots -- --only <screen>` makes them).

## Contracts

The API and event contracts live at the repo root: `contracts/openapi.yaml` (every endpoint and body) and `contracts/README.md` (the rules behind them). `npm run types` reads `contracts/openapi.yaml`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run size` | Check the first-load JavaScript produced by the build |
| `npm test` | Unit and component tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run mock` | Mock API |
| `npm run e2e` | Browser journeys, route checks, visual assertions and axe scans |
| `npm run e2e:shots` | Screenshots of every screen for pull requests (`-- --only <name>` for a subset) |
| `npm run e2e:app` | Builds the signed-in test mode and serves it on port 3100 (see Signed-in test mode) |
| `npm run types` | Regenerates `lib/api-types.ts` from `../contracts/openapi.yaml`. Don't edit that file by hand. |

## Where things are

- `app/` pages and layouts. Role pages sit under `resident/` and `volunteer/`, guarded by `components/require-role.tsx`.
- `components/` UI. `components/ui/` holds the shared pieces and the class strings in `styles.ts` (`card`, `input`, `pageTitle`, `textLink`, `clickableCard`). Reuse these instead of repeating the classes.
- `lib/` API client, auth, types, time helpers and the live update streams.
- `mock/` the mock API. Each file in `mock/routes/` adds its own routes.

Times are shown in Calgary time (`lib/time.ts`). Postal codes are sent as `T2P1J9` and shown as `T2P 1J9`.

## Category catalogue maintenance

`CategoryPicker` (`components/resident/category-picker.tsx`) loads its options from `/api/categories`. `CATEGORY_ALIASES` in that file is a hardcoded map of optional everyday search terms keyed by `categoryId` — it does not define or duplicate the catalogue. Any category without aliases remains searchable by its `name` and `wasteType`.

When adding a new category:
1. Add the category and its sample facility acceptance mapping in `db/init/011_request_seed.sql`.
2. Add the category to the mock catalogue in `frontend/mock/fixtures.mjs`.
3. Optionally add everyday search terms for the new `categoryId` in `CATEGORY_ALIASES` (`frontend/components/resident/category-picker.tsx`).

## Baseline

`baseline-js.json` records 19 route budgets measured with Node 24.18.0, Next.js 16.4.6 and Turbopack. Gzip sizes change slightly between Node versions, so compare with the same Node. The size check reads the build's route diagnostics and sums each route's distinct first-load chunks in raw and gzip bytes. To compare with the recorded build, build in a clean checkout without local environment files, using the placeholders below and no other `NEXT_PUBLIC_*` settings. Next.js embeds these values in the browser bundle.

```sh
export NEXT_PUBLIC_FIREBASE_API_KEY=demo-local-key
export NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=example.test
export NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-ecocollect
export NEXT_PUBLIC_FIREBASE_APP_ID=1:123:web:demo
npm run build
npm run size
```

For intentional growth, rerun `npm run size -- --write` after the build and explain the increase in the PR.

`next experimental-analyze --output` identified the 163,043-byte shared chunk (45,158 bytes gzip) as Next.js client runtime code. Its largest parts are the React Server Components client for Turbopack and the Next.js segment cache, prefetch scheduler, and render tree.

Chrome DevTools Lighthouse 13.5.0 performance runs used the earlier production build from `843ceb8` and default navigation profiles. LCP and TBT are in milliseconds.

| Route | Device | LCP (ms) | CLS | TBT (ms) |
|---|---|---:|---:|---:|
| `/login` | Mobile | 2,606 | 0 | 257 |
| `/login` | Desktop | 541 | 0 | 0 |
| `/register` | Mobile | 1,702 | 0 | 2,182 |
| `/register` | Desktop | 637 | 0 | 49 |
| `/resident`, `/volunteer`, a request detail, and `/ecopoints` | Mobile and desktop | Pending | Pending | Pending |

FE-092 (#402) added the authenticated browser setup. The signed-in Lighthouse runs still need to be recorded. Real-account sign-in to first content still needs a DevTools Performance recording with a working Firebase account.
