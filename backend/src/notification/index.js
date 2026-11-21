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
const { requestCreated } = require('./handlers');
const { pushPayload, createWebPushSender } = require('./push');
const { startSubscriber } = require('../messaging/subscriber');
const { queues } = require('../messaging/topology');
const { createPushRouter } = require('./push-router');
const { createSubscriptionStore } = require('./subscriptions');
const { createNotificationStore } = require('./notification-store');

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

/*
 * Compose sets PORT=80 (Caddy proxies to "notification" without a port).
 * Locally, default to 3002 so it doesn't clash with the API server on 3001.
 */
const port = Number(process.env.PORT || 3002);
const server = app.listen(port, () => console.log(`Notification service listening on port ${port}`));

/*
 * requestCreated decides who gets what; this saves it, then delivers it: signal and
 * notification to open tabs, then a push if the type pushes. The subscriber acks after
 * this returns, so a failed save is retried; a redelivered event saves and sends nothing.
 */
async function deliverRequestCreated(envelope) {
  const deliveries = requestCreated(envelope);
  // A new request is at step 1; v2 events also say so in requestSeq.
  const requestSeq = (envelope.data.request ?? envelope.data).requestSeq ?? 1;
  const saved = await notifications.saveRequestNotifications(deliveries.map(({ uid, notification }) => ({
    notificationId: notification.notificationId,
    type: notification.type,
    createdAt: notification.createdAt,
    accountId: uid,
    pickupRequestId: notification.requestId,
    requestSeq,
  })));

  for (const { uid, signal, notification, push } of deliveries) {
    if (!saved.has(notification.notificationId)) continue;
    const tabs = hub.send(uid, 'signal', signal);
    hub.send(uid, 'notification', notification, notification.notificationId);
    console.log(`[notification] ${notification.type} ${signal.requestId} -> ${uid} (${tabs} open tab${tabs === 1 ? '' : 's'})`);

    // Best-effort and not awaited: a failed push must not redeliver the event (and its SSE frames).
    if (push) {
      pushSender.send(uid, pushPayload(notification))
        .catch((err) => console.warn(`[push] failed for ${uid}: ${err.message}`));
    }
  }
}

const subscriber = startSubscriber({
  queue: queues.notification,
  url: process.env.RABBITMQ_URL,
  handlers: { RequestCreated: deliverRequestCreated },
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
