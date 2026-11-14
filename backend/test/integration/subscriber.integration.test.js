'use strict';

// Integration tests: the real subscriber against a real RabbitMQ.
//
// Run with:  npm run test:integration   (from backend/)
// Skipped without RABBITMQ_URL.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const amqp = require('amqplib');

const { startSubscriber } = require('../../src/messaging/subscriber');
const { exchange, events } = require('../../src/messaging/topology');

const URL_AMQP = process.env.RABBITMQ_URL;
const URL_MGMT = process.env.RABBITMQ_MGMT_URL;

// false = run; a string = skip, and node:test prints the reason.
const skip = URL_AMQP ? false : 'RABBITMQ_URL not set';
const skipMgmt = skip || (URL_MGMT ? false : 'RABBITMQ_MGMT_URL not set');

// --- helpers ----------------------------------------------------------------

// Poll until the condition holds, or fail after `ms` saying what never happened.
async function waitFor(condition, what, ms = 10000) {
  const deadline = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

// A logger that stores lines, so a test can wait for what the subscriber reports.
function recordingLog() {
  const lines = [];
  const rec = (level) => (...args) => lines.push(`${level} ${args.join(' ')}`);
  return { lines, info: rec('info'), warn: rec('warn'), error: rec('error'), debug: rec('debug') };
}

// How many times the subscriber has finished setup (once per connect).
const consumingCount = (log) => log.lines.filter((l) => l.includes('consuming')).length;

// Test queues are durable, so they outlive the test; after() deletes them.
const testQueues = new Set();

// Start the real subscriber and return once it's consuming. Each subscriber
// gets its own queue unless one is passed in (to restart on the same queue).
// The connection and queue share a unique name, so they're easy to match in
// the management UI; the reconnect test finds the connection by it.
async function startTestSubscriber(handlers, queue) {
  const name = `it-subscriber-${randomUUID()}`;
  queue = queue || { name: `${name}.events`, bindings: ['request.#'] };
  testQueues.add(queue.name);
  const log = recordingLog();
  const sub = startSubscriber({
    queue,
    url: URL_AMQP,
    handlers,
    log,
    retryMs: 300,
    connect: (url) => amqp.connect(url, { clientProperties: { connection_name: name } }),
  });
  await waitFor(() => consumingCount(log) >= 1, `${name} to start consuming`);
  return { sub, log, name, queue };
}

let pubConn;
let pubCh;

// Plays the outbox relay: publish a full envelope and wait for the broker's confirm.
async function publish(type, data) {
  // Types not in topology get a made-up key that still matches request.#.
  const routingKey = events[type] ? events[type].routingKey : `request.${type.toLowerCase()}`;
  const envelope = {
    type,
    version: 1,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    data,
  };
  pubCh.publish(exchange.name, routingKey, Buffer.from(JSON.stringify(envelope)), {
    contentType: 'application/json',
  });
  await pubCh.waitForConfirms();
}

// Publish raw bytes (not an envelope), e.g. to test what happens to a broken message.
async function publishRaw(routingKey, text) {
  pubCh.publish(exchange.name, routingKey, Buffer.from(text), { contentType: 'application/json' });
  await pubCh.waitForConfirms();
}

// Wait for a message to show up in a queue and return it (acked, so it's removed).
async function getOne(queueName) {
  let msg = false;
  await waitFor(async () => {
    msg = await pubCh.get(queueName, { noAck: true });
    return msg !== false;
  }, `a message in ${queueName}`);
  return msg;
}

// Management HTTP API. Node's fetch refuses credentials in the URL, so use Basic auth.
function mgmt(path, init = {}) {
  const base = new URL(URL_MGMT);
  const auth = Buffer.from(
    `${decodeURIComponent(base.username)}:${decodeURIComponent(base.password)}`,
  ).toString('base64');
  base.username = '';
  base.password = '';
  return fetch(new URL(path, base), {
    ...init,
    headers: { authorization: `Basic ${auth}`, ...(init.headers || {}) },
  });
}

// Simulate the broker dropping a subscriber: find its connection by name, force-close it.
async function closeConnectionByName(clientName) {
  let target;
  await waitFor(async () => {
    const res = await mgmt('/api/connections');
    if (!res.ok) throw new Error(`GET /api/connections: ${res.status}`);
    const conns = await res.json();
    target = conns.find(
      (c) => c.user_provided_name === clientName
        || (c.client_properties && c.client_properties.connection_name === clientName),
    );
    return Boolean(target);
  }, `management API to list ${clientName}`);

  const res = await mgmt(`/api/connections/${encodeURIComponent(target.name)}`, {
    method: 'DELETE',
    headers: { 'x-reason': 'integration test: simulated broker drop' },
  });
  if (!res.ok && res.status !== 204) throw new Error(`DELETE connection: ${res.status}`);
}

before(async () => {
  if (skip) return;
  pubConn = await amqp.connect(URL_AMQP);
  pubCh = await pubConn.createConfirmChannel(); // needed for waitForConfirms
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

// --- tests ------------------------------------------------------------------

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

// Replaces the Oct 28 fan-out test: the queue is now durable and shared, so
// events published while the subscriber is down wait for it instead of being dropped.
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

test('events without a handler are skipped, later events still arrive', { skip }, async () => {
  const seen = [];
  const { sub, log } = await startTestSubscriber({ RequestCreated: (env) => { seen.push(env); } });
  try {
    const acceptedId = randomUUID();
    const createdId = randomUUID();
    await publish('RequestAccepted', { requestId: acceptedId }); // matches request.#, no handler
    await publish('RequestCreated', { requestId: createdId, residentUid: 'r1', matchedVolunteerUids: [] });

    // Delivery is in order: once the second arrives, the first was dealt with.
    await waitFor(() => seen.some((e) => e.data.requestId === createdId), 'the RequestCreated');

    assert.equal(seen.some((e) => e.data.requestId === acceptedId), false);
    assert.ok(log.lines.some((l) => l.includes('no handler for RequestAccepted')));
  } finally {
    await sub.stop();
  }
});

test('reconnects and keeps receiving after the broker drops the connection', { skip: skipMgmt }, async () => {
  const seen = [];
  const { sub, log, name } = await startTestSubscriber({
    RequestCreated: (env) => { seen.push(env); },
  });
  try {
    await closeConnectionByName(name);

    // Our own reconnect path must kick in (not amqplib's built-in recovery).
    await waitFor(() => log.lines.some((l) => l.includes('connection closed')), 'the close to be noticed');

    // Second "consuming" line = setup ran again on a fresh connection, same queue.
    await waitFor(() => consumingCount(log) >= 2, 'the subscriber to consume again');

    const requestId = randomUUID();
    await publish('RequestCreated', { requestId, residentUid: 'r1', matchedVolunteerUids: [] });
    await waitFor(() => seen.some((e) => e.data.requestId === requestId), 'the event after reconnect');
  } finally {
    await sub.stop();
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
    assert.equal(calls, 5); // 1 delivery + 4 redeliveries (x-delivery-limit = 4)
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