const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

const invalid = () => Object.assign(new Error('rejected'), { code: 'auth/invalid-id-token' });

// Stands in for Firebase: "good-token" and "good-cookie" are valid, everything else is not.
function fakeAuth(claims = { roles: ['resident'] }) {
  const calls = [];
  return {
    calls,
    async verifyIdToken(token, checkRevoked) {
      calls.push(['verifyIdToken', token, checkRevoked]);
      if (token !== 'good-token') throw invalid();
      return { uid: 'user-1', ...claims };
    },
    async verifySessionCookie(cookie, checkRevoked) {
      calls.push(['verifySessionCookie', cookie, checkRevoked]);
      if (cookie !== 'good-cookie') throw invalid();
      return { uid: 'user-2', ...claims };
    },
  };
}

function verify(server, headers) {
  return fetch(server.url('/verify'), { headers });
}

test('a valid bearer token returns 200 with the user headers', async (t) => {
  const auth = fakeAuth({ roles: ['resident', 'volunteer'] });
  const server = await startServer(auth);
  t.after(server.close);

  const res = await verify(server, { Authorization: 'Bearer good-token' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('X-User-Id'), 'user-1');
  assert.strictEqual(res.headers.get('X-User-Roles'), 'resident,volunteer');
  assert.deepStrictEqual(auth.calls, [['verifyIdToken', 'good-token', true]]);
});

test('a valid session cookie returns 200 with the user headers', async (t) => {
  const auth = fakeAuth();
  const server = await startServer(auth);
  t.after(server.close);

  const res = await verify(server, { Cookie: 'theme=dark; session=good-cookie' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('X-User-Id'), 'user-2');
  assert.deepStrictEqual(auth.calls, [['verifySessionCookie', 'good-cookie', true]]);
});

test('the bearer token wins when both are sent', async (t) => {
  const auth = fakeAuth();
  const server = await startServer(auth);
  t.after(server.close);

  await verify(server, { Authorization: 'Bearer good-token', Cookie: 'session=good-cookie' });

  assert.deepStrictEqual(auth.calls.map((c) => c[0]), ['verifyIdToken']);
});

test('returns 401 when there are no credentials', async (t) => {
  const auth = fakeAuth();
  const server = await startServer(auth);
  t.after(server.close);

  const res = await verify(server, {});

  assert.strictEqual(res.status, 401);
  assert.strictEqual(auth.calls.length, 0);
});

test('returns 401 for a rejected bearer token', async (t) => {
  const server = await startServer(fakeAuth());
  t.after(server.close);

  const res = await verify(server, { Authorization: 'Bearer revoked-token' });

  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.headers.get('X-User-Id'), null);
});

test('returns 401 for a rejected session cookie', async (t) => {
  const server = await startServer(fakeAuth());
  t.after(server.close);

  const res = await verify(server, { Cookie: 'session=expired-cookie' });

  assert.strictEqual(res.status, 401);
});

test('a user without a roles claim gets an empty roles header', async (t) => {
  const server = await startServer(fakeAuth({}));
  t.after(server.close);

  const res = await verify(server, { Authorization: 'Bearer good-token' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('X-User-Roles'), '');
});

test('returns 500 when Firebase fails for another reason', async (t) => {
  t.mock.method(console, 'error', () => {});
  const auth = { verifyIdToken: async () => { throw new Error('network down'); } };
  const server = await startServer(auth);
  t.after(server.close);

  const res = await verify(server, { Authorization: 'Bearer good-token' });

  assert.strictEqual(res.status, 500);
});
