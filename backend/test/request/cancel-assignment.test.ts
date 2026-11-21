// Q12 against the test database, checked against openapi.yaml. Builds its own
// Assigned requests through Q4, Q8 and Q11, so it runs again without a rebuild
// (each run adds three requests). Needs: backend/scripts/request/load-db.sh
// ecocollect_request_test, REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipDb } from './db.ts';
import {
  calgaryDay, contractChecks, createAssigned, events, moveIntoPast, otherResident, owner, startApp, volunteer,
  type App, type ContractChecks, type ErrorBody,
} from './helpers.ts';

type Window = { date: string; startHour: number };
type Detail = {
  status: string; windows: Window[];
  statusHistory: { status: string; reason?: string | null }[];
  assignment?: { status: string } | null;
};

describe('Q12 cancel assignment', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  before(async () => {
    check = await contractChecks('post', '/api/requests/{id}/assignment/cancel');
    app = startApp();
  });
  after(() => app.close());

  test('volunteer: 400 with windows; 403 for another resident; 200 reopens (E7, E2); then 409 no_active_assignment', async () => {
    const requestId = await createAssigned(app.call, owner, volunteer);
    const path = `/api/requests/${requestId}/assignment/cancel`;

    const withWindows = await app.call('POST', path, volunteer, { windows: [{ date: calgaryDay(2), startHour: 10 }] });
    check.expectError(withWindows, 400, 'validation_failed');
    assert.ok((withWindows.body as ErrorBody).error.details?.fields?.windows);

    check.expectError(await app.call('POST', path, otherResident), 403, 'forbidden');

    const cancelled = await app.call('POST', path, volunteer);
    assert.equal(cancelled.status, 200);
    assert.ok(check.isOk(cancelled.body));
    assert.equal((cancelled.body as Detail).status, 'Open');
    assert.deepEqual(await events(app.pool, requestId),
      ['RequestCreated', 'RequestAssigned', 'RequestAssignmentCancelledVolunteer', 'RequestUpdated']);

    check.expectError(await app.call('POST', path, volunteer), 409, 'no_active_assignment');
  });

  test('resident with new windows and a reason: 200 reopens with those windows (E6, E2)', async () => {
    const requestId = await createAssigned(app.call, owner, volunteer);
    const newWindows = [{ date: calgaryDay(2), startHour: 10 }, { date: calgaryDay(3), startHour: 15 }];

    const cancelled = await app.call('POST', `/api/requests/${requestId}/assignment/cancel`, owner,
      { reason: 'not home tomorrow', windows: newWindows });
    assert.equal(cancelled.status, 200);
    assert.ok(check.isOk(cancelled.body));
    const detail = cancelled.body as Detail;
    assert.equal(detail.status, 'Open');
    assert.equal(detail.assignment?.status, 'Resident_Cancelled');
    assert.deepEqual(detail.windows.map(({ date, startHour }) => ({ date, startHour })), newWindows);
    assert.equal(detail.statusHistory.at(-1)?.reason, 'not home tomorrow');
    assert.deepEqual(await events(app.pool, requestId),
      ['RequestCreated', 'RequestAssigned', 'RequestAssignmentCancelledResident', 'RequestUpdated']);
  });

  test('volunteer, no window left in the future: Expired (E7, E10); the volunteer gets 404 (issue #368)', async () => {
    const requestId = await createAssigned(app.call, owner, volunteer);
    await moveIntoPast(app.pool, requestId, 2);

    const cancelled = await app.call('POST', `/api/requests/${requestId}/assignment/cancel`, volunteer);
    check.expectError(cancelled, 404, 'request_unavailable');

    const seen = await app.call('GET', `/api/requests/${requestId}`, owner);
    assert.equal((seen.body as Detail).status, 'Expired');
    assert.deepEqual(await events(app.pool, requestId),
      ['RequestCreated', 'RequestAssigned', 'RequestAssignmentCancelledVolunteer', 'RequestExpired']);
  });
});
