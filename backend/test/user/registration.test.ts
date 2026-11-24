import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { createPool } from '../../src/user/db/pool.ts';
import { errorHandler } from '../../src/user/http/errors.ts';
import { register } from '../../src/user/routes/accounts.ts';

const termsId = '00000001-0000-4000-8000-000000000002';
const now = new Date('2026-11-20T12:00:00Z');
const resident = {
  username: 'registration-test', email: 'registration@example.com', password: 'example-password',
  firstName: 'Test', lastName: 'Resident', publicName: 'Test Resident', dateOfBirth: '1990-01-01',
  role: 'resident', termsDocumentId: termsId, address: { street: '123 Example St', postalCode: 'T2P1J9' },
};

const firebaseError = (code: string) => Object.assign(new Error('Firebase rejected the password.'), { code });

function fakeAuth(createError?: string) {
  const actions: string[] = [];
  return {
    actions,
    async createUser(input) {
      actions.push('create');
      assert.equal(input.displayName, resident.publicName);
      if (createError) throw firebaseError(createError);
      return { uid: input.uid };
    },
    async getUser() { return { uid: resident.username, metadata: { creationTime: now.toISOString() } }; },
    async getUserByEmail() { return { uid: resident.username, metadata: { creationTime: now.toISOString() } }; },
    async setCustomUserClaims(_uid, claims) { actions.push(...claims.roles); },
    async deleteUser() { actions.push('delete'); },
  };
}

function fakeDatabase(writeError?: unknown) {
  const statements: string[] = [];
  const query = async (sql: string) => {
    statements.push(sql);
    if (sql === 'SELECT now() AS now') return { rows: [{ now }] };
    if (sql.includes('FROM users.terms_document')) {
      return { rows: [{ terms_document_id: termsId, content: 'Terms', published_at: now }] };
    }
    if (sql.startsWith('INSERT INTO users.resident') && writeError) throw writeError;
    return { rows: [] };
  };
  return { statements, query, connect: async () => ({ query, release() {} }) };
}

async function start(t, database, auth) {
  const app = express();
  app.use(express.json());
  register(app, { database: () => database, auth: () => auth });
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return async (body: object) => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/accounts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': 'other-user' },
      body: JSON.stringify(body),
    });
    return [response.status, await response.json()] as const;
  };
}

test('underage and stale or malformed terms are rejected before Firebase or writes', async t => {
  const database = fakeDatabase();
  const auth = fakeAuth();
  const post = await start(t, database, auth);
  const [status, body] = await post({ ...resident, dateOfBirth: '2010-01-01' });
  assert.equal(status, 400);
  assert.deepEqual(Object.keys(body.error.details.fields), ['dateOfBirth']);
  for (const id of ['invalid', randomUUID()]) {
    const [status, body] = await post({ ...resident, termsDocumentId: id });
    assert.equal(status, 409);
    assert.equal(body.error.code, 'terms_outdated');
  }
  assert.deepEqual(auth.actions, []);
  assert.ok(database.statements.every(sql => sql.startsWith('SELECT')));
});

test('terms changed during Firebase provisioning abort registration and clean up the Firebase account', async t => {
  const database = fakeDatabase();
  const query = database.query;
  let termsReads = 0;
  const transactionQuery = async (sql: string) => {
    const result = await query(sql);
    if (sql.includes('FROM users.terms_document') && ++termsReads === 1) {
      return { rows: [{ terms_document_id: randomUUID(), content: 'New terms', published_at: now }] };
    }
    return result;
  };
  database.connect = async () => ({ query: transactionQuery, release() {} });
  const auth = fakeAuth();
  const post = await start(t, database, auth);
  const [status, body] = await post(resident);
  assert.equal(status, 409);
  assert.equal(body.error.code, 'terms_outdated');
  assert.ok(!database.statements.some(sql => sql.startsWith('INSERT')));
  assert.deepEqual(auth.actions, ['create', 'resident', 'delete']);
});

for (const [firebaseCode, status, code] of [
  ['auth/uid-already-exists', 409, 'username_taken'],
  ['auth/email-already-exists', 409, 'email_taken'],
  ['auth/invalid-password', 400, 'validation_failed'],
] as const) {
  test(`registration maps ${firebaseCode} before opening a write transaction`, async t => {
    const database = fakeDatabase();
    const post = await start(t, database, fakeAuth(firebaseCode));
    const [actualStatus, body] = await post(resident);
    assert.equal(actualStatus, status);
    assert.equal(body.error.code, code);
    if (status === 400) assert.deepEqual(body.error.details.fields, { password: 'Firebase rejected the password.' });
    assert.ok(!database.statements.includes('BEGIN'));
  });
}

for (const [failure, status, code] of [
  [{ code: '23514', constraint: 'resident_ck2' }, 400, 'validation_failed'],
  [new Error('Database write failed'), 500, 'internal_error'],
] as const) {
  test(`failed registration rolls back and removes the Firebase user (${status})`, async t => {
    t.mock.method(console, 'error', () => {});
    const database = fakeDatabase(failure);
    const auth = fakeAuth();
    const post = await start(t, database, auth);
    const [actualStatus, body] = await post(resident);
    assert.equal(actualStatus, status);
    assert.equal(body.error.code, code);
    if (status === 400) assert.deepEqual(Object.keys(body.error.details.fields), ['address.postalCode']);
    assert.equal(database.statements.at(-1), 'ROLLBACK');
    assert.ok(!database.statements.includes('COMMIT'));
    assert.deepEqual(auth.actions, ['create', 'resident', 'delete']);
  });
}

test('an unconfirmed commit keeps the Firebase account in case the database committed', async t => {
  t.mock.method(console, 'error', () => {});
  const database = fakeDatabase();
  database.connect = async () => ({
    async query(sql: string) {
      if (sql === 'COMMIT') throw new Error('Connection lost');
      return database.query(sql);
    },
    release() {},
  });
  const auth = fakeAuth();
  const post = await start(t, database, auth);
  const [status, body] = await post(resident);
  assert.equal(status, 500);
  assert.match(body.error.message, /could not confirm registration/);
  assert.deepEqual(auth.actions, ['create', 'resident']);
});

test('registration persists residents, volunteers and terms without an outbox event', {
  skip: !process.env.TEST_DATABASE_URL && 'requires scratch PostgreSQL with the User schema and seed',
}, async t => {
  const pool = createPool(process.env.TEST_DATABASE_URL);
  const accounts = [`r-${randomUUID()}`, `v-${randomUUID()}`];
  const auth = fakeAuth();
  const post = await start(t, pool, auth);
  try {
    assert.deepEqual(await post({ ...resident, username: accounts[0] }), [201, { accountId: accounts[0], roles: ['resident'] }]);
    const { address, ...volunteer } = resident;
    assert.deepEqual(await post({
      ...volunteer, username: accounts[1], role: 'volunteer', preferredPostalCodes: ['T2P1J9', 'T3A0A1'],
    }), [201, { accountId: accounts[1], roles: ['volunteer'] }]);
    assert.deepEqual(auth.actions, ['create', 'resident', 'create', 'volunteer']);
    const { rows } = await pool.query(
      `SELECT a.account_id, a.public_name, r.street, r.postal_code, v.account_id IS NOT NULL AS volunteer,
              ta.type, ta.terms_document_id, a.created_at = ta.accepted_at AS same_time,
              ARRAY(SELECT postal_code FROM users.volunteer_preferred_postal_code p
                    WHERE p.account_id = a.account_id ORDER BY postal_code) AS preferred
       FROM users.account a LEFT JOIN users.resident r USING (account_id)
       LEFT JOIN users.volunteer v USING (account_id)
       JOIN users.terms_acceptance ta USING (account_id)
       WHERE a.account_id = ANY($1::text[]) ORDER BY a.account_id`,
      [accounts],
    );
    assert.deepEqual(rows, [
      { account_id: accounts[0], public_name: resident.publicName, street: address.street, postal_code: address.postalCode,
        volunteer: false, type: 'AT_RESIDENT_REGISTRATION_OR_ACTIVATION', terms_document_id: termsId, same_time: true, preferred: [] },
      { account_id: accounts[1], public_name: resident.publicName, street: null, postal_code: null,
        volunteer: true, type: 'AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION', terms_document_id: termsId, same_time: true, preferred: ['T2P1J9', 'T3A0A1'] },
    ]);
    assert.equal((await pool.query('SELECT 1 FROM users.outbox WHERE aggregate_id = ANY($1::text[])', [accounts])).rowCount, 0);
  } finally {
    try {
      for (const table of ['terms_acceptance', 'resident', 'volunteer_preferred_postal_code', 'volunteer', 'account']) {
        await pool.query(`DELETE FROM users.${table} WHERE account_id = ANY($1::text[])`, [accounts]);
      }
    } finally {
      await pool.end();
    }
  }
});
