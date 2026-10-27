'use strict';

// Unit tests for the subscriber's connection lifecycle, using a fake
// connect() so no broker is needed:  node --test

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { startSubscriber, BINDING_KEY } = require('../src/messaging/subscriber');
const { exchange } = require('../src/messaging/topology');

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
  ch.nack = (msg, allUpTo, requeue) => ch.calls.push(['nack', msg, allUpTo, requeue]);
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
    url: 'amqp://test',
    connect: connector.connect,
    log: quietLog,
    retryMs: 10,
    ...extra,
  });
}

const consumed = (conn) => conn.channel.calls.some(([name]) => name === 'consume');

// --- tests ------------------------------------------------------------------

test('sets up a private queue bound to request.* and starts consuming', async () => {
  const connector = fakeConnector();
  const sub = start(connector, { prefetch: 7 });
  await waitFor(() => connector.connections[0] && consumed(connector.connections[0]));

  const calls = connector.connections[0].channel.calls;
  const find = (name) => calls.find(([n]) => n === name);

  assert.deepEqual(find('assertExchange'), ['assertExchange', exchange.name, exchange.type, {
    durable: exchange.durable,
  }]);
  assert.deepEqual(find('assertQueue'), ['assertQueue', '', {
    exclusive: true, autoDelete: true, durable: false,
  }]);
  assert.deepEqual(find('bindQueue'), ['bindQueue', 'amq.gen-test', exchange.name, BINDING_KEY]);
  assert.deepEqual(find('prefetch'), ['prefetch', 7]);
  assert.deepEqual(find('consume'), ['consume', 'amq.gen-test', { noAck: false }]);

  // Order matters: the exchange must exist before binding, and the binding
  // and prefetch before consuming.
  const order = calls.map(([n]) => n);
  assert.deepEqual(order, ['assertExchange', 'assertQueue', 'bindQueue', 'prefetch', 'consume']);

  await sub.stop();
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