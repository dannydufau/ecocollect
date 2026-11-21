// Q6 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh ecocollect_request_test (the seeded
// windows are relative to the load time, so rebuild it if it is days old),
// REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/. The Q4 test
// adds Open requests on each run, so this test checks seeded ids, not counts.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipDb } from './db.ts';
import {
  SEED_DELIVERED_REQUEST_ID, SEED_OPEN_REQUEST_2_ID, SEED_OPEN_REQUEST_2_POSTAL_CODE, SEED_OPEN_REQUEST_ID,
} from './seed.ts';
import {
  contractChecks, owner, startApp, volunteer, type App, type Caller, type ContractChecks, type ErrorBody,
} from './helpers.ts';

const residentOnly = owner;   // resident1 has no volunteer role

type AvailableRequest = { requestId: string; postalCode: string };

describe('Q6 available requests', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  let isAvailableList: (body: unknown) => boolean;
  before(async () => {
    check = await contractChecks('get', '/api/requests');
    // The view=available branch itself: listRequests' 200 is an anyOf of the three views.
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    isAvailableList = contracts.inline(contracts.openapi,
      { type: 'array', items: { $ref: '#/components/schemas/AvailableRequest' } });
    app = startApp();
  });
  after(() => app.close());

  const list = (query: string, caller: Caller) => app.call('GET', `/api/requests?${query}`, caller);

  test('200 in the contract shape, Open requests only; postalCodes filters on the pickup code', async () => {
    const all = await list('view=available', volunteer);
    assert.equal(all.status, 200);
    assert.ok(isAvailableList(all.body));
    const ids = (all.body as AvailableRequest[]).map((r) => r.requestId);
    assert.ok(ids.includes(SEED_OPEN_REQUEST_ID) && ids.includes(SEED_OPEN_REQUEST_2_ID));
    assert.ok(!ids.includes(SEED_DELIVERED_REQUEST_ID));

    const filtered = await list(`view=available&postalCodes=${SEED_OPEN_REQUEST_2_POSTAL_CODE}`, volunteer);
    const rows = filtered.body as AvailableRequest[];
    assert.ok(rows.some((r) => r.requestId === SEED_OPEN_REQUEST_2_ID));
    assert.ok(rows.every((r) => r.postalCode === SEED_OPEN_REQUEST_2_POSTAL_CODE));
  });

  test('a malformed postal code is 400 under postalCodes; a caller without the volunteer role is 403', async () => {
    const bad = await list('view=available&postalCodes=t2p1j9', volunteer);
    check.expectError(bad, 400, 'validation_failed');
    assert.ok((bad.body as ErrorBody).error.details?.fields?.postalCodes);

    check.expectError(await list('view=available', residentOnly), 403, 'forbidden');
  });
});
