'use strict';

// Integration tests: the real subscriber against a real RabbitMQ.
// Scripted versions of the manual smoke tests.
//
// Run with:  npm run test:integration   (from backend/)
// The script starts the broker and sets RABBITMQ_URL. Without RABBITMQ_URL
// the tests are skipped rather than failing with connection errors.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const amqp = require('amqplib'); // the real library: no fakes in these tests

const { startSubscriber } = require('../../src/messaging/subscriber');
const { exchange, events } = require('../../src/messaging/topology');

const URL_AMQP = process.env.RABBITMQ_URL;

// false = run the tests; a string = skip them, and node:test prints the reason.
const skip = URL_AMQP ? false : 'RABBITMQ_URL not set';

const URL_MGMT = process.env.RABBITMQ_MGMT_URL;

// The reconnect test also needs the management API; skip just that one
// without it.
const skipMgmt = skip || (URL_MGMT ? false : 'RABBITMQ_MGMT_URL not set');

// --- helpers ----------------------------------------------------------------

// Messaging is asynchronous: after publishing, the event arrives "soon", not
// immediately. Poll a condition every 50 ms until it holds, or fail after `ms`
// with a message saying what never happened.
async function waitFor(condition, what, ms = 10000) {
  const deadline = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

// A logger that stores lines instead of printing them, so a test can wait
// for what the subscriber reports (e.g. "consuming ... on amq.gen-...").
function recordingLog() {
  const lines = [];
  const rec = (level) => (...args) => lines.push(`${level} ${args.join(' ')}`);
  return { lines, info: rec('info'), warn: rec('warn'), error: rec('error'), debug: rec('debug') };
}

// How many times the subscriber has finished setup (once per connect).
const consumingCount = (log) => log.lines.filter((l) => l.includes('consuming')).length;

// Start the real subscriber with test-friendly settings and return once its
// queue is bound. Publishing before that would be dropped by the exchange as
// unroutable, and the test would fail for the wrong reason.
async function startTestSubscriber(handlers) {
  // Unique label on the AMQP connection; a later test uses it to find and
  // drop this exact connection through the management API.
  const name = `it-subscriber-${randomUUID()}`;
  const log = recordingLog();
  const sub = startSubscriber({
    url: URL_AMQP,
    handlers,
    log,
    retryMs: 300, // reconnect quickly so tests stay fast
    connect: (url) => amqp.connect(url, { clientProperties: { connection_name: name } }),
  });
  await waitFor(() => consumingCount(log) >= 1, `${name} to start consuming`);
  return { sub, log, name };
}

// One publisher connection shared by all tests, opened in before().
let pubConn;
let pubCh;

// Plays the role of the outbox relay: build a full envelope and publish it
// with the routing key from topology.events.
async function publish(type, data) {
  // Event types topology doesn't list yet (e.g. RequestAccepted) get a
  // made-up key that still matches the subscriber's request.* binding.
  const routingKey = events[type] ? events[type].routingKey : `request.${type.toLowerCase()}`;
  const envelope = {
    type,
    version: 1,
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    data,
  };
  pubCh.publish(exchange.name, routingKey, Buffer.from(JSON.stringify(envelope)), {
    contentType: 'application/json',
  });
  // Wait for the broker to confirm it accepted the message, like the relay does.
  await pubCh.waitForConfirms();
}

// Call the management HTTP API. Node's fetch refuses URLs with credentials
// in them (http://user:pass@host), so move them into a Basic auth header.
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

// Simulate the broker dropping our subscriber: find its connection by the
// name startTestSubscriber gave it, then force-close it.
async function closeConnectionByName(clientName) {
  let target;
  // The management API can take a moment to list a new connection, so poll.
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

  // The broker's internal name looks like "172.18.0.1:54321 -> 172.18.0.2:5672";
  // encode it for the URL path.
  const res = await mgmt(`/api/connections/${encodeURIComponent(target.name)}`, {
    method: 'DELETE',
    headers: { 'x-reason': 'integration test: simulated broker drop' },
  });
  if (!res.ok && res.status !== 204) throw new Error(`DELETE connection: ${res.status}`);
}

// Runs once before all tests: open the publisher on a confirm channel (needed
// for waitForConfirms) and make sure the exchange exists.
before(async () => {
  if (skip) return;
  pubConn = await amqp.connect(URL_AMQP);
  pubCh = await pubConn.createConfirmChannel();
  await pubCh.assertExchange(exchange.name, exchange.type, { durable: exchange.durable });
});

// Runs once after all tests: close the publisher so Node can exit.
after(async () => {
  if (pubConn) await pubConn.close().catch(() => {});
});

// --- tests ------------------------------------------------------------------

// Manual check 1: an event published to the exchange reaches the handler
// with its contents intact.
test('receives a RequestCreated published to the exchange', { skip }, async () => {
  const seen = []; // everything the handler receives
  const { sub } = await startTestSubscriber({ RequestCreated: (env) => { seen.push(env); } });
  try {
    // Fresh id per run, so a leftover message from an earlier run can't count.
    const requestId = randomUUID();
    await publish('RequestCreated', { requestId, residentUid: 'r1', matchedVolunteerUids: ['v1'] });

    await waitFor(() => seen.some((e) => e.data.requestId === requestId), 'the event');
    const env = seen.find((e) => e.data.requestId === requestId);
    assert.equal(env.type, 'RequestCreated');
    assert.deepEqual(env.data.matchedVolunteerUids, ['v1']);
  } finally {
    // Always stop, even if an assertion failed, so no connection is left open.
    await sub.stop();
  }
});

// Manual check 2: every running instance has its own queue, so one publish
// reaches all of them. This is what lets whichever instance holds a user's
// SSE connection hear about their events.
test('every running instance receives every event (fan-out)', { skip }, async () => {
  const seenA = [];
  const seenB = [];
  // Two subscribers = two connections = two exclusive amq.gen-... queues,
  // just like running try-subscriber.js in two terminals.
  const a = await startTestSubscriber({ RequestCreated: (env) => { seenA.push(env); } });
  const b = await startTestSubscriber({ RequestCreated: (env) => { seenB.push(env); } });
  try {
    const requestId = randomUUID();
    await publish('RequestCreated', { requestId, residentUid: 'r1', matchedVolunteerUids: [] });

    // Published once, received twice.
    await waitFor(
      () => seenA.some((e) => e.data.requestId === requestId)
        && seenB.some((e) => e.data.requestId === requestId),
      'both instances to receive the event',
    );
  } finally {
    await a.sub.stop();
    await b.sub.stop();
  }
});

// Manual check 3: an event type with no registered handler is acked and
// skipped, and doesn't block events that come after it.
test('events without a handler are skipped, later events still arrive', { skip }, async () => {
  const seen = [];
  // Only RequestCreated has a handler; RequestAccepted will match the
  // request.* binding but find nothing to dispatch to.
  const { sub, log } = await startTestSubscriber({ RequestCreated: (env) => { seen.push(env); } });
  try {
    const acceptedId = randomUUID();
    const createdId = randomUUID();
    await publish('RequestAccepted', { requestId: acceptedId });
    await publish('RequestCreated', { requestId: createdId, residentUid: 'r1', matchedVolunteerUids: [] });

    // A queue delivers in order, so once the second event has arrived, the
    // first has already been dealt with. No sleep needed to prove "nothing
    // happened".
    await waitFor(() => seen.some((e) => e.data.requestId === createdId), 'the RequestCreated');

    // The unknown event never reached a handler...
    assert.equal(seen.some((e) => e.data.requestId === acceptedId), false);
    // ...and it took the deliberate skip path, not some error path.
    assert.ok(log.lines.some((l) => l.includes('no handler for RequestAccepted')));
  } finally {
    await sub.stop();
  }
});

// Manual check 4: when the broker drops the connection, the subscriber
// notices, reconnects, rebuilds its queue, and keeps receiving.
test('reconnects and keeps receiving after the broker drops the connection', { skip: skipMgmt }, async () => {
  const seen = [];
  const { sub, log, name } = await startTestSubscriber({
    RequestCreated: (env) => { seen.push(env); },
  });
  try {
    await closeConnectionByName(name);

    // Our own reconnect path must kick in. If amqplib's built-in recovery
    // handled the drop instead, this line never appears and the test fails
    // here. That's the overlap we wanted to find out about.
    await waitFor(() => log.lines.some((l) => l.includes('connection closed')), 'the close to be noticed');

    // Second "consuming" line = setup ran again on a fresh connection,
    // with a new exclusive queue (the old one died with the old connection).
    await waitFor(() => consumingCount(log) >= 2, 'the subscriber to consume again');

    // And events flow again on the new queue.
    const requestId = randomUUID();
    await publish('RequestCreated', { requestId, residentUid: 'r1', matchedVolunteerUids: [] });
    await waitFor(() => seen.some((e) => e.data.requestId === requestId), 'the event after reconnect');
  } finally {
    await sub.stop();
  }
});