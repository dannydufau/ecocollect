const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Same two modes as the seed script: the local emulator, or a real service-account key.
function getFirebaseAuth() {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    // The Admin SDK sees this env var and talks to the emulator on its own.
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-ecocollect' });
  } else {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyPath) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to the Firebase admin key file');
    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
  }
  return getAuth();
}

module.exports = { getFirebaseAuth };
