// The ENSF 607 resident cases (docs/Final Submission/ENSF607/6. Software quality/
// cases/resident-requests.md) that the route tests don't check in full. Each test
// is named after its case. Needs what the other tests here need: a database from
// backend/scripts/request/load-db.sh --test, REQUEST_TEST_DATABASE_URL (see db.ts),
// and `npm ci` in contracts/. Builds its own requests, so it runs again.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipDb } from './db.ts';
import { SEED_CURRENT_TERMS_ID } from './seed.ts';
import {
  calgaryDay, contractChecks, createAssigned, createOpen, moveIntoPast, otherResident, owner, startApp,
  volunteer, type App, type Caller, type ContractChecks, type ErrorBody,
} from './helpers.ts';

type Window = { date: string; startHour: number };
type Summary = { requestId: string; status: string; quantity: number; estimatedWeightKg: number; createdAt: string };
type Detail = Summary & {
  windows: Window[]; expiresAt: string; address: { street: string; postalCode: string };
  assignment: { status: string } | null; allowedActions: string[];
};

describe('607 resident cases', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  before(async () => {
    check = await contractChecks('post', '/api/requests', '201');
    app = startApp();
  });
  after(() => app.close());

  const create = (categoryIds: string[], quantities: number[], windows: Window[]) =>
    app.call('POST', '/api/requests', owner, {
      items: categoryIds.map((categoryId, i) => ({ categoryId, quantity: quantities[i] })),
      windows,
      termsDocumentId: SEED_CURRENT_TERMS_ID,
    });
  const detail = async (requestId: string, caller: Caller = owner) =>
    (await app.call('GET', `/api/requests/${requestId}`, caller)).body as Detail;
  const mine = async (query = '') =>
    (await app.call('GET', `/api/requests?view=mine${query}`, owner)).body as Summary[];
  const standardWeight = async (categoryId: string) => Number((await app.pool.query(
    'SELECT standard_weight_kg FROM requests.item_category WHERE category_id = $1', [categoryId],
  )).rows[0].standard_weight_kg);
  // The instant a Calgary window starts, worked out by PostgreSQL.
  const startOf = async ({ date, startHour }: Window) => (await app.pool.query<{ at: Date }>(
    "SELECT ($1::date + make_time($2::int, 0, 0)) AT TIME ZONE 'America/Edmonton' AS at", [date, startHour],
  )).rows[0]!.at.toISOString();

  test('FR06-P: two categories make two Open requests with their own weights', async () => {
    const window = { date: calgaryDay(1), startHour: 12 };
    const res = await create(['phones', 'laptops'], [2, 3], [window]);
    assert.equal(res.status, 201);
    assert.ok(check.isOk(res.body));
    const { requests } = res.body as { requests: Summary[] };
    assert.equal(requests.length, 2);
    assert.equal(new Set(requests.map((r) => r.requestId)).size, 2);

    for (const [i, categoryId] of ['phones', 'laptops'].entries()) {
      const shown = await detail(requests[i]!.requestId);
      assert.equal(shown.status, 'Open');
      assert.equal(shown.estimatedWeightKg, Number(((await standardWeight(categoryId)) * [2, 3][i]!).toFixed(2)));
      assert.deepEqual(shown.windows.map(({ date, startHour }) => ({ date, startHour })), [window]);
      assert.equal(shown.expiresAt, await startOf(window));
    }
  });

  test('FR06-N: a repeated category is refused and creates nothing', async () => {
    const before = (await mine()).length;
    const res = await create(['phones', 'phones'], [1, 1], [{ date: calgaryDay(1), startHour: 12 }]);
    assert.equal(res.status, 400);
    const { error } = res.body as ErrorBody;
    assert.equal(error.code, 'validation_failed');
    assert.ok(error.details?.fields?.['items[1].categoryId']);
    assert.equal((await mine()).length, before);
  });

  test('FR07-N: a window that already started today is refused', async () => {
    const before = (await mine()).length;
    // 00:00 today in Calgary has always started.
    const res = await create(['phones'], [1], [{ date: calgaryDay(0), startHour: 0 }]);
    assert.equal(res.status, 400);
    const { error } = res.body as ErrorBody;
    assert.equal(error.code, 'validation_failed');
    assert.ok(Object.values(error.details?.fields ?? {}).includes('must start in the future'));
    assert.equal((await mine()).length, before);
  });

  test('FR09-P and FR09-N: the Open filter shows only the caller\'s Open requests, newest first', async () => {
    const open = await createOpen(app.call, owner);
    const cancelled = await createOpen(app.call, owner);
    assert.equal((await app.call('POST', `/api/requests/${cancelled}/cancel`, owner)).status, 200);
    const theirs = await createOpen(app.call, otherResident);

    const rows = await mine('&status=Open');
    const ids = rows.map((r) => r.requestId);
    assert.ok(ids.includes(open));
    assert.ok(!ids.includes(cancelled));
    assert.ok(!ids.includes(theirs));
    assert.ok(rows.every((r) => r.status === 'Open'));

    const all = await mine();
    assert.ok(!all.some((r) => r.requestId === theirs));
    const times = all.map((r) => Date.parse(r.createdAt));
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
  });

  test('FR10-P: an edit updates weight, windows and expiry, and keeps the address', async () => {
    const requestId = await createOpen(app.call, owner);
    const old = await detail(requestId);
    const windows = [{ date: calgaryDay(2), startHour: 10 }, { date: calgaryDay(3), startHour: 15 }];

    const res = await app.call('PATCH', `/api/requests/${requestId}`, owner, { quantity: 3, windows });
    assert.equal(res.status, 200);
    const edited = await detail(requestId);
    assert.equal(edited.quantity, 3);
    assert.equal(edited.estimatedWeightKg, Number(((await standardWeight('phones')) * 3).toFixed(2)));
    assert.deepEqual(edited.windows.map(({ date, startHour }) => ({ date, startHour })), windows);
    assert.equal(edited.expiresAt, await startOf(windows[1]!));
    assert.deepEqual(edited.address, old.address);
  });

  test('FR10-N: an Assigned request cannot be edited', async () => {
    const requestId = await createAssigned(app.call, owner, volunteer);

    const res = await app.call('PATCH', `/api/requests/${requestId}`, owner, { quantity: 5 });
    assert.equal(res.status, 409);
    assert.equal((res.body as ErrorBody).error.code, 'not_open');
    const shown = await detail(requestId);
    assert.equal(shown.status, 'Assigned');
    assert.equal(shown.quantity, 1);
  });

  test('FR11-P: cancelling an Open request shows Cancelled in the detail and the list', async () => {
    const requestId = await createOpen(app.call, owner);

    assert.equal((await app.call('POST', `/api/requests/${requestId}/cancel`, owner)).status, 200);
    const shown = await detail(requestId);
    assert.equal(shown.status, 'Cancelled');
    assert.equal(shown.assignment, null);
    assert.equal((await mine()).find((r) => r.requestId === requestId)?.status, 'Cancelled');
  });

  test('FR11-N: no cancelling after the selected window ends', async () => {
    const requestId = await createAssigned(app.call, owner, volunteer);
    await moveIntoPast(requestId, 2);

    const res = await app.call('POST', `/api/requests/${requestId}/cancel`, owner);
    assert.equal(res.status, 409);
    assert.equal((res.body as ErrorBody).error.code, 'window_ended');
    const shown = await detail(requestId);
    assert.equal(shown.status, 'Assigned');
    assert.equal(shown.assignment?.status, 'Active');
    assert.ok(shown.allowedActions.includes('confirm_collected'));
    assert.ok(shown.allowedActions.includes('report_missed'));
  });
});
