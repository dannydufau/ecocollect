// Q9 against the test database, checked against openapi.yaml. Builds its own
// Open requests through Q4, so it runs again without a rebuild. The photo check
// is imagekit/fake.ts, with a remove that records each deleted file. Needs:
// backend/scripts/request/load-db.sh --test,
// REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakePhotos } from '../../src/request/imagekit/fake.ts';
import { skipDb } from './db.ts';
import {
  calgaryDay, contractChecks, createOpen, events, moveIntoPast, otherResident, owner, startApp,
  type App, type ContractChecks,
} from './helpers.ts';

type Detail = {
  status: string; quantity: number; notes: string | null; allowedActions: string[];
  windows: { date: string; startHour: number }[];
};

describe('Q9 edit', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  const removed: string[] = [];        // file ids the route asked ImageKit to delete
  before(async () => {
    check = await contractChecks('patch', '/api/requests/{id}');
    app = startApp({ imagekit: { ...fakePhotos, remove: async (fileId) => { removed.push(fileId); } } });
  });
  after(() => app.close());

  test('403 for another resident; 400 for {}; 200 edits; replaced photo deleted; same values: no event', async () => {
    const requestId = await createOpen(app.call, owner);
    const path = `/api/requests/${requestId}`;
    const first = `test-${requestId}-a`;
    const second = `test-${requestId}-b`;
    const windows = [{ date: calgaryDay(2), startHour: 10 }];

    check.expectError(await app.call('PATCH', path, otherResident, { quantity: 2 }), 403, 'forbidden');
    check.expectError(await app.call('PATCH', path, owner, {}), 400, 'validation_failed');

    const edited = await app.call('PATCH', path, owner, { quantity: 2, notes: 'Side door', windows, photo: { fileId: first } });
    assert.equal(edited.status, 200);
    assert.ok(check.isOk(edited.body));
    const detail = edited.body as Detail;
    assert.equal(detail.quantity, 2);
    assert.equal(detail.notes, 'Side door');
    assert.deepEqual(detail.windows.map(({ date, startHour }) => ({ date, startHour })), windows);
    assert.deepEqual(detail.allowedActions, ['edit', 'cancel']);

    // Replacing the photo: the old file is used by no other request, so it is deleted.
    assert.equal((await app.call('PATCH', path, owner, { photo: { fileId: second } })).status, 200);
    assert.deepEqual(removed, [first]);

    // The same values again: 200, nothing written, no event.
    assert.equal((await app.call('PATCH', path, owner, { quantity: 2, windows })).status, 200);
    assert.deepEqual(await events(app.pool, requestId), ['RequestCreated', 'RequestUpdated', 'RequestUpdated']);
  });

  test('overdue: 409 expired, then 409 not_open', async () => {
    const requestId = await createOpen(app.call, owner);
    await moveIntoPast(requestId, 2);   // its only window has started
    const path = `/api/requests/${requestId}`;

    check.expectError(await app.call('PATCH', path, owner, { quantity: 2 }), 409, 'expired');
    assert.deepEqual(await events(app.pool, requestId), ['RequestCreated', 'RequestExpired']);
    check.expectError(await app.call('PATCH', path, owner, { quantity: 2 }), 409, 'not_open');
  });
});
