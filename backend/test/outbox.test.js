const test = require('node:test');
const assert = require('node:assert');
const { skip, openPool, addFixtures, removeFixtures } = require('./db');
const { createStore } = require('../src/api/requests/store');
const { publishNext, sendConfirmed, EXCHANGE } = require('../src/messaging/outbox');

const windows = [{ date: '2030-01-15', startHour: 14 }];

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
  const row = { event_id: 'e1', routing_key: 'request.created', payload: { type: 'RequestCreated' } };

  await t.test('the message is persistent JSON on the events exchange, with the event id as its id', async () => {
    const channel = fakeChannel();
    await sendConfirmed(channel)(row);
    assert.deepStrictEqual(channel.sent, [{
      exchange: EXCHANGE,
      key: 'request.created',
      body: { type: 'RequestCreated' },
      options: { persistent: true, contentType: 'application/json', messageId: 'e1' },
    }]);
    assert.strictEqual(EXCHANGE, 'ecocollect.events');
  });

  await t.test('a message the broker refuses is an error', async () => {
    await assert.rejects(sendConfirmed(fakeChannel({ refuse: true }))(row), /nacked/);
  });

  await t.test('a broker that never confirms is an error after the timeout, not a hang', async () => {
    const silent = { publish: () => true };
    await assert.rejects(sendConfirmed(silent, 20)(row), /did not confirm/);
  });
});

test('the outbox', { skip }, async (t) => {
  const pool = openPool();
  const fx = await addFixtures(pool);
  const store = createStore(pool);
  const make = () => store.createRequests({ uid: fx.resident.uid, items: [{ categoryId: 'laptops', quantity: 1 }], windows }).then(([r]) => r.requestId);
  const status = async (requestId) =>
    (await pool.query('SELECT published_at FROM outbox WHERE aggregate_id = $1', [requestId])).rows[0].published_at;
  // Leftover events would get in the way, so mark them as done first. Use a scratch database for these tests.
  await pool.query('UPDATE outbox SET published_at = now() WHERE published_at IS NULL');
  t.after(async () => {
    await removeFixtures(pool, fx.uids);
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
