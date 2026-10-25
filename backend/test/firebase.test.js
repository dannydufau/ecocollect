const test = require('node:test');
const assert = require('node:assert');
const { getFirebaseAuth } = require('../src/api/auth/firebase');

test('fails with a clear message when no credentials are configured', () => {
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  assert.throws(() => getFirebaseAuth(), /GOOGLE_APPLICATION_CREDENTIALS/);
});
