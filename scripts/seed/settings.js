const fs = require('node:fs');
const path = require('node:path');

// Read the same root .env used by Docker Compose, without installing extra packages.
function readEnv(filepath, env = process.env) {
  if (!fs.existsSync(filepath)) return;
  for (const line of fs.readFileSync(filepath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in env)) env[key] = value;
  }
}

function normalizePostalCode(code) { return code.replace(/\s+/g, '').toUpperCase(); }

function checkData(users, categories) {
  const uids = new Set();
  const emails = new Set();
  const ids = new Set();
  for (const c of categories) {
    if (ids.has(c.id)) throw new Error('Duplicate category: ' + c.id);
    ids.add(c.id);
    if (!(c.standardWeightKg > 0)) throw new Error('Invalid category weight: ' + c.id);
  }
  for (const u of users) {
    if (uids.has(u.uid)) throw new Error('Duplicate uid: ' + u.uid);
    if (emails.has(u.email.toLowerCase())) throw new Error('Duplicate email: ' + u.email);
    uids.add(u.uid); emails.add(u.email.toLowerCase());
    if (!/^[T]\d[A-Z]\d[A-Z]\d$/.test(normalizePostalCode(u.postalCode))) throw new Error('Bad postal code: ' + u.uid);
    if (!Array.isArray(u.roles) || u.roles.length < 1 || u.roles.length > 2 || new Set(u.roles).size !== u.roles.length || u.roles.some(r => !['resident', 'volunteer'].includes(r))) throw new Error('Invalid roles: ' + u.uid);
    const preferred = (u.preferredPostalCodes || []).map(normalizePostalCode);
    if (preferred.length > 3 || new Set(preferred).size !== preferred.length || preferred.some(c => !/^[T]\d[A-Z]\d[A-Z]\d$/.test(c))) throw new Error('Invalid preferred postal codes: ' + u.uid);
    if (preferred.length && !u.roles.includes('volunteer')) throw new Error('Preferred codes require volunteer role: ' + u.uid);
  }
}

function getSettings(env = process.env) {
  readEnv(path.resolve(__dirname, '../../.env'), env);
  let databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    const password = env.POSTGRES_PASSWORD;
    if (!password) throw new Error('Missing DATABASE_URL or POSTGRES_PASSWORD. Copy .env.example to .env and set your own password.');
    const host = env.POSTGRES_HOST || '127.0.0.1';
    const port = env.POSTGRES_PORT || '5432';
    const username = env.POSTGRES_USER || 'ecocollect';
    const database = env.POSTGRES_DB || 'ecocollect';
    databaseUrl = `postgres://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
  }
  const demoPassword = env.DEMO_PASSWORD || (env.FIREBASE_AUTH_EMULATOR_HOST ? 'EmulatorDemo1234!' : null);
  if (!demoPassword) throw new Error('Set DEMO_PASSWORD for real Firebase demo users (do not commit the password).');
  if (demoPassword.length < 8) throw new Error('DEMO_PASSWORD must be at least 8 characters.');
  return {
    databaseUrl,
    demoPassword,
    keyPath: env.GOOGLE_APPLICATION_CREDENTIALS || path.resolve(__dirname, '../../secrets/firebase-admin.json')
  };
}
module.exports = { readEnv, getSettings, normalizePostalCode, checkData };
