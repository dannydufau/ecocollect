'use strict';

// Cleanup Service against RabbitMQ and PostgreSQL (contract 11 and 14).
// Requires RABBITMQ_URL and TEST_DATABASE_URL. Stop any running cleanup container first.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const amqp = require('amqplib');
const { Pool } = require('pg');

const { exchange, events } = require('../../src/messaging/topology');
const { startOutboxPublisher } = require('../../src/messaging/outbox');
const { startConsumer } = require('../../src/cleanup/consumer');
const { fireDueJobs } = require('../../src/cleanup/store');

const { RABBITMQ_URL, TEST_DATABASE_URL } = process.env;
const skip = RABBITMQ_URL && TEST_DATABASE_URL ? false : 'set RABBITMQ_URL and TEST_DATABASE_URL';

async function waitFor(check, what) {
  const deadline = Date.now() + 15000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test('request events set and end a job, and a due job reaches the exchange', { skip }, async (t) => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createConfirmChannel();
  const requestId = randomUUID();

  const started = [];
  const consumer = startConsumer({ pool, url: RABBITMQ_URL, log: { info: (text) => started.push(text), warn() {}, error() {}, debug() {} } });
  const stopPublisher = startOutboxPublisher({ pool, url: RABBITMQ_URL, table: 'cleanup.outbox', orderByInsertion: true, intervalMs: 100 });
  await waitFor(() => started.length > 0, 'the consumer to start');

  // Temporary queue bound to the CleanupRequest routing key.
  const { queue: caught } = await channel.assertQueue('', { exclusive: true });
  await channel.bindQueue(caught, exchange.name, 'cleanup.request.due');

  t.after(async () => {
    await consumer.stop();
    await stopPublisher();
    await pool.query(`DELETE FROM cleanup.outbox WHERE payload->'data'->>'requestId' = $1`, [requestId]);
    await pool.query('DELETE FROM cleanup.expiry_job WHERE request_id = $1', [requestId]);
    await connection.close();
    await pool.end();
  });

  // Publishes a request event and waits until it is processed.
  async function send(type, requestSeq, expiresAt = null) {
    const eventId = randomUUID();
    const event = { eventId, type, version: 1, occurredAt: new Date().toISOString(), producer: 'request-service', traceId: null, data: { request: { requestId, requestSeq, expiresAt } } };
    channel.publish(exchange.name, events[type].routingKey, Buffer.from(JSON.stringify(event)), { persistent: true });
    await channel.waitForConfirms();
    await waitFor(async () => (await pool.query('SELECT 1 FROM cleanup.processed_events WHERE event_id = $1', [eventId])).rowCount === 1, type);
  }
  const runAt = async () => (await pool.query('SELECT run_at FROM cleanup.expiry_job WHERE request_id = $1', [requestId])).rows[0].run_at;

  await send('RequestCreated', 1, '2030-01-15T21:00:00Z');
  assert.equal((await runAt()).toISOString(), '2030-01-15T21:00:00.000Z');

  await fireDueJobs(pool, '2030-01-15T21:00:00Z');
  await waitFor(async () => {
    const message = await channel.get(caught, { noAck: true });
    return message && JSON.parse(message.content).data.requestId === requestId;
  }, 'a CleanupRequest on the exchange');

  await send('RequestAssigned', 2);
  await send('RequestUpdated', 1, '2030-01-15T21:00:00Z');
  assert.equal(await runAt(), null);
});