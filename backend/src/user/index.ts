import { createApp } from './app.ts';
import firebase from './auth/firebase.cjs';
import { closePool, getPool } from './db/pool.ts';
import outbox from '../messaging/outbox.js';

const port = Number(process.env.PORT || 3004);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const auth = firebase.getFirebaseAuth();
const url = process.env.RABBITMQ_URL;
if (!url) throw new Error('RABBITMQ_URL is required for the User Service outbox.');
const pool = getPool();
const app = await createApp({ auth });
const stopPublisher = outbox.startOutboxPublisher({ pool, url, table: 'users.outbox', orderByInsertion: true });
const server = app.listen(port, () => { console.log(`User service listening on port ${port}`); });
let stopping = false;

function shutdown(): void {
  if (stopping) return;
  stopping = true;
  setTimeout(() => process.exit(1), 8000).unref();
  server.close(async error => {
    try {
      await stopPublisher();
      await closePool();
    } catch (shutdownError) {
      console.error('User Service shutdown:', shutdownError);
      process.exit(1);
    }
    process.exit(error ? 1 : 0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
