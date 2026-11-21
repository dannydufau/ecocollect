'use strict';

// Reward Service entry point.
//   RabbitMQ (E5, E6) -> consumer -> handlers -> store -> rewards.outbox -> publisher -> RabbitMQ (E11, E12)
// In Compose: same image as the backend, started with this file.

const { Pool } = require('pg');
const { startConsumer } = require('./consumer');
const { startOutboxPublisher } = require('../messaging/outbox');

const { DATABASE_URL, RABBITMQ_URL } = process.env;
if (!DATABASE_URL || !RABBITMQ_URL) {
  throw new Error('DATABASE_URL and RABBITMQ_URL must be set, see backend/README.md');
}

const pool = new Pool({ connectionString: DATABASE_URL });
// Without this, a Postgres restart would crash the service.
pool.on('error', (err) => console.error(`[reward] database error: ${err.message}`));

startConsumer(pool, RABBITMQ_URL);
startOutboxPublisher({ pool, url: RABBITMQ_URL, table: 'rewards.outbox' });