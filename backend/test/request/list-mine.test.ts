// Q5 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh ecocollect_request_test, REQUEST_TEST_DATABASE_URL
// (see db.ts), and `npm ci` in contracts/. The Q4 test adds requests for the
// same resident on each run, so this test checks seeded ids, not counts.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { createApp } from '../../src/request/app.ts';
import { createPool } from '../../src/request/db/pool.ts';
import { skipDb, testDatabaseUrl } from './db.ts';
import { responseSchema } from './contract.ts';
import {
  SEED_DELIVERED_REQUEST_ID, SEED_OPEN_REQUEST_ID, SEED_RESIDENT_ONLY_ID, SEED_VOLUNTEER_ID,
} from './seed.ts';

const residentOnly = { 'X-User-Id': SEED_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
const volunteer = { 'X-User-Id': SEED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };

type MyRequest = { requestId: string; status: string; createdAt: string };
type ErrorBody = { error: { code: string; details?: { fields?: Record<string, string> } } };

describe('Q5 my requests', { skip: skipDb }, () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let is200: (body: unknown) => boolean;
  let isBadRequest: (body: unknown) => boolean;
  let isForbidden: (body: unknown) => boolean;
  before(async () => {
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    is200 = contracts.inline(contracts.openapi, contracts.responseBody('get', '/api/requests', '200'));
    isBadRequest = contracts.inline(contracts.openapi, responseSchema(contracts.openapi, 'get', '/api/requests', '400'));
    isForbidden = contracts.inline(contracts.openapi, responseSchema(contracts.openapi, 'get', '/api/requests', '403'));
    pool = createPool(testDatabaseUrl);
    server = createApp({ pool }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => { server.close(); await pool.end(); });

  const list = async (query: string, headers: Record<string, string>) => {
    const res = await fetch(`${base}/api/requests?${query}`, { headers });
    return { status: res.status, body: await res.json() as unknown };
  };

  test('200 in the contract shape, newest first; status filters on the current status', async () => {
    const all = await list('view=mine', residentOnly);
    assert.equal(all.status, 200);
    assert.ok(is200(all.body));
    const rows = all.body as MyRequest[];
    const ids = rows.map((r) => r.requestId);
    assert.ok(ids.includes(SEED_OPEN_REQUEST_ID) && ids.includes(SEED_DELIVERED_REQUEST_ID));
    const times = rows.map((r) => Date.parse(r.createdAt));
    assert.deepEqual(times, [...times].sort((a, b) => b - a));

    const open = (await list('view=mine&status=Open,Assigned', residentOnly)).body as MyRequest[];
    assert.ok(open.every((r) => r.status === 'Open' || r.status === 'Assigned'));
    assert.ok(open.some((r) => r.requestId === SEED_OPEN_REQUEST_ID));
    assert.ok(!open.some((r) => r.requestId === SEED_DELIVERED_REQUEST_ID));
  });

  test('an unknown status is 400 under status; a caller without the resident role is 403', async () => {
    const bad = await list('view=mine&status=Nope', residentOnly);
    assert.equal(bad.status, 400);
    assert.ok(isBadRequest(bad.body));
    assert.ok((bad.body as ErrorBody).error.details?.fields?.status);

    const notResident = await list('view=mine', volunteer);
    assert.equal(notResident.status, 403);
    assert.ok(isForbidden(notResident.body));
    assert.equal((notResident.body as ErrorBody).error.code, 'forbidden');
  });
});
