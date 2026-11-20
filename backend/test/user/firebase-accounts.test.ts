import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountUser, setRoles, disableUser, enableUser, UsernameTaken, EmailTaken } from '../../src/user/firebase/accounts.ts';

const now = new Date('2026-11-19T20:00:00Z');
const old = new Date(now.getTime() - 11 * 60 * 1000).toISOString();
const input = { username: 'test-user', email: 'test@example.com', password: 'Demo1234!', displayName: 'Test User', role: 'resident' as const };
const user = (uid = input.username, creationTime = old) => ({ uid, metadata: { creationTime } });
const firebaseError = (code: string) => Object.assign(new Error(code), { code });

function fakeAuth() {
  return {
    createUser: mock.fn(async (request: { uid: string }) => user(request.uid)),
    getUser: mock.fn(async (uid: string) => user(uid)),
    getUserByEmail: mock.fn(async (_email: string) => user('email-owner')),
    setCustomUserClaims: mock.fn(async (_uid: string, _claims: { roles: string[] }) => {}),
    deleteUser: mock.fn(async (_uid: string) => {}),
    updateUser: mock.fn(async (_uid: string, _changes: { disabled: boolean }) => {}),
    revokeRefreshTokens: mock.fn(async (_uid: string) => {}),
  };
}

test('creates the requested Firebase user and sets its first role', async () => {
  const auth = fakeAuth();
  const accountExists = mock.fn(async () => false);
  const result = await createAccountUser(auth, accountExists, input, now);
  assert.equal(result.uid, input.username);
  assert.deepEqual(auth.createUser.mock.calls[0].arguments, [{ uid: input.username, email: input.email, password: input.password, displayName: input.displayName }]);
  assert.deepEqual(auth.setCustomUserClaims.mock.calls[0].arguments, [input.username, { roles: ['resident'] }]);
  assert.equal(auth.deleteUser.mock.callCount(), 0);
  assert.equal(accountExists.mock.callCount(), 0);
});

test('new volunteer accounts receive the volunteer role', async () => {
  const auth = fakeAuth();
  await createAccountUser(auth, async () => false, { ...input, role: 'volunteer' }, now);
  assert.deepEqual(auth.setCustomUserClaims.mock.calls[0].arguments, [input.username, { roles: ['volunteer'] }]);
});

test('an existing database account keeps its Firebase user and returns a typed conflict', async () => {
  for (const [code, ErrorType, expectedCode] of [
    ['auth/uid-already-exists', UsernameTaken, 'username_taken'],
    ['auth/email-already-exists', EmailTaken, 'email_taken'],
  ] as const) {
    const auth = fakeAuth();
    auth.createUser.mock.mockImplementation(async () => { throw firebaseError(code); });
    const accountExists = mock.fn(async (_uid: string) => true);
    await assert.rejects(createAccountUser(auth, accountExists, input, now), error => {
      assert.ok(error instanceof ErrorType);
      assert.equal(error.status, 409);
      assert.equal(error.code, expectedCode);
      return true;
    });
    assert.equal(auth.deleteUser.mock.callCount(), 0);
    assert.equal(auth.createUser.mock.callCount(), 1);
    assert.equal(accountExists.mock.calls[0].arguments[0], code.includes('uid-') ? input.username : 'email-owner');
  }
});

test('an old orphan found by username is deleted and registration is retried once', async () => {
  const auth = fakeAuth();
  auth.createUser.mock.mockImplementationOnce(async () => { throw firebaseError('auth/uid-already-exists'); });
  await createAccountUser(auth, async () => false, input, now);
  assert.deepEqual(auth.getUser.mock.calls[0].arguments, [input.username]);
  assert.equal(auth.getUserByEmail.mock.callCount(), 0);
  assert.deepEqual(auth.deleteUser.mock.calls[0].arguments, [input.username]);
  assert.equal(auth.createUser.mock.callCount(), 2);
  assert.equal(auth.setCustomUserClaims.mock.callCount(), 1);
});

test('email cleanup uses the Firebase owner uid rather than the requested username', async () => {
  const auth = fakeAuth();
  auth.createUser.mock.mockImplementationOnce(async () => { throw firebaseError('auth/email-already-exists'); });
  const accountExists = mock.fn(async (_uid: string) => false);
  await createAccountUser(auth, accountExists, input, now);
  assert.deepEqual(auth.getUserByEmail.mock.calls[0].arguments, [input.email]);
  assert.equal(auth.getUser.mock.callCount(), 0);
  assert.deepEqual(accountExists.mock.calls[0].arguments, ['email-owner']);
  assert.deepEqual(auth.deleteUser.mock.calls[0].arguments, ['email-owner']);
  assert.equal(auth.createUser.mock.callCount(), 2);
  assert.deepEqual(auth.setCustomUserClaims.mock.calls[0].arguments, [input.username, { roles: ['resident'] }]);
});

test('recent, exactly ten-minute-old, future-dated and unknown-age users are never deleted', async () => {
  for (const creationTime of [new Date(now.getTime() - 60_000).toISOString(), new Date(now.getTime() - 600_000).toISOString(), new Date(now.getTime() + 1).toISOString(), 'unknown', '']) {
    const auth = fakeAuth();
    auth.createUser.mock.mockImplementation(async () => { throw firebaseError('auth/uid-already-exists'); });
    auth.getUser.mock.mockImplementation(async uid => user(uid, creationTime));
    await assert.rejects(createAccountUser(auth, async () => false, input, now), UsernameTaken);
    assert.equal(auth.deleteUser.mock.callCount(), 0, creationTime);
    assert.equal(auth.createUser.mock.callCount(), 1, creationTime);
  }
});

test('an orphan just over ten minutes old can be cleaned up', async () => {
  const auth = fakeAuth();
  auth.createUser.mock.mockImplementationOnce(async () => { throw firebaseError('auth/uid-already-exists'); });
  auth.getUser.mock.mockImplementation(async uid => user(uid, new Date(now.getTime() - 600_001).toISOString()));
  await createAccountUser(auth, async () => false, input, now);
  assert.equal(auth.deleteUser.mock.callCount(), 1);
});

test('a second collision is mapped to its own conflict without further cleanup', async () => {
  const auth = fakeAuth();
  auth.createUser.mock.mockImplementationOnce(async () => { throw firebaseError('auth/uid-already-exists'); });
  auth.createUser.mock.mockImplementationOnce(async () => { throw firebaseError('auth/email-already-exists'); }, 1);
  await assert.rejects(createAccountUser(auth, async () => false, input, now), EmailTaken);
  assert.equal(auth.createUser.mock.callCount(), 2);
  assert.equal(auth.getUser.mock.callCount(), 1);
  assert.equal(auth.getUserByEmail.mock.callCount(), 0);
  assert.equal(auth.deleteUser.mock.callCount(), 1);
});

test('ordinary Firebase creation failures propagate without cleanup or retry', async () => {
  const auth = fakeAuth();
  const failure = firebaseError('auth/internal-error');
  auth.createUser.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(createAccountUser(auth, async () => false, input, now), error => error === failure);
  assert.equal(auth.getUser.mock.callCount(), 0);
  assert.equal(auth.deleteUser.mock.callCount(), 0);
  assert.equal(auth.createUser.mock.callCount(), 1);
});

test('a failed lookup or account check never deletes a Firebase user', async () => {
  for (const step of ['lookup', 'database']) {
    const auth = fakeAuth();
    const failure = new Error(step);
    auth.createUser.mock.mockImplementation(async () => { throw firebaseError('auth/uid-already-exists'); });
    if (step === 'lookup') auth.getUser.mock.mockImplementation(async () => { throw failure; });
    const accountExists = async () => { if (step === 'database') throw failure; return false; };
    await assert.rejects(createAccountUser(auth, accountExists, input, now), error => error === failure);
    assert.equal(auth.deleteUser.mock.callCount(), 0);
    assert.equal(auth.createUser.mock.callCount(), 1);
  }
});

test('cleanup requires an explicit false result from the database check', async () => {
  const auth = fakeAuth();
  auth.createUser.mock.mockImplementation(async () => { throw firebaseError('auth/uid-already-exists'); });
  await assert.rejects(createAccountUser(auth, async () => undefined as unknown as boolean, input, now), UsernameTaken);
  assert.equal(auth.deleteUser.mock.callCount(), 0);
});

test('failed orphan deletion prevents a second create attempt', async () => {
  const auth = fakeAuth();
  const failure = new Error('delete failed');
  auth.createUser.mock.mockImplementation(async () => { throw firebaseError('auth/uid-already-exists'); });
  auth.deleteUser.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(createAccountUser(auth, async () => false, input, now), error => error === failure);
  assert.equal(auth.createUser.mock.callCount(), 1);
});

test('setRoles succeeds on the third attempt and does not change the supplied roles', async () => {
  const auth = fakeAuth();
  const failure = new Error('temporary');
  auth.setCustomUserClaims.mock.mockImplementationOnce(async () => { throw failure; });
  auth.setCustomUserClaims.mock.mockImplementationOnce(async () => { throw failure; }, 1);
  const roles = Object.freeze(['resident', 'volunteer'] as const);
  await setRoles(auth, input.username, roles);
  assert.equal(auth.setCustomUserClaims.mock.callCount(), 3);
  assert.deepEqual(auth.setCustomUserClaims.mock.calls.map(call => call.arguments), Array.from({ length: 3 }, () => [input.username, { roles: ['resident','volunteer'] }]));
  assert.deepEqual(roles, ['resident', 'volunteer']);
});

test('setRoles stops after three failures and returns the last error', async () => {
  const auth = fakeAuth();
  let attempts = 0;
  const failures = [new Error('first'), new Error('second'), new Error('third')];
  auth.setCustomUserClaims.mock.mockImplementation(async () => { throw failures[attempts++]; });
  await assert.rejects(setRoles(auth, input.username, ['resident']), error => error === failures[2]);
  assert.equal(auth.setCustomUserClaims.mock.callCount(), 3);
});

test('failed initial claims remove only the newly created Firebase account', async () => {
  const auth = fakeAuth();
  const failure = new Error('claims failed');
  auth.setCustomUserClaims.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(createAccountUser(auth, async () => false, input, now), error => error === failure);
  assert.equal(auth.setCustomUserClaims.mock.callCount(), 3);
  assert.deepEqual(auth.deleteUser.mock.calls[0].arguments, [input.username]);
});

test('a claims failure and cleanup failure are both preserved', async () => {
  const auth = fakeAuth();
  const claims = new Error('claims failed');
  const cleanup = new Error('cleanup failed');
  auth.setCustomUserClaims.mock.mockImplementation(async () => { throw claims; });
  auth.deleteUser.mock.mockImplementation(async () => { throw cleanup; });
  await assert.rejects(createAccountUser(auth, async () => false, input, now), error => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [claims, cleanup]);
    return true;
  });
});

test('invalid roles and missing database time fail before creating a user', async () => {
  const auth = fakeAuth();
  for (const roles of [[], ['admin'], ['resident','resident']]) {
    await assert.rejects(setRoles(auth, input.username, roles as ('resident' | 'volunteer')[]), TypeError);
  }
  await assert.rejects(createAccountUser(auth, async () => false, input, new Date('invalid')), RangeError);
  assert.equal(auth.createUser.mock.callCount(), 0);
  assert.equal(auth.setCustomUserClaims.mock.callCount(), 0);
});

test('disableUser disables the account before revoking refresh tokens', async () => {
  const auth = fakeAuth();
  const steps: string[] = [];
  auth.updateUser.mock.mockImplementation(async () => { steps.push('disable'); });
  auth.revokeRefreshTokens.mock.mockImplementation(async () => { steps.push('revoke'); });
  await disableUser(auth, input.username);
  assert.deepEqual(steps, ['disable', 'revoke']);
  assert.deepEqual(auth.updateUser.mock.calls[0].arguments, [input.username, { disabled: true }]);
  assert.deepEqual(auth.revokeRefreshTokens.mock.calls[0].arguments, [input.username]);
});

test('disable failures propagate and a failed update does not revoke tokens', async () => {
  for (const step of ['update', 'revoke']) {
    const auth = fakeAuth();
    const failure = new Error(step);
    if (step === 'update') auth.updateUser.mock.mockImplementation(async () => { throw failure; });
    else auth.revokeRefreshTokens.mock.mockImplementation(async () => { throw failure; });
    await assert.rejects(disableUser(auth, input.username), error => error === failure);
    assert.equal(auth.revokeRefreshTokens.mock.callCount(), step === 'update' ? 0 : 1);
  }
});

test('enableUser only re-enables the account and propagates failures', async () => {
  const auth = fakeAuth();
  await enableUser(auth, input.username);
  assert.deepEqual(auth.updateUser.mock.calls[0].arguments, [input.username, { disabled: false }]);
  assert.equal(auth.revokeRefreshTokens.mock.callCount(), 0);
  const failure = new Error('enable failed');
  auth.updateUser.mock.mockImplementation(async () => { throw failure; });
  await assert.rejects(enableUser(auth, input.username), error => error === failure);
});
