'use strict';

/*
 * Notification service entry point: wires the pieces together.
 *   RabbitMQ (notification.events) -> subscriber -> handlers -> store (Postgres)
 *     -> hub -> SSE tabs (GET /api/events)
 *     -> push sender (Web Push)
 */

const express = require('express');
const { Pool } = require('pg');

const { createHub } = require('./hub');
const { createEventsRouter } = require('./events');
const {
  requestCreated, requestUpdated, requestAssigned, assignmentCollected, assignmentDelivered,
  assignmentCancelledByResident, assignmentCancelledByVolunteer, assignmentMissed, requestCancelled, requestExpired,
  awardsEarned, replacements,
} = require('./handlers');
const { pushPayload, createWebPushSender } = require('./push');
const { startSubscriber, queues } = require('../messaging');
const { createPushRouter } = require('./push-router');
const { createSubscriptionStore } = require('./subscriptions');
const { createNotificationStore } = require('./notification-store');
const { createNotificationsRouter } = require('./notifications-router');
const { createPublicEventsRouter, profileKey, STATS_KEY } = require('./public-events');

const vapid = {
  subject: process.env.VAPID_SUBJECT,
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

if (!process.env.RABBITMQ_URL) {
  throw new Error('RABBITMQ_URL is not set, see backend/README.md');
}

for (const name of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
  if (!process.env[name]) throw new Error(`${name} is not set, run npx web-push generate-vapid-keys (see .env.example)`);
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set, see backend/README.md');
}

// One pool of Postgres connections for the process; the store borrows one per query.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (err) => console.error(`[db] ${err.message}`));

// One hub per process: the route adds and removes tabs, deliveries write to them.
const hub = createHub();

// A second hub for the public pages' streams, keyed by what each page watches (a profile or the stats).
const publicHub = createHub();

// Browsers' push subscriptions (notifications.push_subscription).
const subscriptions = createSubscriptionStore(pool);
const pushSender = createWebPushSender({ vapid, subscriptions });

// Stored notifications (notifications.notification + request_notification).
const notifications = createNotificationStore(pool);

// HTTP: SSE (N1), the public stream (N2), push subscriptions (N6, N7) and the notification list (N3-N5)

const app = express();
app.use(createEventsRouter(hub));
app.use(createPublicEventsRouter(publicHub));
app.use(createPushRouter({ subscriptions }));
app.use(createNotificationsRouter({ notifications, hub }));

/*
 * Compose sets PORT=80 (Caddy proxies to "notification" without a port).
 * Locally, default to 3002 (request is 3003, user 3004).
 */
const port = Number(process.env.PORT || 3002);
const server = app.listen(port, () => console.log(`Notification service listening on port ${port}`));

/*
 * One request event: the handler decides who gets what; this saves it (with the expiry
 * rules), then delivers it: notification (and the Oct 28 signal) to open tabs, a push if
 * the type pushes, and for what this event made stale: notification-expired, plus a silent
 * push over any that may still be on a phone. The subscriber
 * acks after this returns, so a failed save is retried; a redelivered event sends nothing.
 */
function deliverRequestEvent(handler, { expiresMatching, availableRequestsChanged }) {
  return async (envelope) => {
    const deliveries = handler(envelope);
    const request = envelope.data.request ?? envelope.data;
    const requestId = request.requestId;
    // Only the old v1 RequestCreated lacks these (a new request is step 1, its own action);
    // every later event is rejected by its handler without them.
    const requestSeq = request.requestSeq ?? 1;
    const transitionId = request.transitionId ?? envelope.eventId;
    // E2 only: why the request changed, and which fields an edit changed (none on a reopen).
    const update = envelope.type === 'RequestUpdated'
      ? { reason: envelope.data.reason, changed: envelope.data.changed ?? [] }
      : null;
    const result = await notifications.saveRequestNotifications(
      envelope.eventId,
      deliveries.map(({ uid, notification }) => ({
        notificationId: notification.notificationId,
        type: notification.type,
        createdAt: notification.createdAt,
        accountId: uid,
      })),
      { pickupRequestId: requestId, requestSeq, transitionId, expiresMatching, update },
    );
    if (result === null) return;
    const { saved, expired, stale } = result;

    // Tell every volunteer tab to refetch its available list, matched or not (contract 13.3).
    if (availableRequestsChanged) {
      const tabs = hub.sendToRole('volunteer', 'available-requests-changed', { requestId });
      console.log(`[notification] available-requests-changed ${requestId} -> ${tabs} volunteer tab${tabs === 1 ? '' : 's'}`);
    }

    if (stale) {
      console.log(`[notification] ${envelope.type} ${requestId} seq ${requestSeq} is late: saved expired, not sent`);
      return;
    }

    for (const { uid, signal, notification, push } of deliveries) {
      if (!saved.has(notification.notificationId)) continue;
      if (signal) hub.send(uid, 'signal', signal);
      const tabs = hub.send(uid, 'notification', notification, notification.notificationId);
      console.log(`[notification] ${notification.type} ${requestId} -> ${uid} (${tabs} open tab${tabs === 1 ? '' : 's'})`);

      // Best-effort and not awaited: a failed push must not redeliver the event (and its SSE frames).
      if (push) {
        pushSender.send(uid, pushPayload(notification))
          .then((delivered) => delivered > 0 && notifications.markPushed(notification.notificationId))
          .catch((err) => console.warn(`[push] failed for ${uid}: ${err.message}`));
      }
    }

    // One notification-expired per account, listing its notifications this event made stale.
    const byAccount = new Map();
    for (const { notificationId, accountId } of expired) {
      byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), notificationId]);
    }
    for (const [uid, notificationIds] of byAccount) {
      hub.send(uid, 'notification-expired', { notificationIds, requestId, tag: `request-${requestId}` });
    }

    for (const { uid, notification } of replacements(request, deliveries, expired)) {
      pushSender.send(uid, { ...pushPayload(notification), silent: true })
        .catch((err) => console.warn(`[push] replacing failed for ${uid}: ${err.message}`));
    }
  };
}

// Tells the public pages watching this account's profile to refetch it (13.5).
function sendPublicProfileUpdated(accountId) {
  const pages = publicHub.send(profileKey(accountId), 'public-profile-updated', { accountId });
  console.log(`[notification] public-profile-updated ${accountId} -> ${pages} public page${pages === 1 ? '' : 's'}`);
}

/*
 * One award event (E11, E12): save each award's notification, then send it to the account's
 * open tabs and push it. Award notifications never expire and don't change the available list.
 * The public profile page of each awarded account and the stats page then refetch.
 * The subscriber acks after this returns, so a failed save is retried; a redelivered event sends nothing.
 */
function deliverAwardEvent(handler) {
  return async (envelope) => {
    const deliveries = handler(envelope);
    const saved = await notifications.saveAwardNotifications(
      envelope.eventId,
      deliveries.map(({ uid, awardId, notification }) => ({
        notificationId: notification.notificationId,
        type: notification.type,
        createdAt: notification.createdAt,
        accountId: uid,
        awardId,
      })),
    );

    if (saved === null) return;

    for (const { uid, notification, push } of deliveries) {
      if (!saved.has(notification.notificationId)) continue;
      const tabs = hub.send(uid, 'notification', notification, notification.notificationId);
      console.log(`[notification] ${notification.type} award ${notification.awardId} -> ${uid} (${tabs} open tab${tabs === 1 ? '' : 's'})`);

      // Best-effort and not awaited, as for request events.
      if (push) {
        pushSender.send(uid, pushPayload(notification))
          .then((delivered) => delivered > 0 && notifications.markPushed(notification.notificationId))
          .catch((err) => console.warn(`[push] failed for ${uid}: ${err.message}`));
      }
    }

    for (const uid of new Set(deliveries.map(({ uid }) => uid))) sendPublicProfileUpdated(uid);

    const pages = publicHub.send(STATS_KEY, 'stats-updated', {});
    console.log(`[notification] stats-updated -> ${pages} public page${pages === 1 ? '' : 's'}`);
  };
}

/*
 * The daily cleanup (E14): delete every expired notification. Nothing is sent: open tabs
 * already got notification-expired when each one expired.
 */
async function deleteExpiredNotifications({ eventId }) {
  const deleted = await notifications.deleteExpired(eventId);
  if (deleted === null) return;
  console.log(`[notification] cleanup: deleted ${deleted} expired notification${deleted === 1 ? '' : 's'}`);
}

/*
 * A profile change (E15, from U7 or U8): tell the account's open tabs which fields changed, so
 * they refetch the profile (and redo the sign-in when roles changed).
 * A change to the public name or roles also makes the account's public profile page refetch.
 */
async function sendProfileUpdated(envelope) {
  const { accountId, changed } = envelope.data;
  if (typeof accountId !== 'string' || accountId === '') throw new Error('ProfileUpdated without an accountId');
  if (!Array.isArray(changed)) throw new Error('ProfileUpdated without a changed list');

  if (!(await notifications.processEvent(envelope.eventId))) return;

  const tabs = hub.send(accountId, 'profile-updated', { changed });
  console.log(`[notification] profile-updated [${changed.join(', ')}] -> ${accountId} (${tabs} open tab${tabs === 1 ? '' : 's'})`);

  // Only the public name and roles show on the public profile page.
  const publicProfileChanged = changed.includes('publicName') || changed.includes('roles');
  if (publicProfileChanged) sendPublicProfileUpdated(accountId);
}

/*
 * A deactivated account (E16, from U9): delete its notifications and push subscriptions, then
 * send account-deactivated to its open tabs and close them (the frontend signs out).
 * Its public profile page refetches too, and finds the profile gone.
 * Database first: if the delete fails the event is retried, and nothing was sent yet.
 * Later events skip the account, because the store reads its deactivated_at.
 */
async function handleDeactivatedAccount(envelope) {
  const { accountId } = envelope.data;
  if (typeof accountId !== 'string' || accountId === '') throw new Error('AccountDeactivated without an accountId');

  const deleted = await notifications.deleteAccountData(envelope.eventId, accountId);
  if (deleted === null) return;
  const tabs = hub.closeUser(accountId, 'account-deactivated', {});
  console.log(`[notification] account-deactivated ${accountId}: deleted ${deleted.notifications} notifications`
    + ` and ${deleted.subscriptions} push subscriptions, closed ${tabs} open tab${tabs === 1 ? '' : 's'}`);
  sendPublicProfileUpdated(accountId);
}

const subscriber = startSubscriber({
  queue: queues.notification,
  url: process.env.RABBITMQ_URL,
  handlers: {
    RequestCreated: deliverRequestEvent(requestCreated, { expiresMatching: false, availableRequestsChanged: true }),
    // Still Open, but the old NEW_MATCHING_REQUESTs describe the old details: matched volunteers get fresh ones.
    RequestUpdated: deliverRequestEvent(requestUpdated, { expiresMatching: true, availableRequestsChanged: true }),
    RequestAssigned: deliverRequestEvent(requestAssigned, { expiresMatching: true, availableRequestsChanged: true }),
    // Assignment events: the request is past Open, so there is nothing to expire for matching
    // volunteers and the available list doesn't change. On a cancel, the E2 (reopened) or E10
    // that follows updates it; on a missed pickup with a reschedule, the new request's E1 does.
    RequestAssignmentCollected: deliverRequestEvent(assignmentCollected, { expiresMatching: false, availableRequestsChanged: false }),
    RequestAssignmentDelivered: deliverRequestEvent(assignmentDelivered, { expiresMatching: false, availableRequestsChanged: false }),
    RequestAssignmentCancelledResident: deliverRequestEvent(assignmentCancelledByResident, { expiresMatching: false, availableRequestsChanged: false }),
    RequestAssignmentCancelledVolunteer: deliverRequestEvent(assignmentCancelledByVolunteer, { expiresMatching: false, availableRequestsChanged: false }),
    RequestAssignmentMissed: deliverRequestEvent(assignmentMissed, { expiresMatching: false, availableRequestsChanged: false }),
    RequestCancelled: deliverRequestEvent(requestCancelled, { expiresMatching: true, availableRequestsChanged: true }),
    RequestExpired: deliverRequestEvent(requestExpired, { expiresMatching: true, availableRequestsChanged: true }),
    PointsAwardedDelivery: deliverAwardEvent(awardsEarned('delivery')),
    PointsAwardedCancellation: deliverAwardEvent(awardsEarned('cancellation')),
    NotificationCleanupRequested: deleteExpiredNotifications,
    ProfileUpdated: sendProfileUpdated,
    AccountDeactivated: handleDeactivatedAccount,
  },
});

// Shutdown: `docker compose stop` sends SIGTERM, then kills after 10 s

let stopping = false;

async function shutdown(signalName) {
  if (stopping) return;
  stopping = true;
  console.log(`[notification] ${signalName}: shutting down`);
  hub.closeAll();
  publicHub.closeAll();
  // Leave the broker. Our queue stays: events published meanwhile wait in it.
  await subscriber.stop();
  await pool.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
