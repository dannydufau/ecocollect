import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createPool } from '../../src/user/db/pool.ts';
import { register, loadPublicProfile } from '../../src/user/routes/public-profile.ts';
import { HttpError, errorHandler, notFound } from '../../src/user/http/errors.ts';

const require = createRequire(import.meta.url);
const YAML = require('yaml');
const schema = YAML.parse(readFileSync(new URL('../../../contracts/openapi.yaml', import.meta.url), 'utf8')).components.schemas.PublicProfile;
const expected = { accountId: 'test-resident', publicName: 'Avery', roles: ['resident'], memberSince: '2026-11-01T00:00:00.000Z' };
const row = () => ({ account_id: expected.accountId, public_name: expected.publicName, created_at: new Date(expected.memberSince), is_resident: true, is_volunteer: false });
const client = rows => ({ query: mock.fn(async (_sql: string, _params: unknown[]) => ({ rows })) });

function assertPublicProfile(profile) {
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(profile).sort(), [...schema.required].sort());
  assert.equal(typeof profile.accountId, 'string'); assert.equal(typeof profile.publicName, 'string');
  assert.ok(Array.isArray(profile.roles)); assert.ok(profile.roles.length >= 1 && profile.roles.length <= 2);
  assert.ok(profile.roles.every(role => role === 'resident' || role === 'volunteer'));
  assert.match(profile.memberSince, /^\d{4}-\d{2}-\d{2}T.*Z$/);
}

async function start(t, readProfile) {
  const app = express(); register(app, readProfile); app.use(notFound); app.use(errorHandler);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('the public response has exactly the contract fields and excludes private data', async () => {
  const db = client([{ ...row(), email: 'private@example.com', first_name: 'Secret', date_of_birth: '1990-01-01', street: 'Private street' }]);
  const profile = await loadPublicProfile(db, expected.accountId); assertPublicProfile(profile);
  assert.deepEqual(profile, expected);
  assert.deepEqual(db.query.mock.calls[0].arguments[1], [expected.accountId]);
  assert.equal(JSON.stringify(profile).includes('private'), false);
});

test('the public response supports volunteer-only and dual-role membership', async () => {
  for (const resident of [false, true]) {
    const profile = await loadPublicProfile(client([{ ...row(), is_resident: resident, is_volunteer: true }]), expected.accountId);
    assertPublicProfile(profile); assert.deepEqual(profile.roles, resident ? ['resident','volunteer'] : ['volunteer']);
  }
});

test('invalid account ids return 404 before making a database query', async () => {
  const db = client([]);
  for (const id of ['', 'ab', 'a'.repeat(51), 'Uppercase', 'a b', "x' OR 1=1 --", 'abc\n', null, ['abc']]) {
    await assert.rejects(loadPublicProfile(db, id), error => error instanceof HttpError && error.status === 404 && error.code === 'profile_not_found');
  }
  assert.equal(db.query.mock.callCount(), 0);
});

test('missing and incomplete profiles use the same 404 response', async () => {
  for (const rows of [[], [{ ...row(), is_resident: false }]]) {
    await assert.rejects(loadPublicProfile(client(rows), expected.accountId), error => error instanceof HttpError && error.status === 404 && error.message === 'Profile not found.');
  }
});

test('the HTTP route is public and ignores identity headers and query targets', async t => {
  const read = mock.fn(async (_id: string) => expected);
  const base = await start(t, read);
  for (const headers of [{}, { Authorization: 'Bearer invalid', 'X-User-Id': 'another-user', 'X-User-Roles': 'admin' }]) {
    const response = await fetch(base + '/api/public/profiles/test-resident?accountId=another-user', { headers });
    assert.equal(response.status, 200); const body = await response.json(); assertPublicProfile(body); assert.deepEqual(body, expected);
  }
  assert.deepEqual(read.mock.calls.map(call => call.arguments), [['test-resident'], ['test-resident']]);
});

test('invalid and unknown HTTP ids are indistinguishable', async t => {
  const read = mock.fn(id => loadPublicProfile(client([]), id));
  const base = await start(t, read);
  for (const id of ['Uppercase', 'ab', 'unknown-user']) {
    const response = await fetch(base + '/api/public/profiles/' + id);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: { code: 'profile_not_found', message: 'Profile not found.' } });
  }
  assert.deepEqual(read.mock.calls.map(call => call.arguments), [['unknown-user']]);
});

test('profile stats and unsupported methods do not reach the User lookup', async t => {
  const read = mock.fn(async (_id: string) => expected); const base = await start(t, read);
  for (const [method,path] of [['GET','/api/public/profiles/test-resident/stats'],['POST','/api/public/profiles/test-resident']]) {
    assert.equal((await fetch(base + path, { method })).status, 404);
  }
  assert.equal(read.mock.callCount(), 0);
});

test('database failures return a safe JSON 500', async t => {
  t.mock.method(console, 'error', () => {});
  const base = await start(t, async () => { throw new Error('private database credentials'); });
  const response = await fetch(base + '/api/public/profiles/test-resident');
  assert.equal(response.status, 500); const body = await response.json();
  assert.equal(body.error.code, 'internal_error'); assert.equal(JSON.stringify(body).includes('private database'), false);
});

test('database public profiles include all roles and hide deactivated and unknown accounts', {
  skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL to a scratch database loaded with the User scripts',
}, async () => {
  const pool = createPool(process.env.TEST_DATABASE_URL); const db = await pool.connect();
  const tag = randomUUID().slice(0,8); const ids = ['resident','volunteer','both'].map(role => `${role}-${tag}`);
  try {
    await db.query('BEGIN');
    for (const id of ids) await db.query("INSERT INTO users.account VALUES ($1,'Private','Name',$1,'1990-01-15','2026-11-01T00:00:00Z',NULL)", [id]);
    for (const id of [ids[0],ids[2]]) await db.query("INSERT INTO users.resident VALUES ($1,'Private street','T2P1J9')", [id]);
    for (const id of [ids[1],ids[2]]) await db.query('INSERT INTO users.volunteer VALUES ($1)', [id]);
    for (const [index,id] of ids.entries()) {
      const profile = await loadPublicProfile(db,id); assertPublicProfile(profile);
      assert.equal(profile.accountId,id); assert.equal(profile.publicName,id);
      assert.equal(profile.memberSince,'2026-11-01T00:00:00.000Z');
      assert.deepEqual(profile.roles,index===0 ? ['resident'] : index===1 ? ['volunteer'] : ['resident','volunteer']);
    }
    await db.query('UPDATE users.account SET deactivated_at=now() WHERE account_id=$1',[ids[0]]);
    const responses = [];
    for (const id of [ids[0],`unknown-${tag}`]) {
      try { await loadPublicProfile(db,id); assert.fail('Expected profile 404'); }
      catch(error) { assert.ok(error instanceof HttpError); responses.push([error.status,error.code,error.message]); }
    }
    assert.deepEqual(responses[0],responses[1]); assert.equal(responses[0][0],404);
  } finally { await db.query('ROLLBACK'); db.release(); await pool.end(); }
});
