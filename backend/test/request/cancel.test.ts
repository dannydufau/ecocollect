// Q10 against the test database, checked against openapi.yaml. Builds its own
// requests through Q4 (and Q11 for the Assigned one), so it runs again without a
// rebuild (each run adds two requests). Needs: backend/scripts/request/load-db.sh
// --test, REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { REASON_MAX_CHARS } from '../../src/request/http/reason.ts';
import { skipDb } from './db.ts';
import {
  contractChecks, createAssigned, createOpen, events, otherResident, owner, startApp, volunteer,
  type App, type ContractChecks, type ErrorBody,
} from './helpers.ts';

type Detail = {
  status: string; allowedActions: string[];
  statusHistory: { status: string; reason?: string | null }[];
  assignment?: { status: string };
};

describe('Q10 cancel', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  before(async () => {
    check = await contractChecks('post', '/api/requests/{id}/cancel');
    app = startApp();
  });
  after(() => app.close());

  test('400 for a too long reason; 403 for another resident; 200 Open -> Cancelled; then 409 not_cancellable', async () => {
    const requestId = await createOpen(app.call, owner);
    const path = `/api/requests/${requestId}/cancel`;

    const tooLong = await app.call('POST', path, owner, { reason: 'x'.repeat(REASON_MAX_CHARS + 1) });
    check.expectError(tooLong, 400, 'validation_failed');
    assert.ok((tooLong.body as ErrorBody).error.details?.fields?.reason);

    check.expectError(await app.call('POST', path, otherResident), 403, 'forbidden');

    const cancelled = await app.call('POST', path, owner, { reason: 'moved away' });
    assert.equal(cancelled.status, 200);
    assert.ok(check.isOk(cancelled.body));
    const detail = cancelled.body as Detail;
    assert.equal(detail.status, 'Cancelled');
    assert.equal(detail.statusHistory.at(-1)?.reason, 'moved away');
    assert.deepEqual(detail.allowedActions, []);
    assert.deepEqual(await events(app.pool, requestId), ['RequestCreated', 'RequestCancelled']);

    check.expectError(await app.call('POST', path, owner), 409, 'not_cancellable');
  });

  test('200 Assigned -> Cancelled with no body: the assignment ends, events E6 then E9', async () => {
    const requestId = await createAssigned(app.call, owner, volunteer);

    const cancelled = await app.call('POST', `/api/requests/${requestId}/cancel`, owner);
    assert.equal(cancelled.status, 200);
    assert.ok(check.isOk(cancelled.body));
    const detail = cancelled.body as Detail;
    assert.equal(detail.status, 'Cancelled');
    assert.equal(detail.assignment?.status, 'Resident_Cancelled');
    assert.equal(detail.statusHistory.at(-1)?.reason, null);
    assert.deepEqual(await events(app.pool, requestId),
      ['RequestCreated', 'RequestAssigned', 'RequestAssignmentCancelledResident', 'RequestCancelled']);
  });
});
