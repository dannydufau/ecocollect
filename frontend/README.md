# EcoCollect frontend

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
   - The real stack: `docker compose up` from the repo root, see the [main README](../README.md).

4. Start the app:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>. Sign in with a seeded demo account, set up as in [scripts/seed/README.md](../scripts/seed/README.md). Login always uses the real Firebase project, even with the mock API.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Unit and component tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run mock` | Mock API |
| `npm run types` | Regenerates `lib/api-types.ts` from `../contracts/openapi.yaml`. Don't edit that file by hand. |

## Where things are

- `app/` pages and layouts. Role pages sit under `resident/` and `volunteer/`, guarded by `components/require-role.tsx`.
- `components/` UI. `components/ui/` holds the shared pieces and the class strings in `styles.ts` (`card`, `input`, `pageTitle`, `textLink`, `clickableCard`). Reuse these instead of repeating the classes.
- `lib/` API client, auth, types, time helpers and the live update streams.
- `mock/` the mock API. Each file in `mock/routes/` adds its own routes.

Times are shown in Calgary time (`lib/time.ts`). Postal codes are sent as `T2P1J9` and shown as `T2P 1J9`.
