const test = require('node:test');
const assert = require('node:assert');
const { publishNext, sendConfirmed } = require('../src/messaging/outbox');
const { exchange } = require('../src/messaging/topology');

// Stands in for the broker's channel: confirms (or refuses) every message it is given.
function fakeChannel({ refuse } = {}) {
  const sent = [];
  return {
    sent,
    publish(exchange, key, content, options, cb) {
      sent.push({ exchange, key, body: JSON.parse(content), options });
      cb(refuse ? new Error('nacked') : null);
      return true;
    },
  };
}

test('sending to the broker', async (t) => {
  const row = { event_id: 'e1', event_type: 'RequestCreated', routing_key: 'request.created', payload: { type: 'RequestCreated' } };
  
  await t.test('the message is persistent JSON on the events exchange, with the event id and type', async () => {
    const channel = fakeChannel();
    await sendConfirmed(channel)(row);
    assert.deepStrictEqual(channel.sent, [{
      exchange: exchange.name,
      key: 'request.created',
      body: { type: 'RequestCreated' },
      options: { persistent: true, contentType: 'application/json', messageId: 'e1', type: 'RequestCreated' },
    }]);
    assert.strictEqual(exchange.name, 'ecocollect.events');
  });

  await t.test('a message the broker refuses is an error', async () => {
    await assert.rejects(sendConfirmed(fakeChannel({ refuse: true }))(row), /nacked/);
  });

  await t.test('a broker that never confirms is an error after the timeout, not a hang', async () => {
    const silent = { publish: () => true };
    await assert.rejects(sendConfirmed(silent, 20)(row), /did not confirm/);
  });
});

// A pool whose client records the SQL it runs and returns one unsent row.
function recordingPool() {
  const sql = [];
  const row = { event_id: 'e1', event_type: 'PointsAwardedDelivery', routing_key: 'reward.points.delivery', payload: {} };
  const client = {
    query: async (text) => {
      sql.push(text);
      return { rows: text.startsWith('SELECT') ? [row] : [] };
    },
    release() {},
  };
  return { sql, connect: async () => client };
}

test('publishNext reads and marks the outbox table it is given', async () => {
  const pool = recordingPool();
  await publishNext(pool, async () => {}, { table: 'rewards.outbox' });
  assert.ok(pool.sql.some((q) => q.includes('FROM rewards.outbox')));
  assert.ok(pool.sql.some((q) => q.includes('UPDATE rewards.outbox')));
});

test('publishNext refuses a table name that is not a plain name, before any SQL runs', async () => {
  const pool = recordingPool();
  await assert.rejects(publishNext(pool, async () => {}, { table: 'outbox; DROP TABLE x' }), TypeError);
  assert.strictEqual(pool.sql.length, 0);
});
