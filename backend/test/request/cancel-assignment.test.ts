// Q12 against the test database, checked against openapi.yaml. Builds its own
// Assigned requests through Q4, Q8 and Q11, so it runs again without a rebuild
// (each run adds two requests). Needs: backend/scripts/request/load-db.sh
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
import {
  SEED_CATEGORY_ID, SEED_CURRENT_TERMS_ID, SEED_OTHER_RESIDENT_ONLY_ID, SEED_RESIDENT_ONLY_ID, SEED_VOLUNTEER_ID,
} from './seed.ts';

const owner = { 'X-User-Id': SEED_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
const otherResident = { 'X-User-Id': SEED_OTHER_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
const volunteer = { 'X-User-Id': SEED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };

// A day in Calgary, `days` after today: in the future and within 30 days.
function calgaryDay(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date());
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

type Window = { date: string; startHour: number };
type Detail = {
  status: string; windows: Window[];
  statusHistory: { status: string; reason?: string | null }[];
  assignment?: { status: string } | null;
};
type ErrorBody = { error: { code: string; details?: { fields?: Record<string, string> } } };

describe('Q12 cancel assignment', { skip: skipDb }, () => {
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

  // A new request of the owner's (Q4), accepted by the volunteer (Q8, Q11).
  const createAssigned = async (): Promise<string> => {
    const created = await call('POST', '/api/requests', owner, {
      items: [{ categoryId: SEED_CATEGORY_ID, quantity: 1 }],
      windows: [{ date: calgaryDay(1), startHour: 12 }],
      termsDocumentId: SEED_CURRENT_TERMS_ID,
    });
    const requestId = (created.body as { requests: { requestId: string }[] }).requests[0]!.requestId;
    const seen = await call('GET', `/api/requests/${requestId}`, volunteer);
    const windowId = (seen.body as { windows: { windowId: string }[] }).windows[0]!.windowId;
    const accepted = await call('POST', `/api/requests/${requestId}/assignment`, volunteer,
      { windowId, termsDocumentId: SEED_CURRENT_TERMS_ID });
    assert.equal(accepted.status, 201);
    return requestId;
  };

  // Moves a request's whole timeline `days` into the past (the API only takes
  // future windows). Everything moves together, so check_request still holds:
  // the acceptances (creation and assignments), accepted_at, created_at, the
  // status history and the window dates. 2 days puts tomorrow's window in the
  // past and stays after the current terms (published 40 days before the seed).
  const moveIntoPast = async (requestId: string, days: number): Promise<void> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Find the course tables without a schema prefix, until COMMIT.
      await client.query(`SET LOCAL search_path TO ecocollect608`);
      // Move back the terms acceptances: the resident's at creation and each volunteer's at accept.
      await client.query(
        `UPDATE terms_acceptance SET accepted_at = accepted_at - make_interval(days => $2)
         WHERE terms_acceptance_id IN (
           SELECT p.terms_acceptance_id FROM pickup_request p WHERE p.pickup_request_id = $1
           UNION
           SELECT a.terms_acceptance_id FROM assignment a
           JOIN pickup_window w ON w.pickup_window_id = a.pickup_window_id
           WHERE w.pickup_request_id = $1)`, [requestId, days]);
      // Move back accepted_at of each assignment on this request.
      await client.query(
        `UPDATE assignment a SET accepted_at = a.accepted_at - make_interval(days => $2)
         FROM pickup_window w
         WHERE w.pickup_window_id = a.pickup_window_id AND w.pickup_request_id = $1`, [requestId, days]);
      // Move back the request's created_at.
      await client.query(
        `UPDATE pickup_request SET created_at = created_at - make_interval(days => $2)
         WHERE pickup_request_id = $1`, [requestId, days]);
      // Move back every status change of the request (its Open and Assigned rows).
      await client.query(
        `UPDATE status_change SET changed_at = changed_at - make_interval(days => $2)
         WHERE pickup_request_id = $1`, [requestId, days]);
      // Move back the window dates, so tomorrow's window is now in the past.
      await client.query(
        `UPDATE pickup_window SET pickup_date = pickup_date - $2::int
         WHERE pickup_request_id = $1`, [requestId, days]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');    // never give the pool a connection inside a failed transaction
      throw err;
    } finally {
      client.release();
    }
  };

  // The events of one request, in order.
  const events = async (requestId: string): Promise<string[]> => {
    const { rows } = await pool.query<{ event_type: string }>(
      'SELECT event_type FROM requests.outbox WHERE pickup_request_id = $1 ORDER BY request_seq', [requestId]);
    return rows.map((r) => r.event_type);
  };

  before(async () => {
    const { default: contracts } = await import('../../../contracts/test/helpers.js');
    const route = '/api/requests/{id}/assignment/cancel';
    isDetail = contracts.inline(contracts.openapi, contracts.responseBody('post', route, '200'));
    isError = (status) => contracts.inline(contracts.openapi, responseSchema(contracts.openapi as OpenApi, 'post', route, status));
    pool = createPool(testDatabaseUrl);
    server = createApp({ pool }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => { server.close(); await pool.end(); });

  test('volunteer: 400 with windows; 403 for another resident; 200 reopens (E7, E2); then 409 no_active_assignment', async () => {
    const requestId = await createAssigned();
    const path = `/api/requests/${requestId}/assignment/cancel`;

    const withWindows = await call('POST', path, volunteer, { windows: [{ date: calgaryDay(2), startHour: 10 }] });
    assert.equal(withWindows.status, 400);
    assert.ok(isError('400')(withWindows.body));
    assert.ok((withWindows.body as ErrorBody).error.details?.fields?.windows);

    const byOther = await call('POST', path, otherResident);
    assert.equal(byOther.status, 403);
    assert.ok(isError('403')(byOther.body));

    const cancelled = await call('POST', path, volunteer);
    assert.equal(cancelled.status, 200);
    assert.ok(isDetail(cancelled.body));
    assert.equal((cancelled.body as Detail).status, 'Open');
    assert.deepEqual(await events(requestId),
      ['RequestCreated', 'RequestAssigned', 'RequestAssignmentCancelledVolunteer', 'RequestUpdated']);

    const again = await call('POST', path, volunteer);
    assert.equal(again.status, 409);
    assert.ok(isError('409')(again.body));
    assert.equal((again.body as ErrorBody).error.code, 'no_active_assignment');
  });

  test('resident with new windows and a reason: 200 reopens with those windows (E6, E2)', async () => {
    const requestId = await createAssigned();
    const newWindows = [{ date: calgaryDay(2), startHour: 10 }, { date: calgaryDay(3), startHour: 15 }];

    const cancelled = await call('POST', `/api/requests/${requestId}/assignment/cancel`, owner,
      { reason: 'not home tomorrow', windows: newWindows });
    assert.equal(cancelled.status, 200);
    assert.ok(isDetail(cancelled.body));
    const detail = cancelled.body as Detail;
    assert.equal(detail.status, 'Open');
    assert.equal(detail.assignment?.status, 'Resident_Cancelled');
    assert.deepEqual(detail.windows.map(({ date, startHour }) => ({ date, startHour })), newWindows);
    assert.equal(detail.statusHistory.at(-1)?.reason, 'not home tomorrow');
    assert.deepEqual(await events(requestId),
      ['RequestCreated', 'RequestAssigned', 'RequestAssignmentCancelledResident', 'RequestUpdated']);
  });

  test('volunteer, no window left in the future: Expired (E7, E10); the volunteer gets 404 (issue #368)', async () => {
    const requestId = await createAssigned();
    await moveIntoPast(requestId, 2);

    const cancelled = await call('POST', `/api/requests/${requestId}/assignment/cancel`, volunteer);
    assert.equal(cancelled.status, 404);
    assert.ok(isError('404')(cancelled.body));

    const seen = await call('GET', `/api/requests/${requestId}`, owner);
    assert.equal((seen.body as Detail).status, 'Expired');
    assert.deepEqual(await events(requestId),
      ['RequestCreated', 'RequestAssigned', 'RequestAssignmentCancelledVolunteer', 'RequestExpired']);
  });
});
