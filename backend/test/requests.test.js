const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createRequestsRouter } = require('../src/api/requests/router');
const { RequestError } = require('../src/api/requests/store');

const resident = { 'X-User-Id': 'res-1', 'X-User-Roles': 'resident' };
const volunteer = { 'X-User-Id': 'vol-1', 'X-User-Roles': 'volunteer' };

// A store that remembers what it was asked and answers with canned data.
function fakeStore(overrides = {}) {
  const calls = [];
  return {
    calls,
    createRequests: async (arg) => (calls.push(['create', arg]), [{ requestId: 'r1', categoryId: 'laptops' }]),
    listMine: async (...args) => (calls.push(['mine', ...args]), []),
    listAvailable: async (...args) => (calls.push(['available', ...args]), []),
    ...overrides,
  };
}

async function start(store) {
  const app = express().use(createRequestsRouter(store));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = (path) => `http://127.0.0.1:${server.address().port}${path}`;
  const post = (headers, body, raw) =>
    fetch(url('/api/requests'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: raw ?? JSON.stringify(body),
    });
  const get = (headers, query) => fetch(url(`/api/requests${query}`), { headers });
  return { post, get, close: () => server.close() };
}

// A date a few days ahead, so the window is in the future and inside the 30 days.
const soon = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const validBody = () => ({
  items: [{ categoryId: 'laptops', quantity: 2 }],
  windows: [{ date: soon(3), startHour: 14 }],
  safetyAcknowledged: true,
});

test('POST: no gateway headers means 401', async () => {
  const server = await start(fakeStore());
  assert.strictEqual((await server.post({}, validBody())).status, 401);
  server.close();
});

test('POST: a volunteer gets 403', async () => {
  const store = fakeStore();
  const server = await start(store);
  assert.strictEqual((await server.post(volunteer, validBody())).status, 403);
  assert.strictEqual(store.calls.length, 0);
  server.close();
});

test('POST: a good body answers 201 and hands the caller\'s uid to the store', async () => {
  const store = fakeStore();
  const server = await start(store);
  const res = await server.post(resident, validBody());
  assert.strictEqual(res.status, 201);
  assert.deepStrictEqual(await res.json(), { requests: [{ requestId: 'r1', categoryId: 'laptops' }] });
  const [, arg] = store.calls[0];
  assert.strictEqual(arg.uid, 'res-1');
  assert.strictEqual(arg.items[0].quantity, 2);
  server.close();
});

test('POST: a uid or an address in the body is ignored, the caller comes from the headers', async () => {
  const store = fakeStore();
  const server = await start(store);
  await server.post(resident, { ...validBody(), uid: 'someone-else', street: '5 Elm St', postalCode: 'T9Z9Z9' });
  const [, arg] = store.calls[0];
  assert.strictEqual(arg.uid, 'res-1');
  assert.ok(!('street' in arg) && !('postalCode' in arg));
  server.close();
});

test('POST: a bad body answers 400 with the reason, and the store is not called', async () => {
  const store = fakeStore();
  const server = await start(store);
  const res = await server.post(resident, { ...validBody(), safetyAcknowledged: false });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /safetyAcknowledged/);
  assert.strictEqual(store.calls.length, 0);
  server.close();
});

test('POST: a body that is not JSON answers 400', async () => {
  const server = await start(fakeStore());
  const res = await server.post(resident, null, '{nope');
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /JSON/);
  server.close();
});

test('POST: a problem the store finds, like an unknown category, answers 400', async () => {
  const server = await start(fakeStore({ createRequests: async () => { throw new RequestError('unknown category: toasters'); } }));
  const res = await server.post(resident, validBody());
  assert.strictEqual(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: 'unknown category: toasters' });
  server.close();
});

test('an unexpected failure answers 500 and does not leak the reason', async (t) => {
  t.mock.method(console, 'error', () => {});
  const server = await start(fakeStore({ createRequests: async () => { throw new Error('password=hunter2 refused'); } }));
  const res = await server.post(resident, validBody());
  assert.strictEqual(res.status, 500);
  assert.ok(!JSON.stringify(await res.json()).includes('hunter2'));
  server.close();
});

test('GET: no gateway headers means 401, before the query is looked at', async () => {
  const server = await start(fakeStore());
  assert.strictEqual((await server.get({}, '')).status, 401);
  server.close();
});

test('GET: a missing or unknown view, or a filter from the other view, answers 400', async () => {
  const server = await start(fakeStore());
  for (const query of ['', '?view=all', '?view=mine&postalCodes=T2P1J9', '?view=available&status=Open', '?view=available&postalCodes=T2P']) {
    assert.strictEqual((await server.get(resident, query)).status, 400, query);
  }
  server.close();
});

test('GET mine: residents only, with the caller\'s uid and the status filter', async () => {
  const store = fakeStore();
  const server = await start(store);
  assert.strictEqual((await server.get(volunteer, '?view=mine')).status, 403);
  const res = await server.get(resident, '?view=mine&status=Open');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), []);
  assert.deepStrictEqual(store.calls, [['mine', 'res-1', 'Open']]);
  server.close();
});

test('GET available: volunteers only, with the postal codes tidied up', async () => {
  const store = fakeStore();
  const server = await start(store);
  assert.strictEqual((await server.get(resident, '?view=available')).status, 403);
  assert.strictEqual((await server.get(volunteer, '?view=available')).status, 200);
  await server.get(volunteer, '?view=available&postalCodes=t2p%201j9,T3A0B1');
  assert.deepStrictEqual(store.calls, [['available', undefined], ['available', ['T2P1J9', 'T3A0B1']]]);
  server.close();
});

test('someone with both roles can use both views', async () => {
  const both = { 'X-User-Id': 'u', 'X-User-Roles': 'resident,volunteer' };
  const server = await start(fakeStore());
  assert.strictEqual((await server.get(both, '?view=mine')).status, 200);
  assert.strictEqual((await server.get(both, '?view=available')).status, 200);
  server.close();
});
