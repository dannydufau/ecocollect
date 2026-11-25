'use strict';

/*
 * Notification service entry point: wires the pieces together.
 *   RabbitMQ (notification.events) -> subscriber -> 
 *   handlers -> hub -> SSE tabs (GET /api/events)
 *                   -> push sender (Web Push)
 */

const express = require('express');
const { Pool } = require('pg');

const { createHub } = require('./hub');
const { createEventsRouter } = require('./events');
const { requestCreated, requestAssigned, requestCancelled, requestExpired } = require('./handlers');
const { pushPayload, createWebPushSender } = require('./push');
const { startSubscriber, queues } = require('../messaging');
const { createPushRouter } = require('./push-router');
const { createSubscriptionStore } = require('./subscriptions');
const { createNotificationStore } = require('./notification-store');
const { createNotificationsRouter } = require('./notifications-router');

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

// Browsers' push subscriptions (notifications.push_subscription).
const subscriptions = createSubscriptionStore(pool);
const pushSender = createWebPushSender({ vapid, subscriptions });

// Stored notifications (notifications.notification + request_notification).
const notifications = createNotificationStore(pool);

// HTTP: the SSE endpoint

const app = express();
app.use(createEventsRouter(hub));
app.use(createPushRouter({ subscriptions }));
app.use(createNotificationsRouter({ notifications, hub }));

/*
 * Compose sets PORT=80 (Caddy proxies to "notification" without a port).
 * Locally, default to 3002 so it doesn't clash with the API server on 3001.
 */
const port = Number(process.env.PORT || 3002);
const server = app.listen(port, () => console.log(`Notification service listening on port ${port}`));

/*
 * One request event: the handler decides who gets what; this saves it (with the expiry
 * rules), then delivers it: notification (and the Oct 28 signal) to open tabs, a push if
 * the type pushes, and notification-expired for what this event made stale. The subscriber
 * acks after this returns, so a failed save is retried; a redelivered event sends nothing.
 */
function deliverRequestEvent(handler, { leavesOpen }) {
  return async (envelope) => {
    const deliveries = handler(envelope);
    const request = envelope.data.request ?? envelope.data;
    const requestId = request.requestId;
    // Only the old v1 RequestCreated lacks these (a new request is step 1, its own action);
    // every later event is rejected by its handler without them.
    const requestSeq = request.requestSeq ?? 1;
    const transitionId = request.transitionId ?? envelope.eventId;
    const { saved, expired, stale } = await notifications.saveRequestNotifications(
      deliveries.map(({ uid, notification }) => ({
        notificationId: notification.notificationId,
        type: notification.type,
        createdAt: notification.createdAt,
        accountId: uid,
      })),
      { pickupRequestId: requestId, requestSeq, transitionId, leavesOpen },
    );
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
  };
}

const subscriber = startSubscriber({
  queue: queues.notification,
  url: process.env.RABBITMQ_URL,
  handlers: {
    RequestCreated: deliverRequestEvent(requestCreated, { leavesOpen: false }),
    RequestAssigned: deliverRequestEvent(requestAssigned, { leavesOpen: true }),
    RequestCancelled: deliverRequestEvent(requestCancelled, { leavesOpen: true }),
    RequestExpired: deliverRequestEvent(requestExpired, { leavesOpen: true }),
  },
});

// Shutdown: `docker compose stop` sends SIGTERM, then kills after 10 s

let stopping = false;

async function shutdown(signalName) {
  if (stopping) return;
  stopping = true;
  console.log(`[notification] ${signalName}: shutting down`);
  hub.closeAll();
  // Leave the broker. Our queue stays: events published meanwhile wait in it.
  await subscriber.stop();
  await pool.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
