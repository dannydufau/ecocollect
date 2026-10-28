'use strict';

// Notification service entry point: the one place that wires the pieces
// together. The pieces don't know about each other.
//
//   RabbitMQ --> subscriber --> handlers (event -> signals) --> hub --> SSE tabs
//                                                                ^
//   browser --> Caddy (/verify adds X-User-Id) --> GET /api/events
//
// Run locally:   RABBITMQ_URL=amqp://user:pass@localhost:5672 node src/notification/index.js
// In Compose:    same image as the backend, started with this file (PORT=80).

const express = require('express');

const { createHub } = require('./hub');
const { createEventsRouter } = require('./events');
const { requestCreated } = require('./handlers');
const { startSubscriber } = require('../messaging/subscriber');

if (!process.env.RABBITMQ_URL) {
  throw new Error('RABBITMQ_URL is not set, see backend/README.md');
}

// One hub per process: the route adds and removes tabs, deliveries write to them.
const hub = createHub();

// --- HTTP: the SSE endpoint ---------------------------------------------------

const app = express();
app.use(createEventsRouter(hub));

// Compose sets PORT=80 (Caddy proxies to "notification" without a port).
// Locally, default to 3002 so it doesn't clash with the API server on 3001.
const port = Number(process.env.PORT || 3002);
const server = app.listen(port, () => console.log(`Notification service listening on port ${port}`));

// --- Broker: events in, signals out ----------------------------------------------

// The adapter between the subscriber and the hub. requestCreated decides who
// gets which signal; this delivers them. If requestCreated throws (a broken
// event), the subscriber logs it and nacks the message.
function deliverRequestCreated(envelope) {
  for (const { uid, signal } of requestCreated(envelope)) {
    const tabs = hub.send(uid, signal);
    // 0 tabs is normal: that user isn't connected to this instance right now.
    console.log(`[notification] ${signal.type} ${signal.requestId} -> ${uid} (${tabs} open tab${tabs === 1 ? '' : 's'})`);
  }
}

const subscriber = startSubscriber({
  url: process.env.RABBITMQ_URL,
  handlers: { RequestCreated: deliverRequestCreated },
});

// --- Shutdown ---------------------------------------------------------------------
// `docker compose stop` sends SIGTERM, then kills the process after 10 s.

let stopping = false;

async function shutdown(signalName) {
  if (stopping) return;
  stopping = true;
  console.log(`[notification] ${signalName}: shutting down`);

  // 1. End every stream, so browsers reconnect (to another instance, if one
  //    is running) and refetch. Also lets server.close() finish below.
  hub.closeAll();
  // 2. Leave the broker; our exclusive queue goes away with the connection.
  await subscriber.stop();
  // 3. Stop accepting new connections, then exit.
  server.close(() => process.exit(0));
  // Safety net if something still holds the server open.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));