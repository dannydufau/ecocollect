import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { createPool } from '../../src/user/db/pool.ts';
import { errorHandler } from '../../src/user/http/errors.ts';
import { register } from '../../src/user/routes/profile-delete.ts';

async function start(t, database, auth) {
  const app = express();
  register(app, { database, auth: () => auth });
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return (id?: string) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/profile`, {
    method: 'DELETE', signal: AbortSignal.timeout(8000),
    headers: id ? { 'X-User-Id': id, 'X-Request-Id': 'deactivation-test' } : {},
  });
}

test('deactivation requires a verified identity before accessing the database', async t => {
  const remove = await start(t, () => assert.fail('must not connect'), {});
  assert.equal((await remove()).status, 401);
});

test('deactivation checks owned work and assignments, compensates failures, and emits one event', {
  skip: !process.env.PROFILE_EDIT_TEST_DATABASE_URL && 'requires scratch PostgreSQL with shared users and requests schemas',
}, async t => {
  const pool = createPool(process.env.PROFILE_EDIT_TEST_DATABASE_URL);
  const ids = Array.from({ length: 3 }, () => 'deactivate-' + randomUUID());
  const [resident, volunteer, failing] = ids;
  const [residentTerms, volunteerTerms, pickup, category, window, assignment] = Array.from({ length: 6 }, () => randomUUID());
  const actions: unknown[][] = [];
  let createDuringDisable = false;
  const status = (value: string, client = pool) => client.query(
    'INSERT INTO requests.status_change (pickup_request_id, changed_at, status) VALUES ($1, clock_timestamp(), $2)', [pickup, value],
  );
  const remove = await start(t, () => ({
    query: pool.query.bind(pool),
    connect: async () => {
      const client = await pool.connect();
      await client.query('SET ROLE ecocollect_user');
      return {
        query(sql: string, params: unknown[]) {
          if (sql.startsWith('UPDATE users.account') && params[0] === failing) throw new Error('Simulated write failure');
          return client.query(sql, params);
        },
        release() { client.release(true); },
      };
    },
  }), {
    async updateUser(id: string, changes: { disabled: boolean }) { actions.push([id, changes.disabled]); },
    async revokeRefreshTokens(id: string) {
      actions.push([id, 'revoke']);
      if (createDuringDisable && id === resident) {
        const request = await pool.connect();
        try {
          await request.query('BEGIN');
          await request.query("SELECT pg_advisory_xact_lock(hashtext('account:' || $1))", [resident]);
          await request.query(
            `INSERT INTO users.terms_acceptance
             VALUES ($1, '00000001-0000-4000-8000-000000000002', $2, now(), 'AT_RESIDENT_REQUEST_CREATION')`,
            [randomUUID(), resident],
          );
          await status('Open', request);
          await request.query('COMMIT');
        } finally { request.release(true); }
      }
    },
  });
  t.mock.method(console, 'error', () => {});
  try {
    await pool.query(`INSERT INTO users.account (account_id, first_name, last_name, public_name, date_of_birth, created_at)
      SELECT id, 'Test', 'Profile', 'Test Name', DATE '1990-01-01', now() FROM unnest($1::text[]) AS id`, [ids]);
    await pool.query(`INSERT INTO users.terms_acceptance
      VALUES ($1, '00000001-0000-4000-8000-000000000002', $3, now(), 'AT_RESIDENT_REQUEST_CREATION'),
             ($2, '00000001-0000-4000-8000-000000000002', $4, now(), 'AT_VOLUNTEER_ACCEPTANCE')`,
    [residentTerms, volunteerTerms, resident, volunteer]);
    await pool.query("INSERT INTO requests.item_category VALUES ($1, 'Test Category', 'Electronics', 1)", [category]);
    await pool.query(`INSERT INTO requests.pickup_request
      (pickup_request_id, category_id, terms_acceptance_id, quantity, estimated_weight_kg, created_at,
       request_seq, pickup_street, pickup_postal_code)
      VALUES ($1, $2, $3, 1, 1, now(), 1, '123 Old St', 'T2P1J9')`, [pickup, category, residentTerms]);
    await pool.query('INSERT INTO requests.pickup_window VALUES ($1, $2, CURRENT_DATE + 1, 15, true)', [window, pickup]);
    await pool.query('INSERT INTO requests.assignment (assignment_id, pickup_window_id, terms_acceptance_id, accepted_at) VALUES ($1,$2,$3,now())',
      [assignment, window, volunteerTerms]);
    for (const state of ['Open', 'Assigned', 'Collected']) {
      await status(state);
      const blocked = await remove(resident);
      assert.equal(blocked.status, 409);
      assert.equal((await blocked.json()).error.code, 'active_work');
    }
    assert.equal((await remove(volunteer)).status, 409);
    await pool.query('UPDATE requests.assignment SET collected_at = now() WHERE assignment_id = $1', [assignment]);
    assert.equal((await remove(volunteer)).status, 409);
    assert.deepEqual(actions, []);
    await pool.query("UPDATE requests.assignment SET ended_at = now(), end_reason = 'Delivered' WHERE assignment_id = $1", [assignment]);
    await status('Cancelled');

    createDuringDisable = true;
    const raced = await remove(resident);
    assert.equal(raced.status, 409);
    assert.equal((await raced.json()).error.code, 'active_work');
    assert.deepEqual(actions.splice(0), [[resident, true], [resident, 'revoke'], [resident, false]]);
    assert.equal((await remove(failing)).status, 500);
    assert.deepEqual(actions.splice(0), [[failing, true], [failing, 'revoke'], [failing, false]]);

    const ok = await remove(volunteer);
    assert.equal(ok.status, 204);
    const cookie = ok.headers.get('set-cookie') ?? '';
    assert.match(cookie, /^session=;/);
    assert.match(cookie, /Expires=Thu, 01 Jan 1970.*HttpOnly.*Secure.*SameSite=Lax/i);
    assert.equal((await remove(volunteer)).status, 404);
    assert.deepEqual(actions, [[volunteer, true], [volunteer, 'revoke']]);
    const { rows: accounts } = await pool.query(
      'SELECT account_id, deactivated_at FROM users.account WHERE account_id = ANY($1::text[])', [ids],
    );
    const times = new Map(accounts.map(row => [row.account_id, row.deactivated_at]));
    assert.equal(times.get(resident), null);
    assert.equal(times.get(failing), null);
    assert.ok(times.get(volunteer) instanceof Date);
    const { rows: events } = await pool.query(
      'SELECT routing_key, payload FROM users.outbox WHERE aggregate_id = ANY($1::text[])', [ids],
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].routing_key, 'user.account.deactivated');
    assert.equal(events[0].payload.traceId, 'deactivation-test');
    assert.deepEqual(events[0].payload.data, { accountId: volunteer, deactivatedAt: times.get(volunteer).toISOString() });
  } finally {
    try {
      await pool.query('DELETE FROM requests.assignment WHERE assignment_id = $1', [assignment]);
      await pool.query('DELETE FROM requests.pickup_window WHERE pickup_window_id = $1', [window]);
      await pool.query('DELETE FROM requests.status_change WHERE pickup_request_id = $1', [pickup]);
      await pool.query('DELETE FROM requests.pickup_request WHERE pickup_request_id = $1', [pickup]);
      await pool.query('DELETE FROM requests.item_category WHERE category_id = $1', [category]);
      await pool.query('DELETE FROM users.outbox WHERE aggregate_id = ANY($1::text[])', [ids]);
      await pool.query('DELETE FROM users.terms_acceptance WHERE account_id = ANY($1::text[])', [ids]);
      await pool.query('DELETE FROM users.account WHERE account_id = ANY($1::text[])', [ids]);
    } finally { await pool.end(); }
  }
});
