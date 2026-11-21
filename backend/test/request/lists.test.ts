// Q1 and Q2 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh ecocollect_request_test, REQUEST_TEST_DATABASE_URL
// (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipDb } from './db.ts';
import { SEED_CATEGORY_COUNT, SEED_CATEGORY_ID, SEED_FACILITIES_FOR_CATEGORY } from './seed.ts';
import {
  contractChecks, owner, startApp, volunteer, type App, type ContractChecks, type ErrorBody,
} from './helpers.ts';

const residentOnly = owner;   // resident1 has no volunteer role
// Not a category_id in the seed.
const UNKNOWN_CATEGORY_ID = 'not-a-category';

describe('lists', { skip: skipDb }, () => {
  let app: App;
  let categoriesCheck: ContractChecks;
  let facilitiesCheck: ContractChecks;
  before(async () => {
    categoriesCheck = await contractChecks('get', '/api/categories');
    facilitiesCheck = await contractChecks('get', '/api/facilities');
    app = startApp();
  });
  after(() => app.close());

  test('Q1 lists the categories, Q2 the facilities for a category', async () => {
    const categories = await app.call('GET', '/api/categories', volunteer);
    assert.ok(categoriesCheck.isOk(categories.body));
    assert.equal((categories.body as unknown[]).length, SEED_CATEGORY_COUNT);

    const res = await app.call('GET', `/api/facilities?categoryId=${SEED_CATEGORY_ID}`, volunteer);
    assert.ok(facilitiesCheck.isOk(res.body));
    const facilities = res.body as { acceptedCategoryIds: string[] }[];
    assert.equal(facilities.length, SEED_FACILITIES_FOR_CATEGORY);
    for (const f of facilities) assert.ok(f.acceptedCategoryIds.includes(SEED_CATEGORY_ID));
  });

  test('Q2: an unknown categoryId is 400 validation_failed under categoryId', async () => {
    const res = await app.call('GET', `/api/facilities?categoryId=${UNKNOWN_CATEGORY_ID}`, volunteer);
    facilitiesCheck.expectError(res, 400, 'validation_failed');
    assert.ok((res.body as ErrorBody).error.details?.fields?.categoryId);
  });

  test('Q2: a caller without the volunteer role is 403 forbidden', async () => {
    const res = await app.call('GET', `/api/facilities?categoryId=${SEED_CATEGORY_ID}`, residentOnly);
    facilitiesCheck.expectError(res, 403, 'forbidden');
  });
});
