// The app's shared behaviour: health, gateway headers, unknown paths, bad JSON.
// Only /health needs the database (it runs a query), so it is skipped without
// REQUEST_TEST_DATABASE_URL. The rest reach no query, and pg connects only on
// the first one, so the pool startApp makes stays unused.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skipDb } from './db.ts';
import { owner, startApp, type App, type ErrorBody } from './helpers.ts';

let app: App;
before(() => { app = startApp(); });
after(() => app.close());

const codeOf = (body: unknown) => (body as ErrorBody).error.code;

test('health answers 200 when the database answers', { skip: skipDb }, async () => {
  assert.equal((await app.call('GET', '/health', {})).status, 200);
});

test('the app answers in the contract shape', async () => {
  const noUser = await app.call('GET', '/api/categories', {});
  assert.equal(noUser.status, 401);
  assert.equal(codeOf(noUser.body), 'unauthorized');

  const unknown = await app.call('GET', '/api/nothing', owner);
  assert.equal(unknown.status, 404);
  assert.equal(codeOf(unknown.body), 'not_found');

  // Sent with fetch, not app.call: call always sends valid JSON.
  const badJson = await fetch(`${app.base}/api/requests`, {
    method: 'POST', headers: { ...owner, 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(badJson.status, 400);
  assert.equal(codeOf(await badJson.json()), 'invalid_json');
});
