import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../src/user/app.ts';

async function start(t, options = {}) {
  const app = await createApp(options);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function routes(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ecocollect-user-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('health works without gateway headers and exposes no implementation header', async t => {
  const base = await start(t);
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('the User Service exits before listening when the Firebase key is missing', async t => {
  const dir = await routes(t);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../src/user/index.ts', import.meta.url))], {
    encoding: 'utf8',
    env: { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: '', GOOGLE_APPLICATION_CREDENTIALS: path.join(dir, 'missing.json'), PORT: '3004' },
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Can't read the Firebase admin key/);
  assert.doesNotMatch(result.stdout, /User service listening/);
});

test('unknown routes and methods use the JSON error shape', async t => {
  const base = await start(t);
  for (const [method, url] of [['GET', '/api/no-such-route'], ['GET', '/api/nothing-here'], ['DELETE', '/health']]) {
    const response = await fetch(base + url, { method });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: { code: 'not_found', message: 'Not found.' } });
  }
});

test('bad JSON and oversized bodies have safe client errors', async t => {
  const base = await start(t);
  for (const [body, status, code] of [['{', 400, 'invalid_json'], [JSON.stringify({ notes: 'x'.repeat(110000) }), 413, 'invalid_body']]) {
    const response = await fetch(`${base}/api/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, status);
    const answer = await response.json();
    assert.equal(answer.error.code, code);
    assert.equal(typeof answer.error.message, 'string');
    assert.equal(answer.error.stack, undefined);
  }
});

test('discovers route files in order, awaits registration and ignores declarations', async t => {
  const dir = await routes(t);
  await writeFile(path.join(dir, '01-first.mjs'), `export async function register(app) {
    await Promise.resolve(); app.use((req,res,next) => { req.loaded=['first']; next(); });
  }`);
  await writeFile(path.join(dir, '02-second.mjs'), `export function register(app) {
    app.post('/api/example', (req,res) => res.json({ loaded:[...req.loaded,'second'], value:req.body.value }));
  }`);
  await writeFile(path.join(dir, 'ignored.d.ts'), 'invalid runtime code');
  const base = await start(t, { routesDir: dir });
  const response = await fetch(`${base}/api/example`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"value":42}' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { loaded: ['first', 'second'], value: 42 });
});

test('a route without register fails startup instead of silently disappearing', async t => {
  const dir = await routes(t);
  await writeFile(path.join(dir, 'broken.mjs'), 'export default {};');
  await assert.rejects(createApp({ routesDir: dir }), /broken.mjs must export register/);
});

test('validation errors preserve field messages and unexpected errors do not expose details', async t => {
  const dir = await routes(t);
  const errors = new URL('../../src/user/http/errors.ts', import.meta.url).href;
  await writeFile(path.join(dir, 'errors.mjs'), `import { validationFailed } from ${JSON.stringify(errors)};
    export function register(app) {
      app.get('/api/validation', () => { throw validationFailed({ publicName:'Enter a name.' }); });
      app.get('/api/failure', async () => { throw new Error('private database details'); });
    }`);
  const base = await start(t, { routesDir: dir });
  const invalid = await fetch(`${base}/api/validation`);
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: { code: 'validation_failed', message: 'Some fields are invalid.', details: { fields: { publicName: 'Enter a name.' } } } });
  t.mock.method(console, 'error', () => {});
  const failed = await fetch(`${base}/api/failure`);
  assert.equal(failed.status, 500);
  const body = await failed.json();
  assert.equal(body.error.code, 'internal_error');
  assert.equal(JSON.stringify(body).includes('private database details'), false);
});
