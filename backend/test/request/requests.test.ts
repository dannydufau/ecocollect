// Q4 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh ecocollect_request_test, REQUEST_TEST_DATABASE_URL
// (see db.ts), and `npm ci` in contracts/. Each run adds requests to the test database.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { skipDb } from './db.ts';
import { SEED_CATEGORY_ID, SEED_CURRENT_TERMS_ID } from './seed.ts';
import {
  calgaryDay, contractChecks, owner, startApp, type App, type ContractChecks, type ErrorBody,
} from './helpers.ts';

describe('Q4 create requests', { skip: skipDb }, () => {
  let app: App;
  let check: ContractChecks;
  before(async () => {
    check = await contractChecks('post', '/api/requests', '201');
    app = startApp();
  });
  after(() => app.close());

  // A valid one-item body from the resident, with the given Idempotency-Key.
  const post = (key: string) => app.call('POST', '/api/requests', { ...owner, 'Idempotency-Key': key }, {
    items: [{ categoryId: SEED_CATEGORY_ID, quantity: 2 }],
    windows: [{ date: calgaryDay(1), startHour: 12 }],
    termsDocumentId: SEED_CURRENT_TERMS_ID,
  });

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
});
