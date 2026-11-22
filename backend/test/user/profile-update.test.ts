import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import express from 'express';
import { createPool } from '../../src/user/db/pool.ts';
import { errorHandler } from '../../src/user/http/errors.ts';
import { register } from '../../src/user/routes/profile-update.ts';

async function start(t, database) {
  const app = express();
  app.use(express.json());
  register(app, { database, auth: () => ({ getUser: async () => ({ email: 'profile@example.test' }) }) });
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return async (body: object, id?: string) => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/profile`, {
      method: 'PATCH',
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'profile-edit-test',
        ...(id ? { 'X-User-Id': id, 'X-User-Roles': 'resident,volunteer' } : {}) },
      body: JSON.stringify(body),
    });
    return [response.status, await response.json()] as const;
  };
}

test('profile editing requires an identity and validates fields before accessing PostgreSQL', async t => {
  const patch = await start(t, () => assert.fail('invalid requests must never connect'));
  assert.equal((await patch({ publicName: 'New Name' }))[0], 401);
  for (const [request, fields] of [
    [{}, ['body']],
    [{ email: 'different@example.test' }, ['email']],
    [{ publicName: ' ' }, ['publicName']],
    [{ address: { street: 'Test St', postalCode: 'invalid' } }, ['address.postalCode']],
    [{ preferredPostalCodes: ['T2P1J9', 'T2P1J9'] }, ['preferredPostalCodes[1]']],
  ] as const) {
    const [status, body] = await patch(request, 'profile-test');
    assert.equal(status, 400);
    assert.deepEqual(Object.keys(body.error.details.fields), fields);
  }
});

test('the shared schema enforces role and latest request state, and the event omits address data', {
  skip: !process.env.PROFILE_EDIT_TEST_DATABASE_URL && 'requires scratch PostgreSQL with shared users and requests schemas',
}, async t => {
  const pool = createPool(process.env.PROFILE_EDIT_TEST_DATABASE_URL);
  const ids = ['dual-' + randomUUID(), 'vol-' + randomUUID()];
  const [dual, volunteer] = ids;
  const acceptance = randomUUID(), pickup = randomUUID(), category = randomUUID();
  const patch = await start(t, () => ({
    connect: async () => {
      const client = await pool.connect();
      await client.query('SET ROLE ecocollect_user');
      return { query: client.query.bind(client), release() { client.release(true); } };
    },
  }));
  const address = { street: '987 Private St', postalCode: 'T3A0B1' };
  try {
    await pool.query(`INSERT INTO users.account (account_id, first_name, last_name, public_name, date_of_birth, created_at)
      SELECT id, 'Test', 'Profile', 'Original Name', DATE '1990-01-01', now() FROM unnest($1::text[]) AS id`, [ids]);
    await pool.query("INSERT INTO users.resident VALUES ($1, '123 Old St', 'T2P1J9')", [dual]);
    await pool.query('INSERT INTO users.volunteer SELECT unnest($1::text[])', [ids]);
    await pool.query("INSERT INTO users.volunteer_preferred_postal_code VALUES ($1, 'T2P1J9')", [dual]);
    await pool.query(`INSERT INTO users.terms_acceptance
      VALUES ($1, '00000001-0000-4000-8000-000000000002', $2, now(), 'AT_RESIDENT_REQUEST_CREATION')`, [acceptance, dual]);
    await pool.query("INSERT INTO requests.item_category VALUES ($1, 'Test Category', 'Electronics', 1)", [category]);
    await pool.query(`INSERT INTO requests.pickup_request
      (pickup_request_id, category_id, terms_acceptance_id, quantity, estimated_weight_kg, created_at,
       request_seq, pickup_street, pickup_postal_code)
      VALUES ($1, $2, $3, 1, 1, now(), 1, '123 Old St', 'T2P1J9')`, [pickup, category, acceptance]);
    const state = (value: string) => pool.query(
      'INSERT INTO requests.status_change (pickup_request_id, changed_at, status) VALUES ($1, clock_timestamp(), $2)', [pickup, value],
    );
    const blocked = await patch({ address }, volunteer);
    assert.equal(blocked[0], 403);
    assert.equal(blocked[1].error.code, 'role_required');
    for (const status of ['Open', 'Assigned']) {
      await state(status);
      const locked = await patch({ address, publicName: 'Must Not Persist' }, dual);
      assert.equal(locked[0], 409);
      assert.equal(locked[1].error.code, 'address_locked');
    }
    await state('Cancelled');
    const creator = await pool.connect();
    let addressEdit: ReturnType<typeof patch> | undefined;
    try {
      await creator.query('BEGIN');
      await creator.query("SELECT pg_advisory_xact_lock(hashtext('address:' || $1))", [dual]);
      const edited = await patch({ publicName: 'New Name', preferredPostalCodes: ['T3A0B1'] }, dual);
      assert.equal(edited[0], 200);
      assert.equal(edited[1].publicName, 'New Name');
      assert.deepEqual(edited[1].preferredPostalCodes, ['T3A0B1']);
      assert.deepEqual(edited[1].address, { street: '123 Old St', postalCode: 'T2P1J9', city: 'Calgary' });
      await creator.query(
        "INSERT INTO requests.status_change (pickup_request_id, changed_at, status) VALUES ($1, clock_timestamp(), 'Open')",
        [pickup],
      );
      addressEdit = patch({ address }, dual);
      // Observe the real PostgreSQL wait before committing the simulated Request transaction.
      const deadline = Date.now() + 4000;
      for (;;) {
        const { rows: [{ waiting }] } = await pool.query(
          `SELECT EXISTS (
             SELECT 1 FROM pg_locks
             WHERE locktype = 'advisory' AND NOT granted AND pg_backend_pid() <> pid
               AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
               AND objsubid = 1
               AND classid::bigint = ((hashtext('address:' || $1)::bigint >> 32) & 4294967295)
               AND objid::bigint = (hashtext('address:' || $1)::bigint & 4294967295)
           ) AS waiting`, [dual],
        );
        if (waiting) break;
        assert.ok(Date.now() < deadline, 'the address edit should wait for the Request transaction');
        await delay(25);
      }
      await creator.query('COMMIT');
    } catch (error) {
      await creator.query('ROLLBACK');
      await addressEdit?.catch(() => {});
      throw error;
    } finally {
      creator.release();
    }
    if (!addressEdit) assert.fail('expected an address edit');
    const afterCreate = await addressEdit;
    assert.equal(afterCreate[0], 409);
    assert.equal(afterCreate[1].error.code, 'address_locked');
    await state('Cancelled');
    const unlocked = await patch({ address, preferredPostalCodes: [] }, dual);
    assert.equal(unlocked[0], 200);
    assert.deepEqual(unlocked[1].address, { ...address, city: 'Calgary' });
    assert.deepEqual(unlocked[1].preferredPostalCodes, []);
    const { rows } = await pool.query(
      'SELECT routing_key, payload FROM users.outbox WHERE aggregate_id = ANY($1::text[]) ORDER BY insertion_order', [ids],
    );
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(row => [row.routing_key, row.payload.traceId, row.payload.data]), [
      ['user.profile.updated', 'profile-edit-test', {
        accountId: dual, changed: ['publicName', 'preferredPostalCodes'], publicName: 'New Name', roles: ['resident', 'volunteer'],
      }],
      ['user.profile.updated', 'profile-edit-test', {
        accountId: dual, changed: ['address', 'preferredPostalCodes'], publicName: 'New Name', roles: ['resident', 'volunteer'],
      }],
    ]);
  } finally {
    try {
      await pool.query('DELETE FROM requests.status_change WHERE pickup_request_id = $1', [pickup]);
      await pool.query('DELETE FROM requests.pickup_request WHERE pickup_request_id = $1', [pickup]);
      await pool.query('DELETE FROM requests.item_category WHERE category_id = $1', [category]);
      for (const table of ['outbox', 'terms_acceptance', 'volunteer_preferred_postal_code', 'resident', 'volunteer', 'account']) {
        const id = table === 'outbox' ? 'aggregate_id' : 'account_id';
        await pool.query(`DELETE FROM users.${table} WHERE ${id} = ANY($1::text[])`, [ids]);
      }
    } finally { await pool.end(); }
  }
});
