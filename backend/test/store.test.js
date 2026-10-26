const test = require('node:test');
const assert = require('node:assert');
const { skip, openPool, addFixtures, removeFixtures } = require('./db');
const { createStore, RequestError } = require('../src/api/requests/store');

const windows = [{ date: '2030-01-15', startHour: 14 }, { date: '2030-01-16', startHour: 9 }];

test('creating requests', { skip }, async (t) => {
  const pool = openPool();
  const fx = await addFixtures(pool);
  const store = createStore(pool);
  t.after(async () => {
    await removeFixtures(pool, fx.uids);
    await pool.end();
  });

  await t.test('one request per item, with the weight worked out from the category', async () => {
    const items = [{ categoryId: 'laptops', quantity: 2 }, { categoryId: 'other-electronics', quantity: 1, description: 'Old fax' }];
    const created = await store.createRequests({ uid: fx.resident.uid, items, windows, notes: 'Back door' });

    assert.strictEqual(created.length, 2);
    assert.strictEqual(created[0].categoryId, 'laptops');
    assert.strictEqual(created[0].estimatedWeightKg, 5);
    assert.strictEqual(created[0].status, 'Open');
    assert.strictEqual(created[1].estimatedWeightKg, 1);
    // The database adds 30 calendar days, which is an hour off in a local time zone that changes clocks.
    const days = (created[0].expiresAt - created[0].createdAt) / (24 * 60 * 60 * 1000);
    assert.ok(Math.abs(days - 30) < 0.05, `expires in ${days} days`);

    const rows = await pool.query(
      'SELECT pickup_street, pickup_postal_code, notes, status FROM pickup_request WHERE resident_uid = $1',
      [fx.resident.uid],
    );
    assert.strictEqual(rows.rowCount, 2);
    assert.strictEqual(rows.rows[0].pickup_street, '1 Secret St SW', 'the address comes from the profile');
    assert.strictEqual(rows.rows[0].pickup_postal_code, 'T2P1J9');
    assert.strictEqual(rows.rows[0].notes, 'Back door');

    const saved = await pool.query(
      'SELECT window_no, window_date::text AS d, start_hour FROM pickup_window WHERE request_id = $1 ORDER BY window_no',
      [created[0].requestId],
    );
    assert.deepStrictEqual(saved.rows, [
      { window_no: 1, d: '2030-01-15', start_hour: 14 },
      { window_no: 2, d: '2030-01-16', start_hour: 9 },
    ]);
    const history = await pool.query('SELECT status FROM status_change WHERE request_id = $1', [created[0].requestId]);
    assert.deepStrictEqual(history.rows, [{ status: 'Open' }]);
  });

  await t.test('each request starts one RequestCreated event in the outbox', async () => {
    const [made] = await store.createRequests({ uid: fx.resident.uid, items: [{ categoryId: 'laptops', quantity: 3 }], windows });
    const { rows } = await pool.query('SELECT * FROM outbox WHERE aggregate_id = $1', [made.requestId]);

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].routing_key, 'request.created');
    assert.strictEqual(rows[0].published_at, null);
    const event = rows[0].payload;
    assert.strictEqual(event.eventId, rows[0].event_id);
    assert.strictEqual(event.type, 'RequestCreated');
    assert.strictEqual(event.version, 1);
    assert.strictEqual(event.data.requestId, made.requestId);
    assert.strictEqual(event.data.residentUid, fx.resident.uid);
    assert.strictEqual(event.data.categoryName, 'Computers/Laptops');
    assert.strictEqual(event.data.estimatedWeightKg, 7.5);
    assert.strictEqual(event.data.postalCode, 'T2P1J9');
    assert.deepStrictEqual(event.data.windows, windows);
    assert.ok(!JSON.stringify(event).includes('Secret'), 'no street address in the event');
  });

  await t.test('the event lists the volunteers who saved that area, not the resident', async () => {
    const [made] = await store.createRequests({ uid: fx.both.uid, items: [{ categoryId: 'laptops', quantity: 1 }], windows });
    const { rows } = await pool.query('SELECT payload FROM outbox WHERE aggregate_id = $1', [made.requestId]);
    assert.deepStrictEqual(rows[0].payload.data.matchedVolunteerUids, [fx.near.uid]);
  });

  await t.test('an unknown category fails and nothing is saved', async () => {
    const before = await pool.query('SELECT count(*)::int AS n FROM pickup_request WHERE resident_uid = $1', [fx.resident.uid]);
    const items = [{ categoryId: 'laptops', quantity: 1 }, { categoryId: 'toasters', quantity: 1 }];
    await assert.rejects(store.createRequests({ uid: fx.resident.uid, items, windows }), (err) => {
      assert.ok(err instanceof RequestError);
      assert.match(err.message, /toasters/);
      return true;
    });
    const after = await pool.query('SELECT count(*)::int AS n FROM pickup_request WHERE resident_uid = $1', [fx.resident.uid]);
    assert.strictEqual(after.rows[0].n, before.rows[0].n);
  });

  await t.test('an account with no profile is turned away', async () => {
    await assert.rejects(
      store.createRequests({ uid: 'nobody', items: [{ categoryId: 'laptops', quantity: 1 }], windows }),
      RequestError,
    );
  });

  await t.test('a failure half way rolls back every request and event', async () => {
    const before = await pool.query('SELECT count(*)::int AS n FROM pickup_request WHERE resident_uid = $1', [fx.resident.uid]);
    // The same date twice breaks the unique window index after the request row is already inserted.
    const clash = [{ date: '2030-01-15', startHour: 9 }, { date: '2030-01-15', startHour: 10 }];
    await assert.rejects(store.createRequests({ uid: fx.resident.uid, items: [{ categoryId: 'laptops', quantity: 1 }], windows: clash }));
    const after = await pool.query('SELECT count(*)::int AS n FROM pickup_request WHERE resident_uid = $1', [fx.resident.uid]);
    assert.strictEqual(after.rows[0].n, before.rows[0].n);
  });
});
