const test = require('node:test');
const assert = require('node:assert');
const { gatewayUser, requireRole } = require('../src/api/requests/user');

const fakeReq = (headers = {}) => ({ get: (name) => headers[name] });
const fakeRes = () => {
  const res = { status: (code) => ((res.code = code), res), json: (body) => ((res.body = body), res) };
  return res;
};

test('no X-User-Id header means 401', () => {
  const res = fakeRes();
  let called = false;
  gatewayUser(fakeReq(), res, () => (called = true));
  assert.strictEqual(res.code, 401);
  assert.strictEqual(called, false);
});

test('the uid and the comma separated roles are read from the headers', () => {
  const req = fakeReq({ 'X-User-Id': 'u1', 'X-User-Roles': 'resident,volunteer' });
  gatewayUser(req, fakeRes(), () => {});
  assert.deepStrictEqual(req.user, { uid: 'u1', roles: ['resident', 'volunteer'] });
});

test('an empty roles header means no roles', () => {
  const req = fakeReq({ 'X-User-Id': 'u1', 'X-User-Roles': '' });
  gatewayUser(req, fakeRes(), () => {});
  assert.deepStrictEqual(req.user.roles, []);
});

test('requireRole lets the right role through and answers 403 to the wrong one', () => {
  const res = fakeRes();
  assert.strictEqual(requireRole({ user: { roles: ['resident'] } }, res, 'resident'), true);
  assert.strictEqual(res.code, undefined);
  assert.strictEqual(requireRole({ user: { roles: ['resident'] } }, res, 'volunteer'), false);
  assert.strictEqual(res.code, 403);
});
