const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers.cjs');

test('the old initializer path points to the User Service implementation', () => {
  const old = require('../../../src/api/auth/firebase');
  const current = require('../../../src/user/auth/firebase.cjs');
  assert.equal(old.getFirebaseAuth, current.getFirebaseAuth);
});

test('revoked tokens, revoked cookies and disabled accounts still return 401', async t => {
  for (const code of ['auth/id-token-revoked','auth/session-cookie-revoked','auth/user-disabled']) {
    const calls = [];
    const fail = async (token, checkRevoked) => {
      calls.push([token,checkRevoked]);
      throw Object.assign(new Error(code),{ code });
    };
    const server = await startServer({ verifyIdToken:fail,verifySessionCookie:fail });
    t.after(server.close);
    const headers = code.includes('cookie') ? { Cookie:'session=revoked' } : { Authorization:'Bearer revoked' };
    const response = await fetch(server.url('/verify'),{ headers });
    assert.equal(response.status,401);assert.equal(response.headers.get('X-User-Id'),null);
    assert.deepEqual(calls,[['revoked',true]]);
  }
});

test('malformed session JSON keeps the original plain 400 response', async t => {
  const server = await startServer({ createSessionCookie:async () => { throw new Error('Must not reach Firebase'); } });
  t.after(server.close);
  const response = await fetch(server.url('/api/session'),{ method:'POST',headers:{ 'Content-Type':'application/json' },body:'{' });
  assert.equal(response.status,400);assert.match(response.headers.get('Content-Type'),/text\/plain/);
  assert.equal(await response.text(),'Bad Request');
});
