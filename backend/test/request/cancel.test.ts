// Q10 against the test database, checked against openapi.yaml. Builds its own
// requests through Q4 (and Q11 for the Assigned one), so it runs again without a
// rebuild (each run adds two requests). Needs: backend/scripts/request/load-db.sh
// ecocollect_request_test, REQUEST_TEST_DATABASE_URL (see db.ts), and `npm ci` in contracts/.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { createApp } from '../../src/request/app.ts';
import { createPool } from '../../src/request/db/pool.ts';
import { REASON_MAX_CHARS } from '../../src/request/http/reason.ts';
import { responseSchema, type OpenApi } from './contract.ts';
import { skipDb, testDatabaseUrl } from './db.ts';
import {
  SEED_CATEGORY_ID, SEED_CURRENT_TERMS_ID, SEED_OTHER_RESIDENT_ONLY_ID, SEED_RESIDENT_ONLY_ID, SEED_VOLUNTEER_ID,
} from './seed.ts';

const owner = { 'X-User-Id': SEED_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
const otherResident = { 'X-User-Id': SEED_OTHER_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
const volunteer = { 'X-User-Id': SEED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };

// Tomorrow in Calgary: in the future and within 30 days whenever the test runs.
function calgaryTomorrow(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date());
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

type Detail = {
  status: string; allowedActions: string[];
  statusHistory: { status: string; reason?: string | null }[];
  assignment?: { status: string };
};
type ErrorBody = { error: { code: string; details?: { fields?: Record<string, string> } } };

describe('Q10 cancel', { skip: skipDb }, () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let isDetail: (body: unknown) => boolean;
  let isError: (status: string) => (body: unknown) => boolean;

  const call = async (method: string, path: string, headers: Record<string, string>, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as unknown };
  };

  // A new Open request of the owner's (Q4).
  const createOpen = async (): Promise<string> => {
    const created = await call('POST', '/api/requests', owner, {
      items: [{ categoryId: SEED_CATEGORY_ID, quantity: 1 }],
      windows: [{ date: calgaryTomorrow(), startHour: 12 }],
      termsDocumentId: SEED_CURRENT_TERMS_ID,
    });
    return (created.body as { requests: { requestId: string }[] }).requests[0]!.requestId;
  };

  // The events of one request, in order.
  const events = async (requestId: string): Promise<string[]> => {
    const { rows } = await pool.query<{ event_type: string }>(
      'SELECT event_type FROM requests.outbox WHERE pickup_request_id = $1 ORDER BY request_seq', [requestId]);
    return rows.map((r) => r.event_type);
  };

  before(async () => {
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    const route = '/api/requests/{id}/cancel';
    isDetail = contracts.inline(contracts.openapi, contracts.responseBody('post', route, '200'));
    isError = (status) => contracts.inline(contracts.openapi, responseSchema(contracts.openapi as OpenApi, 'post', route, status));
    pool = createPool(testDatabaseUrl);
    server = createApp({ pool }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => { server.close(); await pool.end(); });

  test('400 for a too long reason; 403 for another resident; 200 Open -> Cancelled; then 409 not_cancellable', async () => {
    const requestId = await createOpen();
    const path = `/api/requests/${requestId}/cancel`;

    const tooLong = await call('POST', path, owner, { reason: 'x'.repeat(REASON_MAX_CHARS + 1) });
    assert.equal(tooLong.status, 400);
    assert.ok(isError('400')(tooLong.body));
    assert.ok((tooLong.body as ErrorBody).error.details?.fields?.reason);

    const byOther = await call('POST', path, otherResident);
    assert.equal(byOther.status, 403);
    assert.ok(isError('403')(byOther.body));

    const cancelled = await call('POST', path, owner, { reason: 'moved away' });
    assert.equal(cancelled.status, 200);
    assert.ok(isDetail(cancelled.body));
    const detail = cancelled.body as Detail;
    assert.equal(detail.status, 'Cancelled');
    assert.equal(detail.statusHistory.at(-1)?.reason, 'moved away');
    assert.deepEqual(detail.allowedActions, []);
    assert.deepEqual(await events(requestId), ['RequestCreated', 'RequestCancelled']);

    const again = await call('POST', path, owner);
    assert.equal(again.status, 409);
    assert.ok(isError('409')(again.body));
    assert.equal((again.body as ErrorBody).error.code, 'not_cancellable');
  });

  test('200 Assigned -> Cancelled with no body: the assignment ends, events E6 then E9', async () => {
    const requestId = await createOpen();
    const seen = await call('GET', `/api/requests/${requestId}`, volunteer);
    const windowId = (seen.body as { windows: { windowId: string }[] }).windows[0]!.windowId;
    const accepted = await call('POST', `/api/requests/${requestId}/assignment`, volunteer,
      { windowId, termsDocumentId: SEED_CURRENT_TERMS_ID });
    assert.equal(accepted.status, 201);

    const cancelled = await call('POST', `/api/requests/${requestId}/cancel`, owner);
    assert.equal(cancelled.status, 200);
    assert.ok(isDetail(cancelled.body));
    const detail = cancelled.body as Detail;
    assert.equal(detail.status, 'Cancelled');
    assert.equal(detail.assignment?.status, 'Resident_Cancelled');
    assert.equal(detail.statusHistory.at(-1)?.reason, null);
    assert.deepEqual(await events(requestId),
      ['RequestCreated', 'RequestAssigned', 'RequestAssignmentCancelledResident', 'RequestCancelled']);
  });
});
