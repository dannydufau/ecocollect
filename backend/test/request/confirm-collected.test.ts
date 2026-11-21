// Q13 against the test database, checked against openapi.yaml. Builds its own
// Assigned request through Q4, Q8 and Q11, so it runs again without a rebuild
// (each run adds a request). Needs: backend/scripts/request/load-db.sh
// ecocollect_request_test, REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipDb } from './db.ts';
import {
  contractChecks, createAssigned, owner, startApp, volunteer, type App, type ContractChecks,
} from './helpers.ts';

type Detail = { status: string; viewer: string; allowedActions: string[]; assignment?: { status: string; collectedAt: string | null } };

describe('Q13 confirm collected', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  let requestId: string;
  before(async () => {
    check = await contractChecks('post', '/api/requests/{id}/assignment/collected');
    app = startApp();
    requestId = await createAssigned(app.call, owner, volunteer);
  });
  after(() => app.close());

  test('403 for the assigned volunteer; 200 with the detail for the owner; then 409 not_assigned', async () => {
    const path = `/api/requests/${requestId}/assignment/collected`;

    const byVolunteer = await app.call('POST', path, { ...volunteer, 'X-User-Roles': 'resident,volunteer' });
    check.expectError(byVolunteer, 403, 'forbidden');

    const confirmed = await app.call('POST', path, owner);
    assert.equal(confirmed.status, 200);
    assert.ok(check.isOk(confirmed.body));
    const detail = confirmed.body as Detail;
    assert.equal(detail.status, 'Collected');
    assert.equal(detail.viewer, 'owner');
    assert.equal(detail.assignment?.status, 'Collected');
    assert.ok(detail.assignment?.collectedAt);
    assert.deepEqual(detail.allowedActions, []);

    check.expectError(await app.call('POST', path, owner), 409, 'not_assigned');
  });
});
