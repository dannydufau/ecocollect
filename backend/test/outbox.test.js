const test = require('node:test');
const assert = require('node:assert');
const { randomUUID } = require('node:crypto');
const { skip, openPool } = require('./db');
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

test('the outbox', { skip }, async (t) => {
  const pool = openPool();
  const made = [];
  // Adds one unsent RequestCreated event for a new request id, and returns that id.
  const make = async () => {
    const requestId = randomUUID();
    await pool.query(
      `INSERT INTO outbox (event_type, routing_key, aggregate_id, payload)
       VALUES ('RequestCreated', 'request.created', $1, $2)`,
      [requestId, { type: 'RequestCreated', data: { requestId } }],
    );
    made.push(requestId);
    return requestId;
  };
  const status = async (requestId) =>
    (await pool.query('SELECT published_at FROM outbox WHERE aggregate_id = $1', [requestId])).rows[0].published_at;
  // Leftover events would get in the way, so mark them as done first. Use a scratch database for these tests.
  await pool.query('UPDATE outbox SET published_at = now() WHERE published_at IS NULL');
  t.after(async () => {
    await pool.query('DELETE FROM outbox WHERE aggregate_id = ANY($1)', [made]);
    await pool.end();
  });

  await t.test('nothing to send is not an error', async () => {
    assert.strictEqual(await publishNext(pool, async () => assert.fail('nothing should be sent')), false);
  });

  await t.test('events go out oldest first, once each, and are marked sent', async () => {
    const a = await make();
    const b = await make();
    const sent = [];
    const send = async (row) => sent.push(row.payload.data.requestId);

    assert.strictEqual(await publishNext(pool, send), true);
    assert.strictEqual(await publishNext(pool, send), true);
    assert.strictEqual(await publishNext(pool, send), false);
    assert.deepStrictEqual(sent, [a, b]);
    assert.ok(await status(a) && await status(b));
  });

  await t.test('if sending fails the event stays unsent, to be tried again', async () => {
    const id = await make();
    await assert.rejects(publishNext(pool, async () => { throw new Error('broker down'); }), /broker down/);
    assert.strictEqual(await status(id), null);

    const channel = fakeChannel();
    assert.strictEqual(await publishNext(pool, sendConfirmed(channel)), true);
    assert.strictEqual(channel.sent[0].body.data.requestId, id);
    assert.strictEqual(channel.sent[0].key, 'request.created');
    assert.ok(await status(id));
  });

  await t.test('two publishers at once do not send the same event twice', async () => {
    await make();
    const sent = [];
    const send = async (row) => {
      sent.push(row.event_id);
      await new Promise((resolve) => setTimeout(resolve, 50));
    };
    await Promise.all([publishNext(pool, send), publishNext(pool, send)]);
    assert.strictEqual(sent.length, 1);
  });
});
