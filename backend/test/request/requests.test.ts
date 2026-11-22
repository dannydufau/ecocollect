// Q4 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh ecocollect_request_test, REQUEST_TEST_DATABASE_URL
// (see db.ts), and `npm ci` in contracts/. Each run adds requests to the test database.
// The photo check is imagekit/fake.ts, except that FAILING_FILE_ID fails it.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { skipDb } from './db.ts';
import { SEED_CATEGORY_ID, SEED_CURRENT_TERMS_ID, SEED_RESIDENT_ONLY_ID } from './seed.ts';
import { fakePhotos } from '../../src/request/imagekit/fake.ts';
import {
  calgaryDay, contractChecks, owner, startApp, type App, type ContractChecks, type ErrorBody,
} from './helpers.ts';

const FAILING_FILE_ID = 'fails-the-check';

describe('Q4 create requests', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  before(async () => {
    check = await contractChecks('post', '/api/requests', '201');
    app = startApp({ imagekit: {
      ...fakePhotos,
      verify: async (photo) => (photo.fileId === FAILING_FILE_ID ? null : fakePhotos.verify(photo)),
    } });
  });
  after(() => app.close());

  // A valid one-item body, with the item's photo when given.
  const requestBody = (photo?: { fileId: string }) => ({
    items: [{ categoryId: SEED_CATEGORY_ID, quantity: 2, photo }],
    windows: [{ date: calgaryDay(1), startHour: 12 }],
    termsDocumentId: SEED_CURRENT_TERMS_ID,
  });
  // The body without a photo from the resident, with the given Idempotency-Key.
  const post = (key: string) =>
    app.call('POST', '/api/requests', { ...owner, 'Idempotency-Key': key }, requestBody());

  test('201 in the contract shape; a repeat with the same Idempotency-Key replays the same ids', async () => {
    const key = randomUUID();
    const first = await post(key);
    assert.equal(first.status, 201);
    assert.ok(check.isOk(first.body));
    const body = first.body as { requests: { requestId: string; quantity: number }[] };
    assert.equal(body.requests.length, 1);
    assert.equal(body.requests[0]!.quantity, 2);

    const again = await post(key);
    assert.equal(again.status, 201);
    assert.deepEqual(again.body, body);
  });

  test('an empty or 201-character Idempotency-Key is 400 under Idempotency-Key', async () => {
    for (const key of ['', 'k'.repeat(201)]) {
      const res = await post(key);
      check.expectError(res, 400, 'validation_failed', `key of ${key.length} characters`);
      assert.ok((res.body as ErrorBody).error.details?.fields?.['Idempotency-Key']);
    }
  });

  test('an item photo that passes the check shows in Q8; a failed check is 400 under its item', async () => {
    const fileId = randomUUID();         // a new file each run: a stored one is "already used"
    const created = await app.call('POST', '/api/requests', owner, requestBody({ fileId }));
    assert.equal(created.status, 201);
    const { requestId } = (created.body as { requests: { requestId: string }[] }).requests[0]!;
    const detail = await app.call('GET', `/api/requests/${requestId}`, owner);
    const path = await fakePhotos.verify({
      fileId, purpose: 'item_photo', callerId: SEED_RESIDENT_ONLY_ID, requestId: null,
    });
    assert.equal((detail.body as { photoUrl: string }).photoUrl, fakePhotos.sign(path!));

    const failed = await app.call('POST', '/api/requests', owner, requestBody({ fileId: FAILING_FILE_ID }));
    check.expectError(failed, 400, 'validation_failed');
    assert.equal((failed.body as ErrorBody).error.details?.fields?.['items[0].photo.fileId'], 'photo check failed');
  });
});
