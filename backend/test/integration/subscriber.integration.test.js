'use strict';

/*
 * The real subscriber against a real RabbitMQ.
 * Run with `npm run test:integration` (from backend/); skipped without RABBITMQ_URL.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const amqp = require('amqplib');

const { startSubscriber } = require('../../src/messaging/subscriber');
const { exchange, events } = require('../../src/messaging/topology');

const URL_AMQP = process.env.RABBITMQ_URL;
const skip = URL_AMQP ? false : 'RABBITMQ_URL not set';

/* --- helpers --- */

/* Messages arrive asynchronously: poll until the condition holds, or time out. */
async function waitFor(condition, what, ms = 10000) {
  const deadline = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/* Stores log lines, so a test can wait for "consuming". */
function recordingLog() {
  const lines = [];
  const rec = (level) => (...args) => lines.push(`${level} ${args.join(' ')}`);
  return { lines, info: rec('info'), warn: rec('warn'), error: rec('error'), debug: rec('debug') };
}

/* Test queues are durable and outlive the test; after() deletes them. */
const testQueues = new Set();

/* Returns once consuming. Pass `queue` to restart on the same queue. */
async function startTestSubscriber(handlers, queue) {
  queue = queue || { name: `it-subscriber-${randomUUID()}.events`, bindings: ['request.#'] };
  testQueues.add(queue.name);
  const log = recordingLog();
  const sub = startSubscriber({ queue, url: URL_AMQP, handlers, log, retryMs: 300 });
  await waitFor(() => log.lines.some((l) => l.includes('consuming')), `${queue.name} to start consuming`);
  return { sub, queue };
}

let pubConn;
let pubCh;

/* Publishes like the outbox relay and waits for the broker's confirm. */
async function publish(type, data) {
  const envelope = {
    type,
    version: 1,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    data,
  };
  pubCh.publish(exchange.name, events[type].routingKey, Buffer.from(JSON.stringify(envelope)), {
    contentType: 'application/json',
  });
  await pubCh.waitForConfirms();
}

/* Publishes raw bytes, e.g. a broken message. */
async function publishRaw(routingKey, text) {
  pubCh.publish(exchange.name, routingKey, Buffer.from(text), { contentType: 'application/json' });
  await pubCh.waitForConfirms();
}

/* Waits for a message in a queue and takes it. */
async function getOne(queueName) {
  let msg = false;
  await waitFor(async () => {
    msg = await pubCh.get(queueName, { noAck: true });
    return msg !== false;
  }, `a message in ${queueName}`);
  return msg;
}

before(async () => {
  if (skip) return;
  pubConn = await amqp.connect(URL_AMQP);
  pubCh = await pubConn.createConfirmChannel(); /* needed for waitForConfirms */
  await pubCh.assertExchange(exchange.name, exchange.type, { durable: exchange.durable });
});

after(async () => {
  if (!pubConn) return;
  for (const name of testQueues) {
    await pubCh.deleteQueue(name).catch(() => {});
    await pubCh.deleteQueue(`${name}.dlq`).catch(() => {});
  }
  await pubConn.close().catch(() => {});
});

/* --- tests --- */

test('receives a RequestCreated published to the exchange', { skip }, async () => {
  const seen = [];
  const { sub } = await startTestSubscriber({ RequestCreated: (env) => { seen.push(env); } });
  try {
    const requestId = randomUUID();
    await publish('RequestCreated', { requestId, residentUid: 'r1', matchedVolunteerUids: ['v1'] });

    await waitFor(() => seen.some((e) => e.data.requestId === requestId), 'the event');
    const env = seen.find((e) => e.data.requestId === requestId);
    assert.equal(env.type, 'RequestCreated');
    assert.deepEqual(env.data.matchedVolunteerUids, ['v1']);
  } finally {
    await sub.stop();
  }
});

/* The queue is durable: events published while the subscriber is down wait for it. */
test('events published while the subscriber is stopped arrive after it restarts', { skip }, async () => {
  const seen = [];
  const handlers = { RequestCreated: (env) => { seen.push(env); } };

  const first = await startTestSubscriber(handlers);
  await first.sub.stop();

  const requestId = randomUUID();
  await publish('RequestCreated', { requestId, residentUid: 'r1', matchedVolunteerUids: [] });

  const second = await startTestSubscriber(handlers, first.queue);
  try {
    await waitFor(() => seen.some((e) => e.data.requestId === requestId), 'the event published while stopped');
  } finally {
    await second.sub.stop();
  }
});

test('a message whose handler keeps failing is retried, then dead-lettered on the 5th failure', { skip }, async () => {
  let calls = 0;
  const { sub, queue } = await startTestSubscriber({
    RequestCreated: () => { calls += 1; throw new Error('handler always fails'); },
  });
  try {
    const requestId = randomUUID();
    await publish('RequestCreated', { requestId, residentUid: 'r1', matchedVolunteerUids: [] });

    const dead = await getOne(`${queue.name}.dlq`);
    assert.equal(JSON.parse(dead.content.toString()).data.requestId, requestId);
    assert.equal(calls, 5); /* 1 delivery + 4 redeliveries (x-delivery-limit = 4) */
    assert.equal(dead.properties.headers['x-first-death-reason'], 'delivery_limit');
  } finally {
    await sub.stop();
  }
});

test('an unparseable message goes straight to the DLQ, without retries', { skip }, async () => {
  let calls = 0;
  const { sub, queue } = await startTestSubscriber({ RequestCreated: () => { calls += 1; } });
  try {
    await publishRaw('request.created', '{not json');

    const dead = await getOne(`${queue.name}.dlq`);
    assert.equal(dead.content.toString(), '{not json');
    assert.equal(dead.properties.headers['x-first-death-reason'], 'rejected');
    assert.equal(calls, 0);
  } finally {
    await sub.stop();
  }
});
