const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { test } = require('node:test');
const amqp = require('amqplib');
const { Pool } = require('pg');
const { publishNext, sendConfirmed, startOutboxPublisher } = require('../../src/messaging/outbox');

const options = { table: 'users.outbox', orderByInsertion: true };
const profile = {
  event_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  event_type: 'ProfileUpdated',
  routing_key: 'user.profile.updated',
  payload: { data: { accountId: 'outbox-test', changed: ['publicName'], publicName: 'Test', roles: ['resident'] } },
};
const deactivation = {
  event_id: '00000000-0000-4000-8000-000000000001',
  event_type: 'AccountDeactivated',
  routing_key: 'user.account.deactivated',
  payload: { data: { accountId: 'outbox-test', deactivatedAt: '2026-11-20T00:00:00.000Z' } },
};

test('User relay retries a broker outage and publishes persistent JSON on recovery', { timeout: 5000 }, async t => {
  const done = new EventEmitter();
  const log = t.mock.method(console, 'error', () => {});
  const channel = {
    assertExchange: t.mock.fn(async () => {}),
    publish: t.mock.fn((_exchange, _key, _body, _properties, confirm) => confirm()),
  };
  const connection = Object.assign(new EventEmitter(), {
    createConfirmChannel: async () => channel,
    close: async () => {},
  });
  let attempts = 0;
  const connect = t.mock.method(amqp, 'connect', async () => {
    if (++attempts === 1) throw new Error('broker down');
    return connection;
  });
  let pending = true;
  let published = false;
  const pool = { connect: async () => ({
    query: async sql => {
      if (sql.startsWith('SELECT')) return { rows: pending ? [profile] : [] };
      if (sql.startsWith('UPDATE')) pending = false;
      if (sql === 'COMMIT' && !pending && !published) {
        published = true;
        done.emit('published');
      }
      return { rows: [] };
    },
    release() {},
  }) };
  const stop = startOutboxPublisher({ pool, url: 'amqp://test', intervalMs: 10, ...options });
  t.after(stop);
  await once(done, 'published', { signal: AbortSignal.timeout(3000) });
  assert.ok(connect.mock.callCount() >= 2);
  assert.deepEqual(log.mock.calls[0].arguments, ['Outbox publisher:', 'broker down']);
  assert.deepEqual(channel.assertExchange.mock.calls[0].arguments, ['ecocollect.events', 'topic', { durable: true }]);
  const [exchange, key, body, properties] = channel.publish.mock.calls[0].arguments;
  assert.equal(exchange, 'ecocollect.events');
  assert.equal(key, profile.routing_key);
  assert.deepEqual(JSON.parse(body), profile.payload);
  assert.deepEqual(properties, {
    persistent: true, contentType: 'application/json', messageId: profile.event_id, type: profile.event_type,
  });
});

test('User outbox preserves insertion order at equal timestamps and retries an unconfirmed row', {
  skip: !process.env.TEST_DATABASE_URL && 'requires a scratch User database',
}, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const rows = [profile, deactivation];
  try {
    // Reverse UUID order so ordering by UUID would send the second row first.
    await pool.query(`INSERT INTO users.outbox (event_id, event_type, routing_key, aggregate_id, payload)
      VALUES ($1,$2,$3,'outbox-test',$4), ($5,$6,$7,'outbox-test',$8)`,
    rows.flatMap(row => [row.event_id, row.event_type, row.routing_key, row.payload]));
    const status = async id => (await pool.query(
      'SELECT published_at FROM users.outbox WHERE event_id = $1', [id],
    )).rows[0].published_at;
    const sent = [];
    const channel = {
      publish(_exchange, key, _body, properties, confirm) {
        sent.push([key, properties.messageId, properties.type]);
        confirm(sent.length === 1 ? new Error('nacked') : null);
      },
    };
    const send = sendConfirmed(channel);
    await assert.rejects(publishNext(pool, send, options), /nacked/);
    assert.equal(await status(profile.event_id), null);
    assert.equal(await publishNext(pool, send, options), true);
    assert.ok(await status(profile.event_id));
    assert.equal(await status(deactivation.event_id), null);
    assert.equal(await publishNext(pool, send, options), true);
    assert.ok(await status(deactivation.event_id));
    assert.deepEqual(sent, [profile, ...rows].map(row => [row.routing_key, row.event_id, row.event_type]));
  } finally {
    try {
      await pool.query('DELETE FROM users.outbox WHERE event_id = ANY($1::uuid[])', [rows.map(row => row.event_id)]);
    } finally {
      await pool.end();
    }
  }
});
