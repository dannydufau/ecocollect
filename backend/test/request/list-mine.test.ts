// Q5 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh --test, REQUEST_TEST_DATABASE_URL
// (see db.ts), and `npm ci` in contracts/. The Q4 test adds requests for the
// same resident on each run, so this test checks seeded ids, not counts.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipDb } from './db.ts';
import { SEED_DELIVERED_REQUEST_ID, SEED_OPEN_REQUEST_ID } from './seed.ts';
import {
  contractChecks, owner, startApp, volunteer, type App, type Caller, type ContractChecks, type ErrorBody,
} from './helpers.ts';

type MyRequest = { requestId: string; status: string; createdAt: string };

describe('Q5 my requests', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  before(async () => {
    check = await contractChecks('get', '/api/requests');
    app = startApp();
  });
  after(() => app.close());

  const list = (query: string, caller: Caller) => app.call('GET', `/api/requests?${query}`, caller);

  test('200 in the contract shape, newest first; status filters on the current status', async () => {
    const all = await list('view=mine', owner);
    assert.equal(all.status, 200);
    assert.ok(check.isOk(all.body));
    const rows = all.body as MyRequest[];
    const ids = rows.map((r) => r.requestId);
    assert.ok(ids.includes(SEED_OPEN_REQUEST_ID) && ids.includes(SEED_DELIVERED_REQUEST_ID));
    const times = rows.map((r) => Date.parse(r.createdAt));
    assert.deepEqual(times, [...times].sort((a, b) => b - a));

    const open = (await list('view=mine&status=Open,Assigned', owner)).body as MyRequest[];
    assert.ok(open.every((r) => r.status === 'Open' || r.status === 'Assigned'));
    assert.ok(open.some((r) => r.requestId === SEED_OPEN_REQUEST_ID));
    assert.ok(!open.some((r) => r.requestId === SEED_DELIVERED_REQUEST_ID));
  });

  test('an unknown status is 400 under status; a caller without the resident role is 403', async () => {
    const bad = await list('view=mine&status=Nope', owner);
    check.expectError(bad, 400, 'validation_failed');
    assert.ok((bad.body as ErrorBody).error.details?.fields?.status);

    check.expectError(await list('view=mine', volunteer), 403, 'forbidden');
  });
});
