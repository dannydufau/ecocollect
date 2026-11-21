'use strict';

// Reward Service entry point: consumer, outbox publisher and the R1 to R3 routes.

const express = require('express');
const { Pool } = require('pg');
const { startConsumer } = require('./consumer');
const { createRoutes } = require('./routes');
const { startOutboxPublisher } = require('../messaging/outbox');

const { DATABASE_URL, RABBITMQ_URL } = process.env;
const PORT = Number(process.env.PORT || 3005);
if (!DATABASE_URL || !RABBITMQ_URL) {
  throw new Error('DATABASE_URL and RABBITMQ_URL must be set, see backend/README.md');
}

const pool = new Pool({ connectionString: DATABASE_URL });
// Logs errors from idle connections instead of exiting.
pool.on('error', (err) => console.error(`[reward] database error: ${err.message}`));

const app = express();
app.disable('x-powered-by');
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use(createRoutes(pool));
app.use((req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } }));
// Express calls a handler with four arguments only for errors.
app.use((err, req, res, next) => {
  console.error(`[reward] ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong. Nothing was saved; try again.' } });
});

const server = app.listen(PORT, () => console.log(`[reward] listening on port ${PORT}`));
const consumer = startConsumer({ pool, url: RABBITMQ_URL });
const stopPublisher = startOutboxPublisher({ pool, url: RABBITMQ_URL, table: 'rewards.outbox', orderByInsertion: true });

// Shutdown order: HTTP server, consumer, publisher, pool.
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[reward] ${signal}: shutting down`);
  setTimeout(() => process.exit(1), 8000).unref();
  await new Promise((resolve) => server.close(resolve));
  await consumer.stop();
  await stopPublisher();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));