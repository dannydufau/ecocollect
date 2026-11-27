# Email Verification Rollout Runbook

This runbook documents the deployment sequence, pre-enforcement checks, post-deploy reconciliation, and staging rehearsal for enforcing Firebase `email_verified === true` across EcoCollect.

## 1. Pre-enforcement audit (mandatory gate)

Before deploying enforcement to an environment with existing accounts, check every participant in unfinished work against that environment's Firebase project. An account with a working inbox can still be blocked if it has yet to verify.

Use this read-only query to list affected work and the Firebase UID to check for each participant. The terms acceptance identifies both the request owner and the assigned volunteer.

```sql
WITH latest_status AS (
    SELECT DISTINCT ON (pickup_request_id) pickup_request_id, status
    FROM requests.status_change
    ORDER BY pickup_request_id, changed_at DESC
)
SELECT r.pickup_request_id, s.status, 'resident' AS role, t.account_id
FROM requests.pickup_request r
JOIN latest_status s USING (pickup_request_id)
JOIN users.terms_acceptance t USING (terms_acceptance_id)
WHERE s.status IN ('Open', 'Assigned', 'Collected')
UNION ALL
SELECT w.pickup_request_id, s.status, 'volunteer' AS role, t.account_id
FROM requests.assignment a
JOIN requests.pickup_window w USING (pickup_window_id)
JOIN latest_status s ON s.pickup_request_id = w.pickup_request_id
JOIN users.terms_acceptance t ON t.terms_acceptance_id = a.terms_acceptance_id
WHERE a.ended_at IS NULL
ORDER BY pickup_request_id, role;
```

1. Look up every distinct `account_id` as a Firebase UID using the Admin SDK. An eligible participant must exist, be enabled and have `emailVerified === true`. Treat an inconclusive lookup as a blocker until retried successfully.
2. For an unverified participant with an accessible inbox, the previous frontend has no resend button. An authorized operator can look up the user in the deployment's Firebase project, call `getAuth().generateEmailVerificationLink(user.email)` and deliver the link privately to that exact address. The Admin SDK generates the link and the operator sends it. Keep links out of logs, tickets and chat. Ask the user to follow the link, then check `emailVerified` again. [Firebase Admin SDK instructions](https://firebase.google.com/docs/auth/admin/email-action-links#generate_email_verification_link)
3. If pre-verification is unavailable, resolve the work while users can still act through the previous app. Use the actions available for the current status and pickup window. For a collected pickup, record delivery only after it actually happens. Hold the release while any blocked participant still has unfinished work. Unverified accounts without unfinished work can use **Send again** after release.
4. Schedule a quiet period and ask users and operators to stop creating, editing or acting on pickups during the cutover. Let outstanding actions finish, rerun the query and Firebase checks immediately before deployment, and postpone if new unresolved work appears or the quiet period cannot be maintained. Rerun the audit just after the Caddy check and before ending the quiet period. If an account is stranded, restore the previous User Service and frontend, resolve the work and repeat the cutover. This quiet-period procedure depends on participants observing it. If that cannot be arranged, reschedule the cutover.

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

Rehearse on the previous build in isolated staging with a test Firebase project and trusted HTTPS for browser push. Use Account A (verified) and Account B (unverified, with an inbox you control) in **separate browser profiles or devices**. Keep both original browser sessions open. Record the tested commit and save sanitized evidence of each outcome.

1. Open private SSE and enable push in both profiles. Trigger a test notification for each account through the normal pickup flow. Confirm both accounts receive the SSE notification and device push in their own profiles before proceeding.
2. Give Account B unfinished test work and verify that the audit blocks deployment. Resolve the work through the existing lifecycle, leave B unverified, and follow the quiet-period audit procedure. Deploy User Service + Frontend, confirm `403 email_verification_required` through Caddy with a valid unverified ID token, and restart the Notification Service.
3. Confirm **Account A (verified)** reconnects to `/api/events` automatically and continues receiving live notifications and push.
4. Confirm **Account B (unverified)**:
   - Its existing `/api/events` stream closes on Notification Service restart and cannot reconnect (`403 email_verification_required`).
   - Protected routes redirect to `/verify-email` while keeping the Firebase user signed in.
   - After push reconciliation removes Account B's `notifications.push_subscription` row, new push delivery stops for Account B.
5. Open Account B's Firebase verification link (testing from another device/browser), then click **I’ve verified** in the original browser session:
   - Confirm Account B's session is created, protected actions work, and private `/api/events` opens.
   - Verify **both** push recovery paths:
     - **Path A (local cleanup ran while unverified):** Because confirmed-unverified browser sessions attempt to unsubscribe locally, the UI typically shows **Turn on device notifications**. Click it, confirm the browser re-subscribes and registers via `POST /api/push/subscriptions`, and verify push delivery resumes.
     - **Path B (browser subscription survived while server row was removed):** On a verified session where the browser still holds an existing `PushSubscription` (e.g., an offline tab or after server-side row removal) and the UI shows push as **On**, click **Reconnect device notifications**. Confirm it re-registers the existing browser subscription via `POST /api/push/subscriptions` without re-prompting, shows confirmation, and restores push delivery.
