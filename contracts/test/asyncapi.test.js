const { test } = require('node:test');
const assert = require('node:assert/strict');
const { asyncapi, common, validator } = require('./helpers');

const messages = asyncapi.components.messages;
const example = (type) => structuredClone(messages[type].examples[0].payload);
const browserSide = ['userStream', 'publicStream', 'webPush'];
const browserMessages = browserSide.flatMap((c) => Object.values(asyncapi.channels[c].messages).map((m) => m.$ref.split('/').pop()));
const events = Object.keys(messages).filter((m) => !browserMessages.includes(m));
const valid = (type) => validator(asyncapi, `${type}Payload`);

// The event list from the README (10.3): type, routing key, producer, consumers.
const README_EVENTS = [
  ['RequestCreated', 'request.created', 'request-service', ['notification', 'cleanup']],
  ['RequestUpdated', 'request.updated', 'request-service', ['notification', 'cleanup']],
  ['RequestAssigned', 'request.assigned', 'request-service', ['notification', 'cleanup']],
  ['RequestAssignmentCollected', 'request.assignment.collected', 'request-service', ['notification']],
  ['RequestAssignmentDelivered', 'request.assignment.delivered', 'request-service', ['notification', 'reward']],
  ['RequestAssignmentCancelledResident', 'request.assignment.cancelled.resident', 'request-service', ['notification', 'reward']],
  ['RequestAssignmentCancelledVolunteer', 'request.assignment.cancelled.volunteer', 'request-service', ['notification']],
  ['RequestAssignmentMissed', 'request.assignment.missed', 'request-service', ['notification']],
  ['RequestCancelled', 'request.cancelled', 'request-service', ['notification', 'cleanup']],
  ['RequestExpired', 'request.expired', 'request-service', ['notification', 'cleanup']],
  ['PointsAwardedDelivery', 'reward.points.delivery', 'reward-service', ['notification']],
  ['PointsAwardedCancellation', 'reward.points.cancellation', 'reward-service', ['notification']],
  ['CleanupRequest', 'cleanup.request.due', 'cleanup-service', ['request']],
  ['NotificationCleanupRequested', 'cleanup.notifications.due', 'cleanup-service', ['notification']],
  ['ProfileUpdated', 'user.profile.updated', 'user-service', ['notification']],
  ['AccountDeactivated', 'user.account.deactivated', 'user-service', ['notification']],
];
const QUEUES = {
  notification: 'notification.events',
  cleanup: 'cleanup.request-events',
  reward: 'reward.request-events',
  request: 'request.cleanup-events',
};
const queueChannel = (name) => Object.values(asyncapi.channels).find((c) => c.address === name);
const messageNames = (channel) => Object.values(channel.messages).map((m) => m.$ref.split('/').pop()).sort();

test('every event in the README is in the spec, and nothing else', () => {
  assert.deepEqual(events.sort(), README_EVENTS.map(([t]) => t).sort());
});

test('every event example is valid, with the right type, producer and version', () => {
  for (const [type, , producer] of README_EVENTS) {
    const e = example(type);
    assert.ok(valid(type)(e), `${type} example is invalid: ${JSON.stringify(valid(type).errors)}`);
    assert.equal(e.type, type);
    assert.equal(e.producer, producer, `${type} producer`);
    assert.equal(e.version, type === 'RequestCreated' ? 2 : 1, `${type} version`);
  }
});

test('each event is published on its routing key to ecocollect.events, persistent, by its producer', () => {
  for (const [type, key] of README_EVENTS) {
    const op = asyncapi.operations[`publish${type}`];
    assert.ok(op, `no publish operation for ${type}`);
    assert.equal(op.action, 'send');
    assert.equal(op.bindings.amqp.deliveryMode, 2, `${type} must be persistent`);
    const channel = asyncapi.channels[op.channel.$ref.split('/').pop()];
    assert.equal(channel.address, key, `${type} routing key`);
    assert.deepEqual(
      [channel.bindings.amqp.exchange.name, channel.bindings.amqp.exchange.type, channel.bindings.amqp.exchange.durable],
      ['ecocollect.events', 'topic', true],
    );
  }
});

test('each consumer queue receives exactly the events the README gives it', () => {
  for (const [consumer, queue] of Object.entries(QUEUES)) {
    const channel = queueChannel(queue);
    assert.ok(channel, `queue ${queue} is missing`);
    const expected = README_EVENTS.filter(([, , , c]) => c.includes(consumer)).map(([t]) => t).sort();
    assert.deepEqual(messageNames(channel), expected, `${queue}`);
  }
});

test('every queue is a durable quorum queue that dead-letters on the 5th failure', () => {
  for (const queue of Object.values(QUEUES)) {
    const channel = queueChannel(queue);
    assert.deepEqual(channel['x-queue-arguments'], {
      'x-queue-type': 'quorum',
      'x-delivery-limit': 4,
      'x-dead-letter-exchange': 'ecocollect.dlx',
      'x-dead-letter-routing-key': queue,
    }, queue);
    assert.equal(channel['x-dead-letter-queue'], `${queue}.dlq`);
    const q = channel.bindings.amqp.queue;
    assert.deepEqual([q.name, q.durable, q.exclusive, q.autoDelete], [queue, true, false, false], queue);
  }
});

test('no street address, notes or photo can travel in an event, SSE message or push (NFR03)', () => {
  const schemas = asyncapi.components.schemas;
  const browserPayloads = browserMessages.map((m) => messages[m].payload.$ref.split('/').pop());
  for (const name of ['RequestSnapshot', ...README_EVENTS.map(([t]) => `${t}Data`), ...browserPayloads]) {
    const props = schemas[name].properties ?? Object.assign({}, ...(schemas[name].oneOf ?? []).map((o) => o.properties));
    for (const key of Object.keys(props)) {
      assert.doesNotMatch(key, /street|^address$|city|notes|photo|email/i, `${name}.${key}`);
    }
  }
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

test('the user stream sends exactly the README messages (13.3), starting with ready', () => {
  const names = Object.values(asyncapi.channels.userStream.messages).map((m) => messages[m.$ref.split('/').pop()].name);
  assert.deepEqual(names.sort(), ['account-deactivated', 'available-requests-changed', 'notification',
    'notification-expired', 'notification-read', 'profile-updated', 'ready']);
  assert.equal(asyncapi.channels.userStream.address, '/api/events');
});

test('the public stream sends only the two README messages (13.5), with no user data', () => {
  const channel = asyncapi.channels.publicStream;
  assert.equal(channel.address, '/api/public/events');
  const names = Object.values(channel.messages).map((m) => messages[m.$ref.split('/').pop()].name);
  assert.deepEqual(names.sort(), ['public-profile-updated', 'stats-updated']);
});

test('every browser-side example is valid', () => {
  for (const name of browserMessages) {
    const valid = validator(asyncapi, messages[name].payload.$ref.split('/').pop());
    for (const ex of messages[name].examples) assert.ok(valid(ex.payload), `${name}: ${ex.name}`);
  }
});

test('the notification types are exactly the README list (13.1)', () => {
  assert.deepEqual(common.NotificationType.enum, [
    'REQUEST_CREATED', 'NEW_MATCHING_REQUEST', 'REQUEST_UPDATED_RESIDENT',
    'REQUEST_ASSIGNED_RESIDENT', 'REQUEST_ASSIGNED_VOLUNTEER',
    'REQUEST_COLLECTED_RESIDENT', 'REQUEST_COLLECTED_VOLUNTEER',
    'REQUEST_DELIVERED_RESIDENT', 'REQUEST_DELIVERED_VOLUNTEER',
    'ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT', 'ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER',
    'ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT', 'ASSIGNMENT_CANCELLED_BY_VOLUNTEER_VOLUNTEER',
    'ASSIGNMENT_MISSED_RESIDENT', 'ASSIGNMENT_MISSED_VOLUNTEER',
    'REQUEST_CANCELLED_RESIDENT', 'REQUEST_EXPIRED_RESIDENT',
    'ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT', 'ECOPOINTS_AWARDED_ON_DELIVERY_VOLUNTEER',
    'ECOPOINTS_AWARDED_ON_ASSIGNMENT_CANCELLATION_VOLUNTEER',
  ]);
});
