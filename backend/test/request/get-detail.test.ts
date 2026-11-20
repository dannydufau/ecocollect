// Q8 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh ecocollect_request_test,
// REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
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
  SEED_ASSIGNED_REQUEST_ID, SEED_CANCELLED_VOLUNTEER_ID, SEED_DELIVERED_REQUEST_ID,
  SEED_OPEN_REQUEST_ID, SEED_OTHER_RESIDENT_ONLY_ID, SEED_RESIDENT_ONLY_ID, SEED_VOLUNTEER_ID,
} from './seed.ts';

const owner = { 'X-User-Id': SEED_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
const volunteer = { 'X-User-Id': SEED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };
const otherResident = { 'X-User-Id': SEED_OTHER_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
const cancelledVolunteer = { 'X-User-Id': SEED_CANCELLED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };

type Detail = { requestId: string; viewer: string; address?: unknown; statusHistory?: unknown[] };
type ErrorBody = { error: { code: string } };

describe('Q8 request detail', { skip: skipDb }, () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let isDetail: (body: unknown) => boolean;
  let isNotFound: (body: unknown) => boolean;
  before(async () => {
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    isDetail = contracts.inline(contracts.openapi, contracts.responseBody('get', '/api/requests/{id}', '200'));
    isNotFound = contracts.inline(contracts.openapi, responseSchema(contracts.openapi, 'get', '/api/requests/{id}', '404'));
    pool = createPool(testDatabaseUrl);
    server = createApp({ pool }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => { server.close(); await pool.end(); });

  const get = async (id: string, headers: Record<string, string>) => {
    const res = await fetch(`${base}/api/requests/${id}`, { headers });
    return { status: res.status, body: await res.json() as unknown };
  };

  test('the owner gets the full detail; a volunteer on an Open request gets no address or history', async () => {
    const own = await get(SEED_DELIVERED_REQUEST_ID, owner);
    assert.equal(own.status, 200);
    assert.ok(isDetail(own.body));
    const detail = own.body as Detail;
    assert.equal(detail.requestId, SEED_DELIVERED_REQUEST_ID);
    assert.equal(detail.viewer, 'owner');
    assert.ok(detail.address && detail.statusHistory);

    const open = await get(SEED_OPEN_REQUEST_ID, volunteer);
    assert.equal(open.status, 200);
    assert.ok(isDetail(open.body));
    const seen = open.body as Detail;
    assert.equal(seen.viewer, 'volunteer');
    assert.equal(seen.address, undefined);
    assert.equal(seen.statusHistory, undefined);
  });

  test('another resident, a cancelled volunteer and a malformed id all get the same 404', async () => {
    for (const [id, headers] of [
      [SEED_OPEN_REQUEST_ID, otherResident],
      [SEED_ASSIGNED_REQUEST_ID, cancelledVolunteer],
      ['not-a-uuid', owner],
    ] as const) {
      const res = await get(id, headers);
      assert.equal(res.status, 404, `${id} as ${headers['X-User-Id']}`);
      assert.ok(isNotFound(res.body));
      assert.equal((res.body as ErrorBody).error.code, 'request_unavailable');
    }
  });
});
