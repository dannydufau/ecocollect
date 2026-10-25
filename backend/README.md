# Backend

## Auth module (`src/api/auth/`)

Verifies Firebase users for the gateway. It lives in the API server for now and has its own router, so it can become a separate service later.

| Route | What it does |
|---|---|
| `POST /api/session` | Body `{ "idToken": "<Firebase ID token>" }`. Swaps it for an HttpOnly `session` cookie (5 days). `204` on success, `401` for a missing, invalid or stale token. |
| `DELETE /api/session` | Clears the `session` cookie. Always `204`. |
| `GET /verify` | Called by Caddy `forward_auth`. Checks `Authorization: Bearer <ID token>`, or the `session` cookie if there is no bearer. `200` with `X-User-Id` and `X-User-Roles` (comma separated, empty if none), `401` otherwise. Revoked tokens and disabled users are rejected. |

`POST /api/session` is routed without `forward_auth` (there is no session yet). `/verify` is internal and must not be exposed publicly.
A `500` means Firebase itself failed (network, bad config), not that the token was bad.

## Run it

```bash
cd backend
npm install
GOOGLE_APPLICATION_CREDENTIALS=/path/to/firebase-admin.json npm start
```

| Variable | Notes |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to the Firebase service-account key. Never commit it. |
| `FIREBASE_AUTH_EMULATOR_HOST` | Set (e.g. `127.0.0.1:9099`) to use the Auth emulator instead of the key. |
| `PORT` | Defaults to `3001`. |

## Tests

```bash
npm test
```

Firebase is faked in the tests, so they need no credentials or network.
