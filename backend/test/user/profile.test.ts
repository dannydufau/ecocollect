import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { loadProfile } from '../../src/user/db/profile.ts';
import { createPool } from '../../src/user/db/pool.ts';
import { register } from '../../src/user/routes/profile.ts';
import { HttpError, errorHandler, notFound } from '../../src/user/http/errors.ts';

const require = createRequire(import.meta.url);
const YAML = require('yaml');
const schema = YAML.parse(readFileSync(new URL('../../../contracts/openapi.yaml', import.meta.url), 'utf8')).components.schemas.Profile;
const common = YAML.parse(readFileSync(new URL('../../../contracts/schemas/common.yaml', import.meta.url), 'utf8'));
const resolve = field => field.$ref ? common[field.$ref.split('/').at(-1)] : field;

function assertProfileContract(profile) {
  assert.deepEqual(Object.keys(profile).sort(), [...schema.required].sort());
  for (const [key, field] of Object.entries(schema.properties)) {
    const definition = resolve(field);
    const types = definition.oneOf ? definition.oneOf.map(item => resolve(item).type) : [definition.type];
    const actual = profile[key] === null ? 'null' : Array.isArray(profile[key]) ? 'array' : typeof profile[key];
    assert.ok(types.includes(actual), `${key} has type ${actual}, expected ${types}`);
  }
  assert.match(profile.dateOfBirth, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(profile.createdAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
}

const row = () => ({ account_id: 'test-resident', first_name: 'Avery', last_name: 'Chen', public_name: 'Avery',
  date_of_birth: '1990-01-15', created_at: new Date('2026-11-01T00:00:00Z'),
  is_resident: true, is_volunteer: false, street: '1 Example Street', postal_code: 'T2P1J9', preferred_postal_codes: [] });
const client = data => ({ query: mock.fn(async (_sql: string, _params: unknown[]) => ({ rows: data })) });
const auth = () => ({ getUser: mock.fn(async (_uid: string) => ({ email: 'firebase@example.com' })) });

async function start(t, readProfile) {
  const app = express();
  register(app, readProfile);
  app.use(notFound); app.use(errorHandler);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('resident profile matches the contract and reads email only from Firebase', async () => {
  const database = client([{ ...row(), email: 'do-not-use@example.com', private_column: 'hidden' }]);
  const firebase = auth();
  const profile = await loadProfile(database, firebase, 'test-resident');
  assertProfileContract(profile);
  assert.equal(profile.email, 'firebase@example.com');
  assert.deepEqual(firebase.getUser.mock.calls[0].arguments, ['test-resident']);
  assert.deepEqual(database.query.mock.calls[0].arguments[1], ['test-resident']);
  assert.deepEqual(profile.roles, ['resident']);
  assert.deepEqual(profile.address, { street: '1 Example Street', city: 'Calgary', postalCode: 'T2P1J9' });
  assert.deepEqual(profile.preferredPostalCodes, []);
});

test('volunteer-only and dual-role profiles have the right address and codes', async () => {
  for (const resident of [false, true]) {
    const profile = await loadProfile(client([{ ...row(), is_resident: resident, is_volunteer: true, preferred_postal_codes: ['T2N1N4'] }]), auth(), 'test-resident');
    assertProfileContract(profile);
    assert.deepEqual(profile.roles, resident ? ['resident','volunteer'] : ['volunteer']);
    assert.deepEqual(profile.preferredPostalCodes, ['T2N1N4']);
    assert.equal(profile.address === null, !resident);
  }
});

test('missing database profiles return 404 without querying Firebase', async () => {
  const firebase = auth();
  await assert.rejects(loadProfile(client([]), firebase, 'missing'), error => {
    assert.ok(error instanceof HttpError); assert.equal(error.status, 404); assert.equal(error.code, 'profile_not_found'); return true;
  });
  assert.equal(firebase.getUser.mock.callCount(), 0);
});

test('Firebase failures propagate and incomplete profiles are not returned', async () => {
  const failure = new Error('private Firebase failure');
  await assert.rejects(loadProfile(client([row()]), { getUser: async () => { throw failure; } }, 'test-resident'), error => error === failure);
  for (const [data, firebase] of [[row(), { getUser: async () => ({}) }], [{ ...row(), is_resident: false }, auth()]]) {
    await assert.rejects(loadProfile(client([data]), firebase, 'test-resident'), error => {
      assert.ok(error instanceof HttpError); assert.equal(error.status, 500); return true;
    });
  }
});

test('the route requires a verified user header before loading a profile', async t => {
  const read = mock.fn(async (_id: string) => { throw new Error('Must not load'); });
  const base = await start(t, read);
  const response = await fetch(base + '/api/profile?accountId=someone-else');
  assert.equal(response.status, 401);
  assert.equal(read.mock.callCount(), 0);
});

test('the profile route uses only the caller id and ignores role headers and query targets', async t => {
  const profile = await loadProfile(client([row()]), auth(), 'test-resident');
  const read = mock.fn(async (_id: string) => profile);
  const base = await start(t, read);
  const response = await fetch(base + '/api/profile?accountId=someone-else', { headers: { 'X-User-Id': 'test-resident', 'X-User-Roles': 'admin' } });
  assert.equal(response.status, 200);
  assert.deepEqual(read.mock.calls[0].arguments, ['test-resident']);
  const body = await response.json(); assertProfileContract(body); assert.deepEqual(body, profile);
});

test('profile errors use the shared response without leaking server details', async t => {
  t.mock.method(console, 'error', () => {});
  for (const [error, status, code] of [[new HttpError(404, 'profile_not_found', 'Profile not found.'), 404, 'profile_not_found'], [new Error('private Firebase credentials'), 500, 'internal_error']] as const) {
    const base = await start(t, async () => { throw error; });
    const response = await fetch(base + '/api/profile', { headers: { 'X-User-Id': 'test-resident' } });
    assert.equal(response.status, status);
    const body = await response.json(); assert.equal(body.error.code, code);
    assert.equal(JSON.stringify(body).includes('private Firebase'), false);
  }
});

test('database profile joins cover all roles, isolate accounts and preserve date-only values', {
  skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL to a scratch database loaded with the User scripts',
}, async () => {
  const pool = createPool(process.env.TEST_DATABASE_URL); const db = await pool.connect();
  const tag = randomUUID().slice(0, 8);
  const ids = ['resident', 'volunteer', 'both'].map(role => `${role}-${tag}`);
  const firebase = { getUser: async (uid: string) => ({ email: `${uid}@example.com` }) };
  try {
    await db.query('BEGIN');
    for (const id of ids) await db.query("INSERT INTO users.account VALUES ($1,'Avery','Chen',$1,'1990-01-15','2026-11-01T00:00:00Z',NULL)", [id]);
    for (const id of [ids[0], ids[2]]) await db.query("INSERT INTO users.resident VALUES ($1,$2,'T2P1J9')", [id, `Street for ${id}`]);
    for (const id of [ids[1], ids[2]]) await db.query('INSERT INTO users.volunteer VALUES ($1)', [id]);
    await db.query("INSERT INTO users.volunteer_preferred_postal_code VALUES ($1,'T2P1J9'),($1,'T2N1N4'),($1,'T2T4M3')", [ids[1]]);
    for (const timezone of ['UTC','Pacific/Auckland']) {
      await db.query("SELECT set_config('TimeZone',$1,true)", [timezone]);
      for (let index = 0; index < ids.length; index++) {
        const profile = await loadProfile(db, firebase, ids[index]); assertProfileContract(profile);
        assert.equal(profile.accountId, ids[index]); assert.equal(profile.email, `${ids[index]}@example.com`);
        assert.equal(profile.dateOfBirth, '1990-01-15'); assert.equal(profile.createdAt, '2026-11-01T00:00:00.000Z');
        assert.deepEqual(profile.roles, index === 0 ? ['resident'] : index === 1 ? ['volunteer'] : ['resident','volunteer']);
        assert.equal(profile.address === null, index === 1);
        if (profile.address) assert.equal(profile.address.street, `Street for ${ids[index]}`);
        assert.deepEqual(profile.preferredPostalCodes, index === 1 ? ['T2N1N4','T2P1J9','T2T4M3'] : []);
      }
    }
    await db.query('UPDATE users.account SET deactivated_at=now() WHERE account_id=$1', [ids[0]]);
    for (const id of [ids[0], "x' OR 1=1 --", `missing-${tag}`]) {
      await assert.rejects(loadProfile(db, firebase, id), error => error instanceof HttpError && error.status === 404);
    }
  } finally { await db.query('ROLLBACK'); db.release(); await pool.end(); }
});
