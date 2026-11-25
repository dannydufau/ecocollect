// Request Service entry point: reads the environment and wires the pieces.
//
//   browser -> Caddy (/verify adds X-User-*) -> app (routes -> SQL functions)
//   outbox (written by the SQL functions) -> publisher -> RabbitMQ
//   RabbitMQ (CleanupRequest) -> subscriber -> consumers/cleanup -> req_expire
//
// Run locally (from backend/), after scripts/request/load-db.sh:
//   DATABASE_URL=postgres://ecocollect_request:<REQUEST_DB_PASSWORD>@localhost:5432/ecocollect \
//     node --env-file=../.env src/request/index.ts
// In Compose:                   same image as the backend, started with this file (PORT=80).
import subscriberModule from '../messaging/subscriber.js';
import topology from '../messaging/topology.js';
import { createApp } from './app.ts';
import { cleanupRequestHandler } from './consumers/cleanup.ts';
import { createPool } from './db/pool.ts';
import { imagekitPhotos } from './imagekit/client.ts';
import { startRequestPublisher } from './messaging/publisher.ts';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set, see backend/README.md`);
  return value;
}

// Photos need ImageKit (contract 6): refuse to start without all four values.
const imagekit = imagekitPhotos({
  privateKey: required('IMAGEKIT_PRIVATE_KEY'),
  publicKey: required('IMAGEKIT_PUBLIC_KEY'),
  urlEndpoint: required('IMAGEKIT_URL_ENDPOINT'),
  rootFolder: required('IMAGEKIT_ROOT_FOLDER'),
});

const pool = createPool(required('DATABASE_URL'));
const rabbitmqUrl = required('RABBITMQ_URL');
const publisher = startRequestPublisher({ pool, url: rabbitmqUrl });

// Consume request.cleanup-events; the subscriber declares the queue and its DLQ.
const subscriber = subscriberModule.startSubscriber({
  queue: topology.queues.request,
  url: rabbitmqUrl,
  handlers: { CleanupRequest: cleanupRequestHandler({ pool, nudgePublisher: publisher.nudge }) },
});

// Compose sets PORT=80 (Caddy proxies to "request" without a port). Locally,
// 3003 so it doesn't clash with notification (3002) or the User Service (3004).
const port = Number(process.env.PORT || 3003);
const demo = process.env.DEMO_MODE === 'true';
const app = createApp({ pool, nudgePublisher: publisher.nudge, demo, imagekit });
const server = app.listen(port, () => {
  console.log(`Request service listening on port ${port}`);
});

// `docker compose stop` sends SIGTERM, then kills the process after 10 s.
// Order: stop taking requests, leave the broker (a message whose ack is lost is
// redelivered after a restart and comes back 'duplicate'), let the publisher finish
// its current send (an unconfirmed event stays leased and is sent again after a
// restart), then close the pool all three use.
let stopping = false;

async function shutdown(signalName: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`request service: ${signalName}, shutting down`);
  setTimeout(() => process.exit(1), 8000).unref(); // safety net, before Docker's kill
  await new Promise((resolve) => server.close(resolve));
  await subscriber.stop();
  await publisher.stop();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
