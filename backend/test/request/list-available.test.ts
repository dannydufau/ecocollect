// Q6 against the test database, checked against openapi.yaml.
// Needs: backend/scripts/request/load-db.sh ecocollect_request_test (the seeded
// windows are relative to the load time, so rebuild it if it is days old),
// REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/. The Q4 test
// adds Open requests on each run, so this test checks seeded ids, not counts.
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
  SEED_DELIVERED_REQUEST_ID, SEED_OPEN_REQUEST_2_ID, SEED_OPEN_REQUEST_2_POSTAL_CODE,
  SEED_OPEN_REQUEST_ID, SEED_RESIDENT_ONLY_ID, SEED_VOLUNTEER_ID,
} from './seed.ts';

const residentOnly = { 'X-User-Id': SEED_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
const volunteer = { 'X-User-Id': SEED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };

type AvailableRequest = { requestId: string; postalCode: string };
type ErrorBody = { error: { code: string; details?: { fields?: Record<string, string> } } };

describe('Q6 available requests', { skip: skipDb }, () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let isAvailableList: (body: unknown) => boolean;
  let isBadRequest: (body: unknown) => boolean;
  let isForbidden: (body: unknown) => boolean;
  before(async () => {
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    // The view=available branch itself: listRequests' 200 is an anyOf of the three views.
    isAvailableList = contracts.inline(contracts.openapi,
      { type: 'array', items: { $ref: '#/components/schemas/AvailableRequest' } });
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

  test('200 in the contract shape, Open requests only; postalCodes filters on the pickup code', async () => {
    const all = await list('view=available', volunteer);
    assert.equal(all.status, 200);
    assert.ok(isAvailableList(all.body));
    const ids = (all.body as AvailableRequest[]).map((r) => r.requestId);
    assert.ok(ids.includes(SEED_OPEN_REQUEST_ID) && ids.includes(SEED_OPEN_REQUEST_2_ID));
    assert.ok(!ids.includes(SEED_DELIVERED_REQUEST_ID));

    const filtered = await list(`view=available&postalCodes=${SEED_OPEN_REQUEST_2_POSTAL_CODE}`, volunteer);
    const rows = filtered.body as AvailableRequest[];
    assert.ok(rows.some((r) => r.requestId === SEED_OPEN_REQUEST_2_ID));
    assert.ok(rows.every((r) => r.postalCode === SEED_OPEN_REQUEST_2_POSTAL_CODE));
  });

  test('a malformed postal code is 400 under postalCodes; a caller without the volunteer role is 403', async () => {
    const bad = await list('view=available&postalCodes=t2p1j9', volunteer);
    assert.equal(bad.status, 400);
    assert.ok(isBadRequest(bad.body));
    assert.ok((bad.body as ErrorBody).error.details?.fields?.postalCodes);

    const notVolunteer = await list('view=available', residentOnly);
    assert.equal(notVolunteer.status, 403);
    assert.ok(isForbidden(notVolunteer.body));
    assert.equal((notVolunteer.body as ErrorBody).error.code, 'forbidden');
  });
});
