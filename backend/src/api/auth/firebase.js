const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Same default location as the seed script (the secrets/ folder is git-ignored).
const DEFAULT_KEY_PATH = path.join(__dirname, '../../../../secrets/firebase-admin.json');

function readKey() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || DEFAULT_KEY_PATH;
  try {
    return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  } catch (err) {
    throw new Error(`Can't read the Firebase admin key at ${keyPath}. Set GOOGLE_APPLICATION_CREDENTIALS to its path (${err.message})`);
  }
}

// Same two modes as the seed script: the local emulator, or a real service-account key.
function getFirebaseAuth() {
  if (getApps().length) return getAuth(); // already set up by an earlier call
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    // The Admin SDK sees this env var and talks to the emulator on its own.
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-ecocollect' });
  } else {
    initializeApp({ credential: cert(readKey()) });
  }
  return getAuth();
}

module.exports = { getFirebaseAuth };
