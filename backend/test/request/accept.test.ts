// Q11 against the test database, checked against openapi.yaml. Changes
// SEED_ACCEPT_REQUEST_ID (Open -> Assigned): rebuild the database to run it again.
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
import {
  SEED_ACCEPT_REQUEST_ID, SEED_ACCEPT_WINDOW_ID, SEED_CURRENT_TERMS_ID,
  SEED_OTHER_VOLUNTEER_ID, SEED_VOLUNTEER_ID,
} from './seed.ts';

const volunteer = { 'X-User-Id': SEED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };
const otherVolunteer = { 'X-User-Id': SEED_OTHER_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };
const body = { windowId: SEED_ACCEPT_WINDOW_ID, termsDocumentId: SEED_CURRENT_TERMS_ID };

type Detail = {
  requestId: string; status: string; viewer: string; address?: unknown;
  assignment?: { volunteer: { accountId: string }; window: { windowId: string }; status: string };
};
type ErrorBody = { error: { code: string } };

describe('Q11 accept', { skip: skipDb }, () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let isDetail: (body: unknown) => boolean;
  let isConflict: (body: unknown) => boolean;
  before(async () => {
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    const route = '/api/requests/{id}/assignment';
    isDetail = contracts.inline(contracts.openapi, contracts.responseBody('post', route, '201'));
    isConflict = contracts.inline(contracts.openapi, contracts.responseBody('post', route, '409'));
    pool = createPool(testDatabaseUrl);
    server = createApp({ pool }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => { server.close(); await pool.end(); });

  const accept = async (headers: Record<string, string>) => {
    const res = await fetch(`${base}/api/requests/${SEED_ACCEPT_REQUEST_ID}/assignment`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as unknown };
  };

  test('201 with the detail as the assigned volunteer; a second volunteer then gets 409 already_assigned', async () => {
    const first = await accept(volunteer);
    assert.equal(first.status, 201);
    assert.ok(isDetail(first.body));
    const detail = first.body as Detail;
    assert.equal(detail.requestId, SEED_ACCEPT_REQUEST_ID);
    assert.equal(detail.status, 'Assigned');
    assert.equal(detail.viewer, 'assigned_volunteer');
    assert.ok(detail.address);
    assert.equal(detail.assignment?.volunteer.accountId, SEED_VOLUNTEER_ID);
    assert.equal(detail.assignment?.window.windowId, SEED_ACCEPT_WINDOW_ID);
    assert.equal(detail.assignment?.status, 'Active');

    const second = await accept(otherVolunteer);
    assert.equal(second.status, 409);
    assert.ok(isConflict(second.body));
    assert.equal((second.body as ErrorBody).error.code, 'already_assigned');
  });
});
