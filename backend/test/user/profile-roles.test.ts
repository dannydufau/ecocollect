import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { createPool } from '../../src/user/db/pool.ts';
import { loadProfile } from '../../src/user/db/profile.ts';
import { errorHandler } from '../../src/user/http/errors.ts';
import { register } from '../../src/user/routes/profile-roles.ts';

const termsId = '00000001-0000-4000-8000-000000000002';
const volunteer = { role: 'volunteer', termsDocumentId: termsId, preferredPostalCodes: ['T2P1J9'] };
const resident = { role: 'resident', termsDocumentId: termsId, address: { street: '123 Private St', postalCode: 'T2P1J9' } };

async function start(t, database, auth) {
  const app = express();
  app.use(express.json());
  register(app, { database, auth: () => auth });
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return async (body: object, accountId?: string) => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/profile/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'roles-test-trace',
        ...(accountId ? { 'X-User-Id': accountId, 'X-User-Roles': 'resident,volunteer' } : {}) },
      body: JSON.stringify(body),
    });
    return [response.status, await response.json()] as const;
  };
}

test('authentication, invalid fields, and malformed terms are handled before connecting', async t => {
  const unused = () => assert.fail('validation must run before database work');
  const post = await start(t, unused, { setCustomUserClaims: unused });
  assert.equal((await post(volunteer))[0], 401);
  for (const [request, fields] of [
    [{ role: 'resident', termsDocumentId: termsId }, ['address']],
    [{ ...volunteer, unexpected: true }, ['unexpected']],
    [{ ...volunteer, preferredPostalCodes: ['T2P1J9', 'T2P1J9', 'A2P1J9', 'T1A0A1'] },
      ['preferredPostalCodes', 'preferredPostalCodes[1]', 'preferredPostalCodes[2]']],
    [{ ...resident, address: { ...resident.address, city: 'Edmonton' } }, ['address.city']],
  ] as const) {
    const [status, body] = await post(request, 'valid-account');
    assert.equal(status, 400);
    assert.deepEqual(Object.keys(body.error.details.fields), fields);
  }
  const [status, body] = await post({ ...volunteer, termsDocumentId: 'malformed' }, 'valid-account');
  assert.equal(status, 409);
  assert.equal(body.error.code, 'terms_outdated');
});

test('role activation persists both directions, serializes duplicates and rolls back failed claims', {
  skip: !process.env.TEST_DATABASE_URL && 'requires scratch PostgreSQL with the User schema and seed',
}, async t => {
  const pool = createPool(process.env.TEST_DATABASE_URL);
  const accounts = Array.from({ length: 3 }, () => 'roles-' + randomUUID());
  const [residentId, volunteerId, failingId] = accounts;
  const claims = [];
  const failure = t.mock.method(console, 'error', () => {});
  const post = await start(t, () => ({
    connect: async () => {
      const client = await pool.connect();
      await client.query('SET ROLE ecocollect_user');
      return {
        query: client.query.bind(client),
        release() { client.release(true); },
      };
    },
  }), {
    async setCustomUserClaims(uid, value) {
      claims.push([uid, value]);
      const result = await pool.query('SELECT 1 FROM users.outbox WHERE aggregate_id = $1', [uid]);
      assert.equal(result.rowCount, 0, 'the relay cannot see the event during the claims call');
      if (uid === failingId) throw new Error('Claims failed');
    },
  });
  try {
    await pool.query(
      `INSERT INTO users.account (account_id, first_name, last_name, public_name, date_of_birth, created_at)
       SELECT id, 'Test', 'Account', 'Visible Name', DATE '1990-01-01', now() FROM unnest($1::text[]) AS id`, [accounts],
    );
    await pool.query(
      "INSERT INTO users.resident (account_id, street, postal_code) VALUES ($1,'456 Private St','T2P1J9'), ($2,'789 Private St','T3A0A1')",
      [residentId, failingId],
    );
    await pool.query('INSERT INTO users.volunteer (account_id) VALUES ($1)', [volunteerId]);

    const [stale, staleBody] = await post({ ...volunteer, termsDocumentId: randomUUID() }, residentId);
    assert.equal(stale, 409);
    assert.equal(staleBody.error.code, 'terms_outdated');
    assert.equal(claims.length, 0);

    const results = await Promise.all([post(volunteer, residentId), post(volunteer, residentId)]);
    results.sort(([a], [b]) => a - b);
    assert.deepEqual(results[0], [200, { roles: ['resident', 'volunteer'] }]);
    assert.equal(results[1][0], 409);
    assert.equal(results[1][1].error.code, 'role_already_active');
    assert.deepEqual(await post(resident, volunteerId), [200, { roles: ['volunteer', 'resident'] }]);
    assert.equal((await post(volunteer, failingId))[0], 500);
    assert.equal(failure.mock.callCount(), 1);
    assert.deepEqual(claims, [
      [residentId, { roles: ['resident', 'volunteer'] }],
      [volunteerId, { roles: ['volunteer', 'resident'] }],
      ...Array.from({ length: 3 }, () => [failingId, { roles: ['resident', 'volunteer'] }]),
    ]);

    const profileAuth = { getUser: async () => ({ email: 'test@example.com' }) };
    const residentProfile = await loadProfile(pool, profileAuth, residentId);
    assert.deepEqual(residentProfile.roles, ['resident', 'volunteer']);
    assert.deepEqual(residentProfile.preferredPostalCodes, ['T2P1J9']);
    assert.equal((await loadProfile(pool, profileAuth, volunteerId)).address?.street, resident.address.street);
    const failedProfile = await loadProfile(pool, profileAuth, failingId);
    assert.deepEqual(failedProfile.roles, ['resident']);
    assert.deepEqual(failedProfile.preferredPostalCodes, []);
    assert.equal((await pool.query('SELECT 1 FROM users.volunteer_preferred_postal_code WHERE account_id = $1', [failingId])).rowCount, 0);

    const accepted = await pool.query(
      'SELECT account_id, type, terms_document_id FROM users.terms_acceptance WHERE account_id = ANY($1::text[])', [accounts],
    );
    assert.deepEqual(new Map(accepted.rows.map(row => [row.account_id, [row.type, row.terms_document_id]])), new Map([
      [residentId, ['AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION', termsId]],
      [volunteerId, ['AT_RESIDENT_REGISTRATION_OR_ACTIVATION', termsId]],
    ]));
    const { rows: events } = await pool.query(
      'SELECT aggregate_id, routing_key, payload FROM users.outbox WHERE aggregate_id = ANY($1::text[])', [accounts],
    );
    assert.equal(events.length, 2);
    for (const row of events) {
      assert.equal(row.routing_key, 'user.profile.updated');
      assert.equal(row.payload.traceId, 'roles-test-trace');
      assert.deepEqual(row.payload.data, {
        accountId: row.aggregate_id, changed: ['roles'], publicName: 'Visible Name',
        roles: row.aggregate_id === residentId ? ['resident', 'volunteer'] : ['volunteer', 'resident'],
      });
    }
  } finally {
    try {
      for (const table of ['outbox', 'terms_acceptance', 'volunteer_preferred_postal_code', 'resident', 'volunteer', 'account']) {
        const id = table === 'outbox' ? 'aggregate_id' : 'account_id';
        await pool.query(`DELETE FROM users.${table} WHERE ${id} = ANY($1::text[])`, [accounts]);
      }
    } finally { await pool.end(); }
  }
});
