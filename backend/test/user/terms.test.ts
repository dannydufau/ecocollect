import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { getCurrentTerms } from '../../src/user/db/terms.ts';
import { createPool } from '../../src/user/db/pool.ts';
import { register } from '../../src/user/routes/terms.ts';
import { errorHandler, HttpError, notFound } from '../../src/user/http/errors.ts';

const terms = { termsDocumentId: '00000001-0000-4000-8000-000000000002', content: 'Current terms', publishedAt: '2026-11-01T00:00:00.000Z' };

async function start(t, readTerms) {
  const app = express();
  register(app, readTerms);
  app.use(notFound);
  app.use(errorHandler);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('getCurrentTerms returns only the contract fields and formats the timestamp in UTC', async () => {
  const calls: string[] = [];
  const client = { query: async (sql: string) => {
    calls.push(sql);
    return { rows: [{ terms_document_id: terms.termsDocumentId, content: terms.content, published_at: new Date('2026-10-31T18:00:00-06:00'), internal: 'hidden' }] };
  } };
  assert.deepEqual(await getCurrentTerms(client), terms);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /FROM users\.terms_document/);
});

test('an empty terms table gives a safe internal error', async () => {
  await assert.rejects(getCurrentTerms({ query: async () => ({ rows: [] }) }), error => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 500);
    assert.equal(error.code, 'internal_error');
    return true;
  });
});

test('GET terms is public and ignores supplied identity headers', async t => {
  let reads = 0;
  const base = await start(t, async () => { reads++; return terms; });
  for (const headers of [{}, { 'X-User-Id': 'made-up-user', 'X-User-Roles': 'admin', Authorization: 'Bearer invalid' }]) {
    const response = await fetch(base + '/api/terms', { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    assert.deepEqual(await response.json(), terms);
  }
  assert.equal(reads, 2);
});

test('terms lookup failures use the shared JSON error shape without exposing database details', async t => {
  t.mock.method(console, 'error', () => {});
  const base = await start(t, async () => { throw new Error('private database connection details'); });
  const response = await fetch(base + '/api/terms');
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message']);
  assert.equal(body.error.code, 'internal_error');
  assert.equal(JSON.stringify(body).includes('private database'), false);
});

test('an empty terms lookup returns 500 through the HTTP route', async t => {
  const base = await start(t, () => getCurrentTerms({ query: async () => ({ rows: [] }) }));
  const response = await fetch(base + '/api/terms');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { code: 'internal_error', message: 'The terms are unavailable. Try again later.' } });
});

test('unsupported terms methods do not read the database', async t => {
  const base = await start(t, async () => { throw new Error('Must not read terms'); });
  const response = await fetch(base + '/api/terms', { method: 'POST' });
  assert.equal(response.status, 404);
});

test('real terms lookup skips scheduled publications and breaks ties at the current time', {
  skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL to a scratch database loaded with the User scripts',
}, async () => {
  const pool = createPool(process.env.TEST_DATABASE_URL);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const olderId = randomUUID();
    const futureId = randomUUID();
    const firstId = 'ffffffff-ffff-4fff-8fff-fffffffffff0';
    const secondId = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
    const { rows: [{ published_at: newer }] } = await client.query(
      'INSERT INTO users.terms_document VALUES ($1,$2,now()) RETURNING published_at',
      [firstId, 'Newer terms'],
    );
    await client.query(
      `INSERT INTO users.terms_document VALUES
       ($1,$2,now() - interval '1 day'), ($3,$4,now() + interval '1 day')`,
      [olderId, 'Older terms', futureId, 'Scheduled terms'],
    );
    assert.deepEqual(await getCurrentTerms(client), { termsDocumentId: firstId, content: 'Newer terms', publishedAt: newer.toISOString() });
    await client.query('INSERT INTO users.terms_document VALUES ($1,$2,now())', [secondId, 'Same-time terms']);
    assert.equal((await getCurrentTerms(client)).termsDocumentId, secondId);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
