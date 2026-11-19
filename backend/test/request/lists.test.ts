// Q1 and Q2 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh ecocollect_request_test, and `npm ci` in contracts/.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import contracts from '../../../contracts/test/helpers.js';
import { createApp } from '../../src/request/app.ts';
import { createPool } from '../../src/request/db/pool.ts';

const pool = createPool(process.env.REQUEST_TEST_DATABASE_URL
  ?? 'postgres://ecocollect:change_me@localhost:5432/ecocollect_request_test');
const server = createApp({ pool }).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(async () => { server.close(); await pool.end(); });

const volunteer = { 'X-User-Id': 'volunteer1', 'X-User-Roles': 'volunteer' };
const schemaOf = (route: string) =>
  contracts.inline(contracts.openapi, contracts.responseBody('get', route, '200'));

test('Q1 lists the categories, Q2 the facilities for a category', async () => {
  const categories = await (await fetch(`${base}/api/categories`, { headers: volunteer })).json() as unknown[];
  assert.ok(schemaOf('/api/categories')(categories));
  assert.equal(categories.length, 9);

  const res = await fetch(`${base}/api/facilities?categoryId=phones`, { headers: volunteer });
  const facilities = await res.json() as { acceptedCategoryIds: string[] }[];
  assert.ok(schemaOf('/api/facilities')(facilities));
  assert.ok(facilities.length > 0);
  for (const f of facilities) assert.ok(f.acceptedCategoryIds.includes('phones'));
});
