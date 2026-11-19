// Q1 and Q2 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh ecocollect_request_test, REQUEST_TEST_DATABASE_URL
// (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { createApp } from '../../src/request/app.ts';
import { createPool } from '../../src/request/db/pool.ts';
import { skipDb, testDatabaseUrl } from './db.ts';
import {
  SEED_CATEGORY_COUNT, SEED_CATEGORY_ID, SEED_FACILITIES_FOR_CATEGORY, SEED_VOLUNTEER_ID,
} from './seed.ts';

const volunteer = { 'X-User-Id': SEED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };

// The hooks of a skipped describe don't run, so no pool is made without the URL.
describe('lists', { skip: skipDb }, () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let schemaOf: (route: string) => (body: unknown) => boolean;
  before(async () => {
    // Imported here, not at the top: the validator needs `npm ci` in contracts/,
    // and a skipped run shouldn't need it.
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    schemaOf = (route) =>
      contracts.inline(contracts.openapi, contracts.responseBody('get', route, '200'));
    pool = createPool(testDatabaseUrl);
    server = createApp({ pool }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => { server.close(); await pool.end(); });

  test('Q1 lists the categories, Q2 the facilities for a category', async () => {
    const categories = await (await fetch(`${base}/api/categories`, { headers: volunteer })).json() as unknown[];
    assert.ok(schemaOf('/api/categories')(categories));
    assert.equal(categories.length, SEED_CATEGORY_COUNT);

    const res = await fetch(`${base}/api/facilities?categoryId=${SEED_CATEGORY_ID}`, { headers: volunteer });
    const facilities = await res.json() as { acceptedCategoryIds: string[] }[];
    assert.ok(schemaOf('/api/facilities')(facilities));
    assert.equal(facilities.length, SEED_FACILITIES_FOR_CATEGORY);
    for (const f of facilities) assert.ok(f.acceptedCategoryIds.includes(SEED_CATEGORY_ID));
  });
});
