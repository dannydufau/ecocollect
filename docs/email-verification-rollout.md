# Email Verification Rollout Runbook

This runbook documents the deployment sequence, pre-enforcement checks, post-deploy reconciliation, and staging rehearsal for enforcing Firebase `email_verified === true` across EcoCollect.

## 1. Pre-enforcement audit (mandatory gate)

Before deploying enforcement to any environment with existing accounts, audit all active work tied to accounts that cannot verify their email address (for example, legacy placeholder/test accounts without a real inbox):

1. Identify accounts with `email_verified !== true` in Firebase Auth.
2. Query PostgreSQL for any **Open**, **Assigned**, or **Collected** pickup requests owned by those accounts, and any **Active** or **Collected** volunteer assignments (`requests.assignment.ended_at IS NULL`) held by those accounts.
3. Resolve every such item through the normal application lifecycle before enabling enforcement:
   - Open/Assigned requests may be cancelled or completed normally.
   - **Collected** pickups **must** follow the delivery flow (`POST /api/requests/:id/assignment/delivery`) so items are accounted for and never stranded.
4. **Hold enforcement** if any in-progress work would be stranded by blocking an account that cannot verify.

## 2. Deployment sequence

Deploy the User Service and frontend together so unverified users immediately receive the `/verify-email` flow instead of raw `403` errors:

1. **Deploy User Service + Frontend together** (build and restart `user` and `frontend` containers).
2. **Verify `403 email_verification_required` through Caddy:**
   - Send an unverified Firebase ID token (or session cookie) to a protected route (e.g. `GET /api/profile`) and `POST /api/session` through Caddy.
   - Confirm HTTP `403` with `{ "error": { "code": "email_verification_required", "message": "Verify your email address before continuing." } }`.
   - Confirm a public route (e.g. `GET /api/terms` or `GET /api/public/stats`) still returns `200`, and `DELETE /api/session` still returns `204`.
3. **Explicitly restart the Notification Service** (`docker compose restart notification`):
   - Caddy `forward_auth` only runs when an SSE stream opens. Restarting the Notification Service immediately closes any private `/api/events` streams that were opened before enforcement.
   - Verified clients automatically reconnect with backoff; unverified clients receive `403 email_verification_required` on reconnect and stay disconnected.
4. **Reconcile stored push subscriptions (separate post-deploy pass):**
   - Inspect distinct `account_id` values in `notifications.push_subscription` against Firebase Auth.
   - Remove rows **only** for accounts confirmed `email_verified !== true` or `auth/user-not-found`.
   - **Leave rows untouched** on any inconclusive/network/rate-limit Firebase lookup error, and retry those accounts in a subsequent pass.
   - Verified users whose browser still holds a subscription after an unintended server removal can re-register it via **Reconnect device notifications** in the UI without re-prompting for browser permission.

## 3. Demo Mode note

If a separate Demo Mode deployment (`DEMO_MODE=true`) is active on an isolated Firebase project, `POST /api/demo/session` creates synthetic visitors with `emailVerified: true` so visitors can test the full workflow without an email inbox. The same `email_verified === true` check is enforced uniformly by `POST /api/session` and `GET /verify` everywhere. If Demo Mode is retired for final submission (#509), `POST /api/demo/session` is not registered when `DEMO_MODE !== 'true'` and has no effect on production. The legacy `scripts/seed` utility is left unchanged.

## 4. Staging rehearsal checklist

Rehearse in staging (with a test Firebase project) using two accounts — Account A (verified) and Account B (unverified, with a private SSE stream and Web Push enabled **before** deploying enforcement):

1. Deploy User Service + Frontend, confirm `403 email_verification_required` through Caddy, and restart the Notification Service.
2. Confirm **Account A (verified)** reconnects to `/api/events` automatically and continues receiving live notifications and push.
3. Confirm **Account B (unverified)**:
   - Its existing `/api/events` stream closes on Notification Service restart and cannot reconnect (`403 email_verification_required`).
   - Protected routes redirect to `/verify-email` while keeping the Firebase user signed in.
   - After push reconciliation removes Account B's `notifications.push_subscription` row, new push delivery stops for Account B.
4. Open Account B's Firebase verification link (testing from another device/browser), then click **I’ve verified** in the original browser session:
   - Confirm Account B's session is created, protected actions work, and private `/api/events` opens.
   - Verify **both** push recovery paths:
     - **Path A (local cleanup ran while unverified):** Because confirmed-unverified browser sessions attempt to unsubscribe locally, the UI typically shows **Turn on device notifications**. Click it, confirm the browser re-subscribes and registers via `POST /api/push/subscriptions`, and verify push delivery resumes.
     - **Path B (browser subscription survived while server row was removed):** On a verified session where the browser still holds an existing `PushSubscription` (e.g., an offline tab or after server-side row removal) and the UI shows push as **On**, click **Reconnect device notifications**. Confirm it re-registers the existing browser subscription via `POST /api/push/subscriptions` without re-prompting, shows confirmation, and restores push delivery.
