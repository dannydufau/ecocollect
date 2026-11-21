// Q13 against the test database, checked against openapi.yaml. Builds its own
// Assigned request through Q4 and Q11, so it runs again without a rebuild (each
// run adds a request). Needs: backend/scripts/request/load-db.sh
// ecocollect_request_test, REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { createApp } from '../../src/request/app.ts';
import { createPool } from '../../src/request/db/pool.ts';
import { responseSchema, type OpenApi } from './contract.ts';
import { skipDb, testDatabaseUrl } from './db.ts';
import { SEED_CATEGORY_ID, SEED_CURRENT_TERMS_ID, SEED_RESIDENT_ONLY_ID, SEED_VOLUNTEER_ID } from './seed.ts';

const owner = { 'X-User-Id': SEED_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
const volunteer = { 'X-User-Id': SEED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };

// Tomorrow in Calgary: in the future and within 30 days whenever the test runs.
function calgaryTomorrow(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date());
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

type Detail = { status: string; viewer: string; allowedActions: string[]; assignment?: { status: string; collectedAt: string | null } };
type ErrorBody = { error: { code: string } };

describe('Q13 confirm collected', { skip: skipDb }, () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let requestId: string;
  let isDetail: (body: unknown) => boolean;
  let isForbidden: (body: unknown) => boolean;
  let isConflict: (body: unknown) => boolean;

  const call = async (method: string, path: string, headers: Record<string, string>, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as unknown };
  };

  before(async () => {
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    const route = '/api/requests/{id}/assignment/collected';
    isDetail = contracts.inline(contracts.openapi, contracts.responseBody('post', route, '200'));
    isForbidden = contracts.inline(contracts.openapi, responseSchema(contracts.openapi as OpenApi, 'post', route, '403'));
    isConflict = contracts.inline(contracts.openapi, contracts.responseBody('post', route, '409'));
    pool = createPool(testDatabaseUrl);
    server = createApp({ pool }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // An Assigned request: the owner creates it (Q4), the volunteer accepts its window (Q8, Q11).
    const created = await call('POST', '/api/requests', owner, {
      items: [{ categoryId: SEED_CATEGORY_ID, quantity: 1 }],
      windows: [{ date: calgaryTomorrow(), startHour: 12 }],
      termsDocumentId: SEED_CURRENT_TERMS_ID,
    });
    requestId = (created.body as { requests: { requestId: string }[] }).requests[0]!.requestId;
    const seen = await call('GET', `/api/requests/${requestId}`, volunteer);
    const windowId = (seen.body as { windows: { windowId: string }[] }).windows[0]!.windowId;
    const accepted = await call('POST', `/api/requests/${requestId}/assignment`, volunteer,
      { windowId, termsDocumentId: SEED_CURRENT_TERMS_ID });
    assert.equal(accepted.status, 201);
  });
  after(async () => { server.close(); await pool.end(); });

  test('403 for the assigned volunteer; 200 with the detail for the owner; then 409 not_assigned', async () => {
    const path = `/api/requests/${requestId}/assignment/collected`;

    const byVolunteer = await call('POST', path, { ...volunteer, 'X-User-Roles': 'resident,volunteer' });
    assert.equal(byVolunteer.status, 403);
    assert.ok(isForbidden(byVolunteer.body));

    const confirmed = await call('POST', path, owner);
    assert.equal(confirmed.status, 200);
    assert.ok(isDetail(confirmed.body));
    const detail = confirmed.body as Detail;
    assert.equal(detail.status, 'Collected');
    assert.equal(detail.viewer, 'owner');
    assert.equal(detail.assignment?.status, 'Collected');
    assert.ok(detail.assignment?.collectedAt);
    assert.deepEqual(detail.allowedActions, []);

    const again = await call('POST', path, owner);
    assert.equal(again.status, 409);
    assert.ok(isConflict(again.body));
    assert.equal((again.body as ErrorBody).error.code, 'not_assigned');
  });
});
