const test = require('node:test');
const assert = require('node:assert');
const { getFirebaseAuth } = require('../src/api/auth/firebase');

test('fails with a clear message when the key file is missing', () => {
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = '/nowhere/firebase-admin.json';
  assert.throws(() => getFirebaseAuth(), /Can't read the Firebase admin key at \/nowhere\/firebase-admin.json/);
});
