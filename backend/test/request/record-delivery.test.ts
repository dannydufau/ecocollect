// Q15 against the test database, checked against openapi.yaml. Builds its own
// Assigned request through Q4 and Q11 (and collects it with Q13), so it runs
// again without a rebuild. The photo check is imagekit/fake.ts, except where the
// default (no ImageKit yet) is tested. Needs: backend/scripts/request/load-db.sh
// ecocollect_request_test, REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { createApp } from '../../src/request/app.ts';
import { createPool } from '../../src/request/db/pool.ts';
import { fakePhotos } from '../../src/request/imagekit/fake.ts';
import { responseSchema, type OpenApi } from './contract.ts';
import { skipDb, testDatabaseUrl } from './db.ts';
import {
  SEED_CATEGORY_ID, SEED_CURRENT_TERMS_ID, SEED_OTHER_VOLUNTEER_ID, SEED_RESIDENT_ONLY_ID, SEED_VOLUNTEER_ID,
} from './seed.ts';

const owner = { 'X-User-Id': SEED_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
const volunteer = { 'X-User-Id': SEED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };
const otherVolunteer = { 'X-User-Id': SEED_OTHER_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };

// Tomorrow in Calgary: in the future and within 30 days whenever the test runs.
function calgaryTomorrow(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date());
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

type Detail = { status: string; allowedActions: string[]; delivery?: { facility: { facilityId: string } } | null };
type ErrorBody = { error: { code: string; details?: { fields?: Record<string, string> } } };

describe('Q15 record delivery', { skip: skipDb }, () => {
  let pool: pg.Pool;
  let servers: Server[];
  let base: string;                    // with fakePhotos
  let baseNoImageKit: string;          // the default: every photo refused
  let requestId: string;
  let facilityId: string;
  let isDetail: (body: unknown) => boolean;
  let isError: Record<string, (body: unknown) => boolean>;

  const call = async (method: string, path: string, headers: Record<string, string>, body?: unknown, at = base) => {
    const res = await fetch(`${at}${path}`, {
      method, headers: { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as unknown };
  };

  before(async () => {
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    const route = '/api/requests/{id}/assignment/delivery';
    const schema = (status: string) => contracts.inline(contracts.openapi, responseSchema(contracts.openapi as OpenApi, 'post', route, status));
    isDetail = contracts.inline(contracts.openapi, contracts.responseBody('post', route, '200'));
    isError = { 400: schema('400'), 403: schema('403'), 409: schema('409') };
    pool = createPool(testDatabaseUrl);
    servers = [createApp({ pool, imagekit: fakePhotos }).listen(0), createApp({ pool }).listen(0)];
    [base, baseNoImageKit] = servers.map((s) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`) as [string, string];

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

    // A facility that accepts the category (Q2).
    const facilities = await call('GET', `/api/facilities?categoryId=${SEED_CATEGORY_ID}`, volunteer);
    facilityId = (facilities.body as { facilityId: string }[])[0]!.facilityId;
  });
  after(async () => { servers.forEach((s) => s.close()); await pool.end(); });

  test('403 for another volunteer; 409 not_collected; 400 without ImageKit; 200 after collection; then 409', async () => {
    const path = `/api/requests/${requestId}/assignment/delivery`;
    const body = { facilityId, evidencePhoto: { fileId: `test-${requestId}` } };
    const expectError = (res: { status: number; body: unknown }, status: number, code: string) => {
      assert.equal(res.status, status);
      assert.ok(isError[status]!(res.body));
      assert.equal((res.body as ErrorBody).error.code, code);
    };

    expectError(await call('POST', path, otherVolunteer, body), 403, 'forbidden');
    expectError(await call('POST', path, volunteer, body), 409, 'not_collected');

    assert.equal((await call('POST', `/api/requests/${requestId}/assignment/collected`, owner)).status, 200);

    const refused = await call('POST', path, volunteer, body, baseNoImageKit);
    expectError(refused, 400, 'validation_failed');
    assert.deepEqual(Object.keys((refused.body as ErrorBody).error.details?.fields ?? {}), ['evidencePhoto.fileId']);

    const delivered = await call('POST', path, volunteer, body);
    assert.equal(delivered.status, 200);
    assert.ok(isDetail(delivered.body));
    const detail = delivered.body as Detail;
    assert.equal(detail.status, 'Delivered');
    assert.equal(detail.delivery?.facility.facilityId, facilityId);
    assert.deepEqual(detail.allowedActions, []);

    expectError(await call('POST', path, volunteer, body), 409, 'already_delivered');
  });
});
