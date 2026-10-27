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
    assert.strictEqual(rows.rows[0].pickup_postal_code, fx.here);
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
    assert.strictEqual(event.data.postalCode, fx.here);
    assert.deepStrictEqual(event.data.windows, windows);
    assert.ok(!JSON.stringify(event).includes('Secret'), 'no street address in the event');
  });

  await t.test('the event has exactly the fields the contract declares, nothing more (no street)', async () => {
    const [made] = await store.createRequests({ uid: fx.resident.uid, items: [{ categoryId: 'laptops', quantity: 1 }], windows });
    const { rows } = await pool.query('SELECT payload FROM outbox WHERE aggregate_id = $1', [made.requestId]);
    const event = rows[0].payload;
    // Consumers ignore unknown fields, so this is where the guarantee lives: the producer sends only these.
    assert.deepStrictEqual(Object.keys(event).sort(), ['data', 'eventId', 'occurredAt', 'type', 'version']);
    assert.deepStrictEqual(Object.keys(event.data).sort(), [
      'categoryId', 'categoryName', 'estimatedWeightKg', 'expiresAt', 'matchedVolunteerUids',
      'postalCode', 'quantity', 'requestId', 'residentUid', 'windows',
    ]);
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

test('listing requests', { skip }, async (t) => {
  const pool = openPool();
  const fx = await addFixtures(pool);
  const store = createStore(pool);
  const laptop = { categoryId: 'laptops', quantity: 2 };
  const make = (uid, windows) => store.createRequests({ uid, items: [laptop], windows }).then(([r]) => r.requestId);
  const future = [{ date: '2030-01-15', startHour: 14 }];
  const inYear = (y) => [{ date: `${y}-01-15`, startHour: 14 }];
  t.after(async () => {
    await removeFixtures(pool, fx.uids);
    await pool.end();
  });

  const first = await make(fx.resident.uid, future);
  const second = await make(fx.resident.uid, [{ date: '2030-01-15', startHour: 9 }, { date: '2030-01-16', startHour: 9 }]);
  const other = await make(fx.both.uid, future);
  // Windows in the past can't be created through the API, so write one straight in.
  const stale = await make(fx.resident.uid, future);
  await pool.query("UPDATE pickup_window SET window_date = '2020-01-01' WHERE request_id = $1", [stale]);

  await t.test('mine: newest first, only the caller\'s, in the contract\'s shape', async () => {
    const list = await store.listMine(fx.resident.uid);
    assert.deepStrictEqual(list.map((r) => r.requestId), [stale, second, first]);
    assert.ok(!list.some((r) => r.requestId === other));
    assert.deepStrictEqual(Object.keys(list[0]).sort(), [
      'category', 'createdAt', 'estimatedWeightKg', 'expiresAt', 'quantity', 'requestId', 'status',
    ]);
    assert.strictEqual(list[0].category, 'Computers/Laptops');
    assert.strictEqual(list[0].estimatedWeightKg, 5);
  });

  await t.test('mine: can be filtered by status', async () => {
    await pool.query("UPDATE pickup_request SET status = 'Cancelled' WHERE request_id = $1", [first]);
    assert.deepStrictEqual((await store.listMine(fx.resident.uid, 'Cancelled')).map((r) => r.requestId), [first]);
    assert.strictEqual((await store.listMine(fx.resident.uid, 'Open')).length, 2);
    assert.deepStrictEqual(await store.listMine(fx.resident.uid, 'Delivered'), []);
    await pool.query("UPDATE pickup_request SET status = 'Open' WHERE request_id = $1", [first]);
  });

  await t.test('mine: someone with no requests gets an empty list', async () => {
    assert.deepStrictEqual(await store.listMine(fx.near.uid), []);
  });

  const mineOnly = (list, uids) => list.filter((r) => uids.includes(r.requestId));

  await t.test('available: open requests with a window still ahead, and no street', async () => {
    const list = mineOnly(await store.listAvailable(), [first, second, other, stale]);
    assert.deepStrictEqual(list.map((r) => r.requestId).sort(), [first, second, other].sort());
    const one = list.find((r) => r.requestId === first);
    assert.deepStrictEqual(Object.keys(one).sort(), [
      'category', 'estimatedWeightKg', 'expiresAt', 'postalCode', 'quantity', 'requestId', 'windows',
    ]);
    assert.deepStrictEqual(one.windows, [{ date: '2030-01-15', startHour: 14 }]);
    assert.strictEqual(one.postalCode, fx.here);
    assert.ok(!JSON.stringify(list).includes('Secret'));
  });

  await t.test('available: a window that already started is not shown', async () => {
    await pool.query("UPDATE pickup_window SET window_date = '2020-01-01' WHERE request_id = $1 AND window_no = 1", [second]);
    const two = (await store.listAvailable()).find((r) => r.requestId === second);
    assert.deepStrictEqual(two.windows, [{ date: '2030-01-16', startHour: 9 }]);
  });

  await t.test('available: requests that are not Open, or whose windows were replaced, are left out', async () => {
    await pool.query("UPDATE pickup_request SET status = 'Assigned' WHERE request_id = $1", [first]);
    await pool.query("UPDATE pickup_window SET is_active = FALSE WHERE request_id = $1", [other]);
    const ids = mineOnly(await store.listAvailable(), [first, second, other]).map((r) => r.requestId);
    assert.deepStrictEqual(ids, [second]);
  });

  await t.test('available: postal code filter', async () => {
    const ids = (list) => mineOnly(list, [first, second, other]).map((r) => r.requestId);
    assert.deepStrictEqual(ids(await store.listAvailable([fx.here])), [second]);
    assert.deepStrictEqual(ids(await store.listAvailable([fx.far])), []);
    assert.deepStrictEqual(ids(await store.listAvailable([fx.far, fx.here])), [second]);
  });
});
