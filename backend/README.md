# Backend

## Auth module (`src/api/auth/`)

Verifies Firebase users for the gateway. It lives in the API server for now and has its own router, so it can become a separate service later.

| Route | What it does |
|---|---|
| `POST /api/session` | Body `{ "idToken": "<Firebase ID token>" }`. Swaps it for an HttpOnly `session` cookie (5 days). `204` on success, `401` for a missing, invalid or stale token. |
| `DELETE /api/session` | Clears the `session` cookie and revokes the user's sessions on every device. Always `204`. |
| `GET /verify` | Called by Caddy `forward_auth`. Checks `Authorization: Bearer <ID token>`, or the `session` cookie if there is no bearer. `200` with `X-User-Id` and `X-User-Roles` (comma separated, empty if none), `401` otherwise. Revoked tokens and disabled users are rejected. |

`POST /api/session` is routed without `forward_auth` (there is no session yet). `/verify` is internal and must not be exposed publicly.
A `500` means Firebase or our setup failed (network, bad config), not that the token was bad. A body that isn't valid JSON gets a `400`.

## Run it

```bash
cd backend
npm install
npm start
```

Save the Firebase admin key as `secrets/firebase-admin.json` in the repo root (keep it out of git), or point `GOOGLE_APPLICATION_CREDENTIALS` at it. Needs Node 22 or newer.

| Variable | Notes |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to the Firebase service-account key. Defaults to `secrets/firebase-admin.json`. Never commit it. |
| `FIREBASE_AUTH_EMULATOR_HOST` | Set (e.g. `127.0.0.1:9099`) to use the Auth emulator instead of the key. |
| `PORT` | Defaults to `3001`. |
| `NODE_ENV` | Set to `production` when deployed. Otherwise Express puts stack traces in error responses (e.g. a body that is too large). `npm start` does not set it. |

## Tests

```bash
npm test
```

Firebase is faked in the tests, so they need no credentials or network.
