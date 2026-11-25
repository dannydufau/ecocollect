// Shared setup for the Request Service tests against the test database. Each
// test file starts one app on its own pool (startApp), checks the answers
// against openapi.yaml (contractChecks), and builds the requests it changes
// through the API (createOpen, createAssigned), so it runs again without a rebuild.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { createApp, type AppDeps } from '../../src/request/app.ts';
import { createPool } from '../../src/request/db/pool.ts';
import { responseSchema, type OpenApi } from './contract.ts';
import { testAdminDatabaseUrl, testDatabaseUrl } from './db.ts';
import {
  SEED_CATEGORY_ID, SEED_CURRENT_TERMS_ID, SEED_OTHER_RESIDENT_ONLY_ID, SEED_OTHER_VOLUNTEER_ID,
  SEED_RESIDENT_ONLY_ID, SEED_VOLUNTEER_ID,
} from './seed.ts';

// The gateway headers of one caller.
export type Caller = Record<string, string>;
export const owner: Caller = { 'X-User-Id': SEED_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
export const otherResident: Caller = { 'X-User-Id': SEED_OTHER_RESIDENT_ONLY_ID, 'X-User-Roles': 'resident' };
export const volunteer: Caller = { 'X-User-Id': SEED_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };
export const otherVolunteer: Caller = { 'X-User-Id': SEED_OTHER_VOLUNTEER_ID, 'X-User-Roles': 'volunteer' };

export type ErrorBody = { error: { code: string; details?: { fields?: Record<string, string> } } };
export type Answer = { status: number; body: unknown };
export type Call = (method: string, path: string, caller: Caller, body?: unknown) => Promise<Answer>;
export type App = ReturnType<typeof startApp>;
export type ContractChecks = Awaited<ReturnType<typeof contractChecks>>;

// Starts the app on a free port, with its own pool. Call it in before(), not at
// the top of a file: a skipped describe runs no hooks, so no pool is made
// without REQUEST_TEST_DATABASE_URL.
export function startApp(options: Omit<AppDeps, 'pool'> = {}) {
  const pool = createPool(testDatabaseUrl);
  const server = createApp({ ...options, pool }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Sends one request as `caller`, with `body` as JSON when given. An empty
  // answer (a 204) has the body undefined.
  const call: Call = async (method, path, caller, body) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { ...caller, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) as unknown : undefined };
  };

  // Stops the server and closes the pool.
  const close = async (): Promise<void> => { server.close(); await pool.end(); };

  return { pool, base, call, close };
}

// Validators for one route's responses in openapi.yaml: isOk checks the
// success body (okStatus), isError(status) an error body, and expectError
// asserts an answer's status, error body and code (`message` names the case
// when a test loops over several). The contracts are imported
// here, not at the top: the validator needs `npm ci` in contracts/, and a
// skipped run shouldn't need it.
export async function contractChecks(method: string, route: string, okStatus = '200') {
  const { default: contracts } = await import('../../../contracts/test/helpers.js');
  const isError = (status: string): (body: unknown) => boolean =>
    contracts.inline(contracts.openapi, responseSchema(contracts.openapi as OpenApi, method, route, status));
  const expectError = (res: Answer, status: number, code: string, message?: string): void => {
    assert.equal(res.status, status, message);
    assert.ok(isError(String(status))(res.body), message);
    assert.equal((res.body as ErrorBody).error.code, code, message);
  };
  return { isOk: isError(okStatus), isError, expectError };
}

// A day in Calgary, `days` after today, as YYYY-MM-DD.
export function calgaryDay(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date());
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

// A new Open request of `resident`'s (Q4), with one window tomorrow at 12:00.
export async function createOpen(call: Call, resident: Caller): Promise<string> {
  const created = await call('POST', '/api/requests', resident, {
    items: [{ categoryId: SEED_CATEGORY_ID, quantity: 1 }],
    windows: [{ date: calgaryDay(1), startHour: 12 }],
    termsDocumentId: SEED_CURRENT_TERMS_ID,
  });
  assert.equal(created.status, 201);
  return (created.body as { requests: { requestId: string }[] }).requests[0]!.requestId;
}

// A new Assigned request: `resident` creates it (Q4), `volunteer` reads its
// window (Q8) and accepts it (Q11).
export async function createAssigned(call: Call, resident: Caller, volunteer: Caller): Promise<string> {
  const requestId = await createOpen(call, resident);
  const seen = await call('GET', `/api/requests/${requestId}`, volunteer);
  const windowId = (seen.body as { windows: { windowId: string }[] }).windows[0]!.windowId;
  const accepted = await call('POST', `/api/requests/${requestId}/assignment`, volunteer,
    { windowId, termsDocumentId: SEED_CURRENT_TERMS_ID });
  assert.equal(accepted.status, 201);
  return requestId;
}

// The events of one request, in order.
export async function events(pool: pg.Pool, requestId: string): Promise<string[]> {
  const { rows } = await pool.query<{ event_type: string }>(
    'SELECT event_type FROM requests.outbox WHERE pickup_request_id = $1 ORDER BY request_seq', [requestId]);
  return rows.map((r) => r.event_type);
}

// Moves a request's whole timeline `days` into the past (the API only takes
// future windows). Everything moves together, so check_request still holds:
// the acceptances (creation and assignments), accepted_at, created_at, the
// status history and the window dates. 2 days puts tomorrow's window in the
// past and stays after the current terms (published 40 days before the seed).
// Runs as the admin login on its own connection (see db.ts): the service login
// may not change users.terms_acceptance.
export async function moveIntoPast(requestId: string, days: number): Promise<void> {
  const client = new pg.Client({ connectionString: testAdminDatabaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    // Find the course tables without a schema prefix, until COMMIT.
    await client.query(`SET LOCAL search_path TO requests, users`);
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
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}
