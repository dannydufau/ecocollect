'use strict';

/*
 * Unit tests for the subscriber, using a fake connect() so no broker is
 * needed:  node --test
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { startSubscriber } = require('../src/messaging/subscriber');
const { queues } = require('../src/messaging/topology');


function fakeChannel() {
  const ch = new EventEmitter();
  ch.calls = [];
  const record = (name) => (...args) => {
    ch.calls.push([name, ...args]);
    return Promise.resolve({});
  };
  ch.assertExchange = record('assertExchange');
  ch.assertQueue = record('assertQueue');
  ch.bindQueue = record('bindQueue');
  ch.prefetch = record('prefetch');
  ch.consume = (queue, onMessage, opts) => {
    ch.calls.push(['consume', queue, opts]);
    ch.deliver = onMessage; // lets tests push messages in
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

// connect() stand-in: hands out a new fake connection per call.
function fakeConnector() {
  const connector = {
    calls: 0,
    connections: [],
    connect: async () => {
      connector.calls += 1;
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

test('reconnects and rebuilds the queue after the connection closes', async () => {
  const connector = fakeConnector();
  const sub = start(connector);
  await waitFor(() => connector.connections[0] && consumed(connector.connections[0]));

  connector.connections[0].close(); // simulate the broker dropping us

  await waitFor(() => connector.connections[1] && consumed(connector.connections[1]));
  assert.equal(connector.calls, 2);

  await sub.stop();
});

function message(body, routingKey = 'request.created') {
  const content = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return { content, fields: { routingKey, deliveryTag: 1 }, properties: { headers: {} } };
}

async function startedWith(handlers) {
  const connector = fakeConnector();
  const sub = start(connector, { handlers });
  await waitFor(() => connector.connections[0] && consumed(connector.connections[0]));
  return { sub, ch: connector.connections[0].channel };
}

// The ack or reject the subscriber sent for this message.
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
