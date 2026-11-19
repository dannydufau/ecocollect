// The app's shared behaviour: health, gateway headers, unknown paths, bad JSON.
// No database needed.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type pg from 'pg';
import { createApp } from '../../src/request/app.ts';

const server = createApp({ pool: {} as pg.Pool }).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => { server.close(); });

const user = { 'X-User-Id': 'resident1', 'X-User-Roles': 'resident' };
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

test('the app answers in the contract shape', async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);

  const noUser = await fetch(`${base}/api/categories`);
  assert.equal(noUser.status, 401);
  assert.equal(await codeOf(noUser), 'unauthorized');

  const unknown = await fetch(`${base}/api/nothing`, { headers: user });
  assert.equal(unknown.status, 404);
  assert.equal(await codeOf(unknown), 'not_found');

  const badJson = await fetch(`${base}/api/requests`, {
    method: 'POST', headers: { ...user, 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(badJson.status, 400);
  assert.equal(await codeOf(badJson), 'invalid_json');
});
