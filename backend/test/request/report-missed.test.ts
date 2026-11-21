// Q14 against the test database, checked against openapi.yaml. Builds its own
// Assigned requests through Q4, Q8 and Q11, so it runs again without a rebuild
// (each run adds three requests). Needs: backend/scripts/request/load-db.sh
// ecocollect_request_test, REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipDb } from './db.ts';
import {
  calgaryDay, contractChecks, createAssigned, events, moveIntoPast, otherResident, owner, startApp, volunteer,
  type App, type ContractChecks,
} from './helpers.ts';
import { SEED_CURRENT_TERMS_ID } from './seed.ts';

type Detail = {
  status: string;
  allowedActions: string[];
  rescheduledAs: { requestId: string } | null;
  statusHistory: { status: string; reason?: string | null }[];
};
type Reported = { request: Detail; rescheduledRequest: { requestId: string; status: string } | null };

describe('Q14 report missed', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  before(async () => {
    check = await contractChecks('post', '/api/requests/{id}/assignment/missed');
    app = startApp();
  });
  after(() => app.close());

  test('before the window ends: 409 window_not_ended; another resident: 403', async () => {
    const requestId = await createAssigned(app.call, owner, volunteer);
    const path = `/api/requests/${requestId}/assignment/missed`;

    check.expectError(await app.call('POST', path, owner), 409, 'window_not_ended');
    check.expectError(await app.call('POST', path, otherResident), 403, 'forbidden');
  });

  test('with a reschedule and a reason: Missed and a new Open request (E8, then E1); then 409 not_assigned', async () => {
    const requestId = await createAssigned(app.call, owner, volunteer);
    await moveIntoPast(app.pool, requestId, 3);
    const path = `/api/requests/${requestId}/assignment/missed`;

    const reported = await app.call('POST', path, owner, {
      reason: 'Nobody came',
      reschedule: { windows: [{ date: calgaryDay(2), startHour: 10 }], termsDocumentId: SEED_CURRENT_TERMS_ID },
    });
    assert.equal(reported.status, 200);
    assert.ok(check.isOk(reported.body));
    const { request, rescheduledRequest } = reported.body as Reported;
    assert.equal(request.status, 'Missed');
    assert.deepEqual(request.allowedActions, []);
    assert.equal(request.statusHistory.at(-1)?.reason, 'Nobody came');
    assert.equal(rescheduledRequest?.status, 'Open');
    assert.equal(request.rescheduledAs?.requestId, rescheduledRequest?.requestId);

    assert.deepEqual(await events(app.pool, requestId),
      ['RequestCreated', 'RequestAssigned', 'RequestAssignmentMissed']);
    assert.deepEqual(await events(app.pool, rescheduledRequest!.requestId), ['RequestCreated']);

    check.expectError(await app.call('POST', path, owner), 409, 'not_assigned');
  });

  test('no body: Missed, no new request', async () => {
    const requestId = await createAssigned(app.call, owner, volunteer);
    await moveIntoPast(app.pool, requestId, 3);

    const reported = await app.call('POST', `/api/requests/${requestId}/assignment/missed`, owner);
    assert.equal(reported.status, 200);
    assert.ok(check.isOk(reported.body));
    const { request, rescheduledRequest } = reported.body as Reported;
    assert.equal(request.status, 'Missed');
    assert.equal(request.rescheduledAs, null);
    assert.equal(rescheduledRequest, null);
  });
});
