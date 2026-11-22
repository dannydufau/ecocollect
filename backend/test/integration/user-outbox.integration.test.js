const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const amqp = require('amqplib');
const { Pool } = require('pg');
const { startOutboxPublisher } = require('../../src/messaging/outbox');
const { exchange } = require('../../src/messaging/topology');

test('User relay delivers a confirmed event to RabbitMQ and marks the row published', {
  skip: !(process.env.TEST_DATABASE_URL && process.env.RABBITMQ_URL) && 'requires scratch PostgreSQL and RabbitMQ',
  timeout: 10000,
}, async t => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const eventId = randomUUID();
  t.after(async () => {
    try {
      await pool.query('DELETE FROM users.outbox WHERE event_id = $1', [eventId]);
    } finally {
      await pool.end();
    }
  });
  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  t.after(() => connection.close());
  const channel = await connection.createChannel();
  await channel.assertExchange(exchange.name, exchange.type, { durable: exchange.durable });
  const { queue } = await channel.assertQueue('', { exclusive: true });
  const routingKey = 'user.account.deactivated';
  await channel.bindQueue(queue, exchange.name, routingKey);
  const occurredAt = new Date().toISOString();
  const payload = {
    eventId, type: 'AccountDeactivated', version: 1, occurredAt, producer: 'user-service',
    traceId: null, data: { accountId: 'outbox-test', deactivatedAt: occurredAt },
  };
  await pool.query(`INSERT INTO users.outbox (event_id, event_type, routing_key, aggregate_id, payload)
    VALUES ($1,$2,$3,$4,$5)`, [eventId, payload.type, routingKey, payload.data.accountId, payload]);
  const stop = startOutboxPublisher({
    pool, url: process.env.RABBITMQ_URL, table: 'users.outbox', orderByInsertion: true, intervalMs: 20,
  });
  try {
    const deadline = Date.now() + 5000;
    let message;
    let publishedAt;
    while ((!message || !publishedAt) && Date.now() < deadline) {
      const delivery = await channel.get(queue, { noAck: true });
      if (delivery && delivery.properties.messageId === eventId) message = delivery;
      const { rows } = await pool.query('SELECT published_at FROM users.outbox WHERE event_id = $1', [eventId]);
      publishedAt = rows[0].published_at;
      if (!message || !publishedAt) await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(message, 'expected the outbox event on the exchange');
    assert.ok(publishedAt, 'expected the confirmed row to be marked published');
    assert.equal(message.fields.routingKey, routingKey);
    assert.equal(message.properties.type, payload.type);
    assert.equal(message.properties.contentType, 'application/json');
    assert.equal(message.properties.deliveryMode, 2);
    assert.deepEqual(JSON.parse(message.content), payload);
  } finally {
    await stop();
  }
});
