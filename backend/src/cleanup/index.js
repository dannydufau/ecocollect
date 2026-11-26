'use strict';

// Cleanup Service entry point: consumer, timers and outbox publisher.

const { Pool } = require('pg');
const { startConsumer } = require('./consumer');
const { startTimers } = require('./timers');
const { startOutboxPublisher } = require('../messaging/outbox');

const { DATABASE_URL, RABBITMQ_URL } = process.env;
if (!DATABASE_URL || !RABBITMQ_URL) {
  throw new Error('DATABASE_URL and RABBITMQ_URL must be set, see backend/README.md');
}

const pool = new Pool({ connectionString: DATABASE_URL });
// Logs errors from idle connections instead of exiting.
pool.on('error', (err) => console.error(`[cleanup] database error: ${err.message}`));

const consumer = startConsumer({ pool, url: RABBITMQ_URL });
const stopTimers = startTimers(pool);
const stopPublisher = startOutboxPublisher({ pool, url: RABBITMQ_URL, table: 'cleanup.outbox', orderByInsertion: true });
console.log('[cleanup] started');

// Shutdown order: timers, consumer, publisher, pool.
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[cleanup] ${signal}: shutting down`);
  setTimeout(() => process.exit(1), 8000).unref();
  await stopTimers();
  await consumer.stop();
  await stopPublisher();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));