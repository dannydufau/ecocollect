import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { createPool } from '../../src/user/db/pool.ts';
import { errorHandler, notFound } from '../../src/user/http/errors.ts';
import { register } from '../../src/user/routes/demo-session.ts';

const termsId = '00000001-0000-4000-8000-000000000002';

async function start(t, options) {
  const app = express();
  register(app, options);
  app.use(notFound);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return (forwarded?: string) => fetch(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/demo/session`, {
      method: 'POST', headers: forwarded ? { 'X-Forwarded-For': forwarded } : {},
    },
  );
}

function fakeAuth() {
  const actions = [];
  return {
    actions,
    async createUser(input) { actions.push(['create', input]); },
    async setCustomUserClaims(uid, value) { actions.push(['claims', uid, value]); },
    async createCustomToken(uid) { actions.push(['token', uid]); return 'custom-token'; },
    async deleteUser(uid) { actions.push(['delete', uid]); },
  };
}

function fakeDatabase() {
  return {
    connect: async () => ({
      async query(sql: string) {
        return { rows: sql.includes('FROM users.terms_document')
          ? [{ terms_document_id: termsId, content: 'Terms', published_at: new Date() }] : [] };
      },
      release() {},
    }),
  };
}

test('the route is absent in normal mode', async t => {
  const unused = () => assert.fail('a disabled route must not create accounts');
  const post = await start(t, { enabled: false, database: unused, auth: unused });
  assert.equal((await post()).status, 404);
});

test('the rate limit ignores forwarded headers from direct callers and resets after a minute', async t => {
  let time = 0;
  const auth = fakeAuth();
  const post = await start(t, { enabled: true, database: fakeDatabase, auth: () => auth, now: () => time, proxyAddress: '127.0.0.2' });
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal((await post(`192.0.2.${attempt}`)).status, 200);
  }
  const limited = await post('192.0.2.10');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
  assert.equal((await limited.json()).error.code, 'rate_limited');
  assert.equal(auth.actions.filter(([type]) => type === 'create').length, 5);
  time = 60_000;
  assert.equal((await post()).status, 200);
});

test('the configured proxy uses the nearest forwarded address for independent limits', async t => {
  const post = await start(t, { enabled: true, database: fakeDatabase, auth: fakeAuth, proxyAddress: '127.0.0.1' });
  for (let attempt = 1; attempt <= 5; attempt++) assert.equal((await post('192.0.2.1')).status, 200);
  assert.equal((await post('203.0.113.1, 192.0.2.1')).status, 429);
  assert.equal((await post('192.0.2.2')).status, 200);
});

test('a failed database write removes the created Firebase user and withholds the token', async t => {
  t.mock.method(console, 'error', () => {});
  const auth = fakeAuth();
  const post = await start(t, { enabled: true, auth: () => auth, database: () => ({
    connect: async () => { throw new Error('Database not available'); },
  }) });
  const response = await post();
  assert.equal(response.status, 500);
  assert.equal((await response.json()).customToken, undefined);
  assert.deepEqual(auth.actions.map(([action]) => action), ['create', 'claims', 'token', 'delete']);
  assert.equal(auth.actions[0][1].emailVerified, true);
  assert.equal(auth.actions[3][1], auth.actions[0][1].uid);
});

test('the restricted role can persist a demo account, both roles and both terms acceptances', {
  skip: !process.env.TEST_DATABASE_URL && 'requires scratch PostgreSQL with the User schema and seed',
}, async t => {
  const pool = createPool(process.env.TEST_DATABASE_URL);
  const auth = fakeAuth();
  const post = await start(t, {
    enabled: true, auth: () => auth,
    database: () => ({ connect: async () => {
      const client = await pool.connect();
      await client.query('SET ROLE ecocollect_user');
      return { query: client.query.bind(client), release() { client.release(true); } };
    } }),
  });
  try {
    const response = await post();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { customToken: 'custom-token' });
    const uid = auth.actions[0][1].uid;
    assert.match(uid, /^demo-[a-f0-9-]{36}$/);
    assert.deepEqual(auth.actions, [
      ['create', { uid, email: `${uid}@demo.ecocollect.test`, displayName: 'Demo Visitor', emailVerified: true }],
      ['claims', uid, { roles: ['resident', 'volunteer'] }], ['token', uid],
    ]);
    const { rows: [profile] } = await pool.query(
      `SELECT a.public_name, r.street, r.postal_code, p.postal_code AS preferred_code
       FROM users.account a JOIN users.resident r USING (account_id)
       JOIN users.volunteer v USING (account_id)
       JOIN users.volunteer_preferred_postal_code p USING (account_id) WHERE a.account_id = $1`, [uid],
    );
    assert.equal(profile.public_name, 'Demo Visitor');
    assert.equal(profile.street, '100 Demo Example SW');
    assert.match(profile.postal_code, /^T[0-9][A-Z][0-9][A-Z][0-9]$/);
    assert.equal(profile.postal_code, profile.preferred_code);
    const { rows: acceptances } = await pool.query(
      'SELECT terms_document_id, type FROM users.terms_acceptance WHERE account_id = $1 ORDER BY type', [uid],
    );
    assert.deepEqual(acceptances, [
      { terms_document_id: termsId, type: 'AT_RESIDENT_REGISTRATION_OR_ACTIVATION' },
      { terms_document_id: termsId, type: 'AT_VOLUNTEER_REGISTRATION_OR_ACTIVATION' },
    ]);
  } finally {
    try {
      const uid = auth.actions[0]?.[1].uid;
      if (uid) for (const table of ['terms_acceptance', 'volunteer_preferred_postal_code', 'resident', 'volunteer', 'account']) {
        await pool.query(`DELETE FROM users.${table} WHERE account_id = $1`, [uid]);
      }
    } finally { await pool.end(); }
  }
});
