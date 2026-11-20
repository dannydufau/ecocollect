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
  SEED_CATEGORY_COUNT, SEED_CATEGORY_ID, SEED_FACILITIES_FOR_CATEGORY, SEED_RESIDENT_ONLY_ID,
  SEED_VOLUNTEER_ID,
} from './seed.ts';

const volunteer = { 'X-User-Id': SEED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };
const residentOnly = { 'X-User-Id': SEED_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
// Not a category_id in the seed.
const UNKNOWN_CATEGORY_ID = 'not-a-category';

type ErrorBody = { error: { code: string; details?: { fields?: Record<string, string> } } };

// The hooks of a skipped describe don't run, so no pool is made without the URL.
describe('lists', { skip: skipDb }, () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let schemaOf: (route: string) => (body: unknown) => boolean;
  let isError: (body: unknown) => boolean;
  before(async () => {
    // Imported here, not at the top: the validator needs `npm ci` in contracts/,
    // and a skipped run shouldn't need it.
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    schemaOf = (route) =>
      contracts.inline(contracts.openapi, contracts.responseBody('get', route, '200'));
    // The contract's Error shape; Q2's 400 and the shared 403 both use it.
    isError = contracts.inline(contracts.openapi, contracts.responseBody('get', '/api/facilities', '400'));
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

  test('Q2: an unknown categoryId is 400 validation_failed under categoryId', async () => {
    const res = await fetch(`${base}/api/facilities?categoryId=${UNKNOWN_CATEGORY_ID}`, { headers: volunteer });
    const body = await res.json() as ErrorBody;
    assert.equal(res.status, 400);
    assert.ok(isError(body));
    assert.equal(body.error.code, 'validation_failed');
    assert.ok(body.error.details?.fields?.categoryId);
  });

  test('Q2: a caller without the volunteer role is 403 forbidden', async () => {
    const res = await fetch(`${base}/api/facilities?categoryId=${SEED_CATEGORY_ID}`, { headers: residentOnly });
    const body = await res.json() as ErrorBody;
    assert.equal(res.status, 403);
    assert.ok(isError(body));
    assert.equal(body.error.code, 'forbidden');
  });
});
