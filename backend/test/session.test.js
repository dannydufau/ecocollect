const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

const FIVE_DAYS_SECONDS = 5 * 24 * 60 * 60;

// Stands in for Firebase: only "good-token" is accepted.
function fakeAuth() {
  const calls = [];
  return {
    calls,
    async createSessionCookie(idToken, options) {
      calls.push({ idToken, options });
      if (idToken !== 'good-token') {
        throw Object.assign(new Error('bad token'), { code: 'auth/invalid-id-token' });
      }
      return 'session-cookie-value';
    },
  };
}

function postSession(server, body) {
  return fetch(server.url('/api/session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('POST /api/session swaps a good ID token for a secure cookie', async (t) => {
  const auth = fakeAuth();
  const server = await startServer(auth);
  t.after(server.close);

  const res = await postSession(server, { idToken: 'good-token' });

  assert.strictEqual(res.status, 204);
  const cookie = res.headers.getSetCookie()[0];
  assert.match(cookie, /^session=session-cookie-value;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, new RegExp(`Max-Age=${FIVE_DAYS_SECONDS}`));
  assert.strictEqual(auth.calls[0].options.expiresIn, FIVE_DAYS_SECONDS * 1000);
});

test('POST /api/session returns 401 for an invalid or stale token', async (t) => {
  const server = await startServer(fakeAuth());
  t.after(server.close);

  const res = await postSession(server, { idToken: 'stale-token' });

  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.headers.getSetCookie().length, 0);
});

test('POST /api/session returns 401 when the token is missing', async (t) => {
  const auth = fakeAuth();
  const server = await startServer(auth);
  t.after(server.close);

  const res = await postSession(server, {});

  assert.strictEqual(res.status, 401);
  assert.strictEqual(auth.calls.length, 0);
});

test('POST /api/session returns 500 when Firebase fails for another reason', async (t) => {
  t.mock.method(console, 'error', () => {});
  const auth = { createSessionCookie: async () => { throw new Error('network down'); } };
  const server = await startServer(auth);
  t.after(server.close);

  const res = await postSession(server, { idToken: 'good-token' });

  assert.strictEqual(res.status, 500);
});

test('POST /api/session returns 500 when Firebase itself reports an internal error', async (t) => {
  t.mock.method(console, 'error', () => {});
  const auth = {
    createSessionCookie: async () => {
      throw Object.assign(new Error('firebase is down'), { code: 'auth/internal-error' });
    },
  };
  const server = await startServer(auth);
  t.after(server.close);

  const res = await postSession(server, { idToken: 'good-token' });

  assert.strictEqual(res.status, 500);
});

test('DELETE /api/session clears the cookie', async (t) => {
  const server = await startServer(fakeAuth());
  t.after(server.close);

  const res = await fetch(server.url('/api/session'), { method: 'DELETE' });

  assert.strictEqual(res.status, 204);
  const cookie = res.headers.getSetCookie()[0];
  assert.match(cookie, /^session=;/);
  assert.match(cookie, /Expires=Thu, 01 Jan 1970/);
});
