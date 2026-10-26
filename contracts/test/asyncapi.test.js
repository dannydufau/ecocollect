const { test } = require('node:test');
const assert = require('node:assert/strict');
const { asyncapi, validator } = require('./helpers');

const event = () => structuredClone(asyncapi.components.messages.RequestCreated.examples[0].payload);
const note = () => structuredClone(asyncapi.components.messages.SseSignal.examples[0].payload);
const withData = (change) => ({ ...event(), data: { ...event().data, ...change } });

test('the RequestCreated example is a valid event', () => {
  assert.ok(validator(asyncapi, 'RequestCreatedPayload')(event()));
});

test('RequestCreated: no matched volunteers is fine, the list just has to be there', () => {
  const valid = validator(asyncapi, 'RequestCreatedPayload');
  assert.ok(valid(withData({ matchedVolunteerUids: [] })));
  const { matchedVolunteerUids, ...rest } = event().data;
  assert.ok(!valid({ ...event(), data: rest }));
});

test('RequestCreated: a street address can not travel in the event', () => {
  const valid = validator(asyncapi, 'RequestCreatedPayload');
  for (const leak of ['street', 'address', 'pickupStreet', 'city', 'residentName']) {
    assert.ok(!valid(withData({ [leak]: '1 Secret St' })), `${leak} must be rejected`);
  }
});

test('RequestCreated: the envelope has to be right', () => {
  const valid = validator(asyncapi, 'RequestCreatedPayload');
  const bad = {
    'wrong type': { ...event(), type: 'RequestCancelled' },
    'wrong version': { ...event(), version: 2 },
    'event id not a uuid': { ...event(), eventId: 'abc' },
    'no event id': { ...event(), eventId: undefined },
    'time with offset': { ...event(), occurredAt: '2026-10-28T10:15:00-06:00' },
    'no data': { ...event(), data: undefined },
  };
  for (const [name, value] of Object.entries(bad)) assert.ok(!valid(value), `should reject: ${name}`);
});

test('RequestCreated: the data has to be right', () => {
  const valid = validator(asyncapi, 'RequestCreatedPayload');
  const bad = {
    'zero quantity': withData({ quantity: 0 }),
    'bad postal code': withData({ postalCode: 'T2P' }),
    'no windows': withData({ windows: [] }),
    'four windows': withData({ windows: Array.from({ length: 4 }, (_, i) => ({ date: `2026-11-0${i + 1}`, startHour: 9 })) }),
    'window hour 24': withData({ windows: [{ date: '2026-10-30', startHour: 24 }] }),
    'expiry with offset': withData({ expiresAt: '2026-11-27T09:15:00-07:00' }),
    'request id not a uuid': withData({ requestId: 'r_123' }),
    'volunteers as text': withData({ matchedVolunteerUids: 'firebaseUid_v1' }),
    'no resident': withData({ residentUid: undefined }),
  };
  for (const [name, value] of Object.entries(bad)) assert.ok(!valid(value), `should reject: ${name}`);
});

test('the SSE example is a valid signal, for both types', () => {
  const valid = validator(asyncapi, 'SseSignalPayload');
  assert.ok(valid(note()));
  assert.ok(valid({ ...note(), type: 'REQUEST_CREATED' }));
});

test('SSE signal: only a type and a request id, nothing stored and nothing private', () => {
  const valid = validator(asyncapi, 'SseSignalPayload');
  assert.ok(!valid({ ...note(), type: 'REQUEST_ACCEPTED' }), 'a type from after Oct 28');
  assert.ok(!valid({ ...note(), type: undefined }));
  assert.ok(!valid({ ...note(), requestId: undefined }));
  assert.ok(!valid({ ...note(), requestId: 'r_123' }), 'ids are uuids in the database');
  // No database in the notification service, so no stored notification fields either.
  for (const extra of ['notificationId', 'title', 'body', 'createdAt', 'street', 'address', 'residentUid']) {
    assert.ok(!valid({ ...note(), [extra]: 'x' }), `${extra} must be rejected`);
  }
});

test('the RabbitMQ setup matches the README', () => {
  const exchange = asyncapi.channels.requestCreated.bindings.amqp.exchange;
  assert.equal(asyncapi.channels.requestCreated.address, 'request.created');
  assert.deepEqual(
    [exchange.name, exchange.type, exchange.durable],
    ['ecocollect.events', 'topic', true],
  );
  const queue = asyncapi.channels.requestEventsQueue.bindings.amqp.queue;
  assert.deepEqual([queue.name, queue.durable], ['notification.request-events', true]);
  assert.equal(asyncapi.operations.publishRequestCreated.bindings.amqp.deliveryMode, 2, 'persistent');
  assert.equal(asyncapi.operations.receiveRequestCreated.bindings.amqp.ack, true, 'manual ack');
});

test('the publisher sends, the notification service receives, and nobody listens to themselves', () => {
  const ops = asyncapi.operations;
  assert.equal(ops.publishRequestCreated.action, 'send');
  assert.equal(ops.receiveRequestCreated.action, 'receive');
  assert.equal(ops.pushSignal.action, 'send');
});

test('every operation points at a channel and a message that exist', () => {
  for (const [name, op] of Object.entries(asyncapi.operations)) {
    const channel = asyncapi.channels[op.channel.$ref.split('/').pop()];
    assert.ok(channel, `${name}: channel is missing`);
    for (const m of op.messages) {
      const key = m.$ref.split('/').pop();
      assert.ok(channel.messages[key], `${name}: message ${key} is not on its channel`);
    }
  }
});

test('the message examples are all there', () => {
  for (const [name, message] of Object.entries(asyncapi.components.messages)) {
    assert.ok(message.examples?.length, `${name} has no example`);
  }
});
