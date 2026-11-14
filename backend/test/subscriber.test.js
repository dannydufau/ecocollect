'use strict';

// Unit tests for the subscriber's connection lifecycle, using a fake
// connect() so no broker is needed:  node --test

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { startSubscriber } = require('../src/messaging/subscriber');
const { queues } = require('../src/messaging/topology');

// --- fakes ------------------------------------------------------------------

function fakeChannel() {
  const ch = new EventEmitter();
  ch.calls = [];
  const record = (name, result) => (...args) => {
    ch.calls.push([name, ...args]);
    return Promise.resolve(result);
  };
  ch.assertExchange = record('assertExchange', {});
  ch.assertQueue = record('assertQueue', { queue: 'amq.gen-test' });
  ch.bindQueue = record('bindQueue', {});
  ch.prefetch = record('prefetch', {});
  ch.consume = (queue, onMessage, opts) => {
    ch.calls.push(['consume', queue, opts]);
    ch.deliver = onMessage; // lets later tests push messages in
    return Promise.resolve({ consumerTag: 'ctag-test' });
  };
  ch.ack = (msg) => ch.calls.push(['ack', msg]);
  ch.reject = (msg, requeue) => ch.calls.push(['reject', msg, requeue]);
  return ch;
}

function fakeConnection() {
  const conn = new EventEmitter();
  conn.channel = fakeChannel();
  conn.closed = false;
  conn.createChannel = () => Promise.resolve(conn.channel);
  conn.close = () => {
    if (conn.closed) return Promise.resolve();
    conn.closed = true;
    conn.emit('close');
    return Promise.resolve();
  };
  return conn;
}

// connect() stand-in: hands out a new fake connection per call, or fails
// while `failNext` is above zero.
function fakeConnector() {
  const connector = {
    calls: 0,
    failNext: 0,
    connections: [],
    connect: async () => {
      connector.calls += 1;
      if (connector.failNext > 0) {
        connector.failNext -= 1;
        throw new Error('ECONNREFUSED');
      }
      const conn = fakeConnection();
      connector.connections.push(conn);
      return conn;
    },
  };
  return connector;
}

const quietLog = { info() {}, warn() {}, error() {}, debug() {} };

async function waitFor(condition, ms = 500) {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 2));
  }
}

function start(connector, extra = {}) {
  return startSubscriber({
    queue: queues.notification,
    url: 'amqp://test',
    connect: connector.connect,
    log: quietLog,
    retryMs: 10,
    ...extra,
  });
}

const consumed = (conn) => conn.channel.calls.some(([name]) => name === 'consume');

// --- tests ------------------------------------------------------------------

test('declares its queue, then sets prefetch and consumes from it', async () => {
  const connector = fakeConnector();
  const sub = start(connector);
  await waitFor(() => connector.connections[0] && consumed(connector.connections[0]));

  const calls = connector.connections[0].channel.calls;
  const find = (name) => calls.find(([n]) => n === name);

  // declare.js has its own tests; here: it ran for our queue, before prefetch and consume.
  assert.ok(calls.some(([n, name]) => n === 'assertQueue' && name === 'notification.events'));
  assert.deepEqual(find('prefetch'), ['prefetch', 1]);
  assert.deepEqual(find('consume'), ['consume', 'notification.events', { noAck: false }]);

  const order = calls.map(([n]) => n);
  assert.ok(order.lastIndexOf('bindQueue') < order.indexOf('prefetch'));
  assert.ok(order.indexOf('prefetch') < order.indexOf('consume'));

  await sub.stop();
});

test('requires a queue', () => {
  assert.throws(() => startSubscriber({ url: 'amqp://test' }), /queue is required/);
});

test('reconnects and rebuilds the queue after the connection closes', async () => {
  const connector = fakeConnector();
  const sub = start(connector);
  await waitFor(() => connector.connections[0] && consumed(connector.connections[0]));

  connector.connections[0].close(); // simulate the broker dropping us

  await waitFor(() => connector.connections[1] && consumed(connector.connections[1]));
  assert.equal(connector.calls, 2);

  await sub.stop();
});

test('a channel close escalates to a connection close and one reconnect', async () => {
  const connector = fakeConnector();
  const sub = start(connector);
  await waitFor(() => connector.connections[0] && consumed(connector.connections[0]));

  connector.connections[0].channel.emit('close');

  await waitFor(() => connector.connections[1] && consumed(connector.connections[1]));
  assert.equal(connector.connections[0].closed, true);
  // channel close + connection close both ask for a reconnect; the timer
  // guard means only one new connection is made.
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(connector.calls, 2);

  await sub.stop();
});

test('retries when the broker is down at startup', async () => {
  const connector = fakeConnector();
  connector.failNext = 2;
  const sub = start(connector);

  await waitFor(() => connector.connections[0] && consumed(connector.connections[0]));
  assert.equal(connector.calls, 3); // two failures, then success

  await sub.stop();
});

test('stop() closes the connection and prevents reconnects', async () => {
  const connector = fakeConnector();
  const sub = start(connector);
  await waitFor(() => connector.connections[0] && consumed(connector.connections[0]));

  await sub.stop();
  assert.equal(connector.connections[0].closed, true);

  await new Promise((r) => setTimeout(r, 40));
  assert.equal(connector.calls, 1);
});

test('requires a URL', () => {
  assert.throws(() => startSubscriber({ url: '', log: quietLog }), /RABBITMQ_URL/);
});

// --- handler validation (startup) -----------------------------------------

test('rejects a handler for an event not in topology.events', () => {
  assert.throws(
    () => startSubscriber({
      queue: queues.notification,
      url: 'amqp://test',
      log: quietLog,
      handlers: { RequestCreatd: () => {} }, // typo
    }),
    /No event 'RequestCreatd' in topology\.events/,
  );
});

test('rejects a handler that is not a function', () => {
  assert.throws(
    () => startSubscriber({
      queue: queues.notification,
      url: 'amqp://test',
      log: quietLog,
      handlers: { RequestCreated: 'oops' },
    }),
    /Handler for 'RequestCreated' must be a function/,
  );
});

// --- dispatch ---------------------------------------------------------------

function message(body, routingKey = 'request.created', headers = {}) {
  const content = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return { content, fields: { routingKey, deliveryTag: 1 }, properties: { headers } };
}

async function startedWith(handlers, extra = {}) {
  const connector = fakeConnector();
  const sub = start(connector, { handlers, ...extra });
  await waitFor(() => connector.connections[0] && consumed(connector.connections[0]));
  return { sub, ch: connector.connections[0].channel };
}

const settled = (ch, msg) =>
  ch.calls.find(([name, m]) => (name === 'ack' || name === 'reject') && m === msg);

test('dispatches by envelope.type and acks when the handler returns', async () => {
  const seen = [];
  const { sub, ch } = await startedWith({ RequestCreated: (env) => { seen.push(env); } });

  const msg = message({ type: 'RequestCreated', data: { requestId: 'r-1' } });
  ch.deliver(msg);
  await waitFor(() => settled(ch, msg));

  assert.equal(seen.length, 1);
  assert.equal(seen[0].data.requestId, 'r-1');
  assert.deepEqual(settled(ch, msg), ['ack', msg]);
  await sub.stop();
});

test('rejects with requeue when the handler throws, so RabbitMQ retries it', async () => {
  const { sub, ch } = await startedWith({
    RequestCreated: () => { throw new Error('boom'); },
  });

  const msg = message({ type: 'RequestCreated', data: {} });
  ch.deliver(msg);
  await waitFor(() => settled(ch, msg));

  assert.deepEqual(settled(ch, msg), ['reject', msg, true]);
  await sub.stop();
});

test('logs a retry as a warning, and the 5th failure as an error', async () => {
  const lines = { warn: [], error: [] };
  const log = { ...quietLog, warn: (l) => lines.warn.push(l), error: (l) => lines.error.push(l) };
  const { sub, ch } = await startedWith({ RequestCreated: () => { throw new Error('boom'); } }, { log });

  const first = message({ type: 'RequestCreated', eventId: 'e-1', data: {} });
  const fifth = message({ type: 'RequestCreated', eventId: 'e-5', data: {} }, 'request.created', { 'x-delivery-count': 4 });
  ch.deliver(first);
  ch.deliver(fifth);
  await waitFor(() => settled(ch, first) && settled(ch, fifth));

  assert.ok(lines.warn.some((l) => l.includes('will retry') && l.includes('eventId=e-1') && l.includes('x-delivery-count=0')));
  assert.ok(lines.error.some((l) => l.includes('dead-lettering') && l.includes('eventId=e-5') && l.includes('x-delivery-count=4')));
  await sub.stop();
});

test('dead-letters unparseable JSON and messages without an event type', async () => {
  const { sub, ch } = await startedWith({ RequestCreated: () => {} });

  const bad = ['{not json', '42', 'null', '{}', { type: '' }].map((body) => message(body));
  bad.forEach((msg) => ch.deliver(msg));
  await waitFor(() => bad.every((msg) => settled(ch, msg)));

  for (const msg of bad) assert.deepEqual(settled(ch, msg), ['reject', msg, false]);
  await sub.stop();
});

test('acks and skips a valid event with no handler', async () => {
  const { sub, ch } = await startedWith({ RequestCreated: () => {} });

  const unknown = message({ type: 'RequestUpdated', data: {} }, 'request.updated');
  ch.deliver(unknown);
  await waitFor(() => settled(ch, unknown));

  assert.deepEqual(settled(ch, unknown), ['ack', unknown]);
  await sub.stop();
});

test('a type naming an Object.prototype method is skipped, not called', async () => {
  const debug = [];
  const log = { ...quietLog, debug: (line) => debug.push(line) };
  const { sub, ch } = await startedWith({ RequestCreated: () => {} }, { log });

  // With a plain-object lookup, handlers['constructor'] finds Object() and
  // "handles" the message. It must take the no-handler path instead.
  const msg = message({ type: 'constructor', data: {} });
  ch.deliver(msg);
  await waitFor(() => settled(ch, msg));

  assert.equal(settled(ch, msg)[0], 'ack');
  assert.ok(debug.some((line) => line.includes('no handler for constructor')));
  await sub.stop();
});