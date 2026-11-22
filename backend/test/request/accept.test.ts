// Q11 against the test database, checked against openapi.yaml. Changes
// SEED_ACCEPT_REQUEST_ID (Open -> Assigned): rebuild the database to run it again.
// Needs: backend/scripts/request/load-db.sh --test,
// REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipDb } from './db.ts';
import {
  SEED_ACCEPT_REQUEST_ID, SEED_ACCEPT_WINDOW_ID, SEED_CURRENT_TERMS_ID, SEED_VOLUNTEER_ID,
} from './seed.ts';
import {
  contractChecks, otherVolunteer, startApp, volunteer, type App, type ContractChecks,
} from './helpers.ts';

const path = `/api/requests/${SEED_ACCEPT_REQUEST_ID}/assignment`;
const body = { windowId: SEED_ACCEPT_WINDOW_ID, termsDocumentId: SEED_CURRENT_TERMS_ID };

type Detail = {
  requestId: string; status: string; viewer: string; address?: unknown;
  assignment?: { volunteer: { accountId: string }; window: { windowId: string }; status: string };
};

describe('Q11 accept', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  before(async () => {
    check = await contractChecks('post', '/api/requests/{id}/assignment', '201');
    app = startApp();
  });
  after(() => app.close());

  test('201 with the detail as the assigned volunteer; a second volunteer then gets 409 already_assigned', async () => {
    const first = await app.call('POST', path, volunteer, body);
    assert.equal(first.status, 201);
    assert.ok(check.isOk(first.body));
    const detail = first.body as Detail;
    assert.equal(detail.requestId, SEED_ACCEPT_REQUEST_ID);
    assert.equal(detail.status, 'Assigned');
    assert.equal(detail.viewer, 'assigned_volunteer');
    assert.ok(detail.address);
    assert.equal(detail.assignment?.volunteer.accountId, SEED_VOLUNTEER_ID);
    assert.equal(detail.assignment?.window.windowId, SEED_ACCEPT_WINDOW_ID);
    assert.equal(detail.assignment?.status, 'Active');

    check.expectError(await app.call('POST', path, otherVolunteer, body), 409, 'already_assigned');
  });
});
