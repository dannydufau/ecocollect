// declareConsumerQueue against a fake channel that records every call.
// No broker: this checks what we ask RabbitMQ for, and in what order.

const test = require('node:test');
const assert = require('node:assert');

const { declareConsumerQueue } = require('../src/messaging/declare');
const topology = require('../src/messaging/topology');

// Records each call as [method, ...args]; every method resolves like amqplib's.
function fakeChannel() {
  const calls = [];
  const record = (method) => async (...args) => {
    calls.push([method, ...args]);
  };
  return {
    calls,
    assertExchange: record('assertExchange'),
    assertQueue: record('assertQueue'),
    bindQueue: record('bindQueue'),
  };
}

const notification = topology.queues.notification;

test('declares both exchanges as topology defines them', async () => {
  const ch = fakeChannel();
  await declareConsumerQueue(ch, notification);

  const exchanges = ch.calls.filter(([method]) => method === 'assertExchange');
  assert.deepStrictEqual(exchanges, [
    ['assertExchange', 'ecocollect.events', 'topic', { durable: true }],
    ['assertExchange', 'ecocollect.dlx', 'direct', { durable: true }],
  ]);
});

test('declares the queue with exactly the contract arguments', async () => {
  const ch = fakeChannel();
  await declareConsumerQueue(ch, notification);

  const queue = ch.calls.find(([method, name]) => method === 'assertQueue' && name === 'notification.events');
  assert.deepStrictEqual(queue, [
    'assertQueue',
    'notification.events',
    { durable: true, arguments: topology.queueArguments('notification.events') },
  ]);
});

test('declares the DLQ and binds it to the DLX with the queue name, before the main queue', async () => {
  const ch = fakeChannel();
  await declareConsumerQueue(ch, notification);

  const at = (method, name) => ch.calls.findIndex(([m, n]) => m === method && n === name);
  assert.deepStrictEqual(
    ch.calls[at('assertQueue', 'notification.events.dlq')],
    ['assertQueue', 'notification.events.dlq', { durable: true, arguments: { 'x-queue-type': 'quorum' } }],
  );
  assert.deepStrictEqual(
    ch.calls[at('bindQueue', 'notification.events.dlq')],
    ['bindQueue', 'notification.events.dlq', 'ecocollect.dlx', 'notification.events'],
  );
  assert.ok(at('bindQueue', 'notification.events.dlq') < at('assertQueue', 'notification.events'));
});

test('binds the queue to ecocollect.events once per binding key', async () => {
  const ch = fakeChannel();
  await declareConsumerQueue(ch, notification);

  const bindings = ch.calls.filter(([method, name]) => method === 'bindQueue' && name === 'notification.events');
  assert.deepStrictEqual(
    bindings,
    notification.bindings.map((key) => ['bindQueue', 'notification.events', 'ecocollect.events', key]),
  );
});

test('rejects a bad queue definition before calling the broker', async () => {
  const bad = [
    { name: '', bindings: ['request.#'] },
    { name: undefined, bindings: ['request.#'] },
    { name: 'notification.events', bindings: [] },
    { name: 'notification.events', bindings: undefined },
  ];
  for (const queueDef of bad) {
    const ch = fakeChannel();
    await assert.rejects(declareConsumerQueue(ch, queueDef), TypeError);
    assert.strictEqual(ch.calls.length, 0);
  }
});
