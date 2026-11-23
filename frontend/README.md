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

Not in the example: `NEXT_PUBLIC_DEMO=true` builds the demo version (banner and Start demo page instead of login).

## Signed-in test mode

For browser tests and screenshots. It skips Firebase and signs in as a mock account, so it only works with the mock API.

```bash
npm run mock
npm run e2e:app   # builds into .next-e2e and serves on http://localhost:3100
```

It opens as `demo-resident-1`. To use another mock account, run `sessionStorage.setItem("e2e-account", "demo-volunteer-1")` in the browser console and reload.

Never set `NEXT_PUBLIC_E2E` or `E2E_BUILD_CONFIRM` for a deployed build. The build refuses to run without `E2E_BUILD_CONFIRM=1`, and the signed-in shortcut only works on `localhost`, `127.0.0.1` and `[::1]`, so any other address still goes to the real login.

## Contracts

The API and event contracts live at the repo root: `contracts/openapi.yaml` (every endpoint and body) and `contracts/README.md` (the rules behind them). `npm run types` reads `contracts/openapi.yaml`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Unit and component tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run mock` | Mock API |
| `npm run e2e:app` | Builds the signed-in test mode and serves it on port 3100 (see below) |
| `npm run types` | Regenerates `lib/api-types.ts` from `../contracts/openapi.yaml`. Don't edit that file by hand. |

## Where things are

- `app/` pages and layouts. Role pages sit under `resident/` and `volunteer/`, guarded by `components/require-role.tsx`.
- `components/` UI. `components/ui/` holds the shared pieces and the class strings in `styles.ts` (`card`, `input`, `pageTitle`, `textLink`, `clickableCard`). Reuse these instead of repeating the classes.
- `lib/` API client, auth, types, time helpers and the live update streams.
- `mock/` the mock API. Each file in `mock/routes/` adds its own routes.

Times are shown in Calgary time (`lib/time.ts`). Postal codes are sent as `T2P1J9` and shown as `T2P 1J9`.
