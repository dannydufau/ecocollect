// Request Service entry point: reads the environment and wires the pieces.
//
//   browser -> Caddy (/verify adds X-User-*) -> app (routes -> SQL functions)
//   outbox (written by the SQL functions) -> publisher -> RabbitMQ
//
// Run locally (from backend/), on the database built by scripts/request/load-db.sh:
//   DATABASE_URL=postgres://ecocollect:change_me@localhost:5432/ecocollect_request \
//     node --env-file=../.env src/request/index.ts
// In Compose:                   same image as the backend, started with this file (PORT=80).
import { createApp } from './app.ts';
import { createPool } from './db/pool.ts';
import { startRequestPublisher } from './messaging/publisher.ts';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set, see backend/README.md`);
  return value;
}

const pool = createPool(required('DATABASE_URL'));
const publisher = startRequestPublisher({ pool, url: required('RABBITMQ_URL') });

// Compose sets PORT=80 (Caddy proxies to "request" without a port). Locally,
// 3003 so it doesn't clash with the API server (3001) or notification (3002).
const port = Number(process.env.PORT || 3003);
const server = createApp({ pool }).listen(port, () => {
  console.log(`Request service listening on port ${port}`);
});

// `docker compose stop` sends SIGTERM, then kills the process after 10 s.
// Order: stop taking requests, let the publisher finish its current send
// (an unconfirmed event stays leased and is sent again after a restart),
// then close the pool both of them use.
let stopping = false;

async function shutdown(signalName: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`request service: ${signalName}, shutting down`);
  setTimeout(() => process.exit(1), 8000).unref(); // safety net, before Docker's kill
  await new Promise((resolve) => server.close(resolve));
  await publisher.stop();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
