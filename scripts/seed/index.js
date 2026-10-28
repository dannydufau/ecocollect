const fs = require('fs');
const path = require('path');
const { users, categories } = require('./data');
const { getSettings, normalizePostalCode, checkData } = require('./settings');

function initFirebase(keyPath) {
  const { initializeApp, cert } = require('firebase-admin/app');
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-ecocollect' });
    console.log('Firebase: EMULATOR at ' + process.env.FIREBASE_AUTH_EMULATOR_HOST);
  } else {
    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    initializeApp({ credential: cert(key) });
    console.log('Firebase: REAL project ' + key.project_id);
  }
}

async function seedFirebase(password) {
  const { getAuth } = require('firebase-admin/auth');
  const auth = getAuth();
  for (const u of users) {
    let exists = true;
    try {
      await auth.getUser(u.uid);
    } catch (err) {
      if (err.code === 'auth/user-not-found') exists = false;
      else throw err;
    }

    const props = { email: u.email, password, displayName: u.displayName };
    if (exists) {
      await auth.updateUser(u.uid, props);
    } else {
      await auth.createUser({ uid: u.uid, ...props });
    }
    await auth.setCustomUserClaims(u.uid, { roles: u.roles });
    console.log('  ' + (exists ? 'updated' : 'created') + '  ' + u.uid + '  [' + u.roles.join(', ') + ']');
  }
}

async function seedDatabase(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const c of categories) {
      await client.query(
        `INSERT INTO categories (category_id, name, standard_weight_kg)
         VALUES ($1, $2, $3)
         ON CONFLICT (category_id) DO UPDATE
         SET name = EXCLUDED.name, standard_weight_kg = EXCLUDED.standard_weight_kg`,
        [c.id, c.name, c.standardWeightKg]
      );
    }

    for (const u of users) {
      await client.query(
        `INSERT INTO profiles
           (uid, first_name, last_name, public_name, username, email, date_of_birth, roles, street, city, postal_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Calgary', $10)
         ON CONFLICT (uid) DO UPDATE
         SET first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             public_name = EXCLUDED.public_name,
             username = EXCLUDED.username,
             email = EXCLUDED.email,
             date_of_birth = EXCLUDED.date_of_birth,
             roles = EXCLUDED.roles,
             street = EXCLUDED.street,
             city = EXCLUDED.city,
             postal_code = EXCLUDED.postal_code`,
        [u.uid, u.firstName, u.lastName, u.displayName,
         u.email.split('@')[0], u.email, u.dateOfBirth, u.roles, u.street,
         normalizePostalCode(u.postalCode)]
      );

      await client.query('DELETE FROM volunteer_preferred_postal_codes WHERE uid = $1', [u.uid]);
      for (const [slotIndex, code] of (u.preferredPostalCodes || []).entries()) {
        await client.query(
          'INSERT INTO volunteer_preferred_postal_codes (uid, postal_code, preference_slot) VALUES ($1, $2, $3)',
          [u.uid, normalizePostalCode(code), slotIndex + 1]
        );
      }
      console.log('  saved    ' + u.uid);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Every Firebase user must have exactly one profile row with the same uid and the same roles.
async function verify(pool) {
  const { getAuth } = require('firebase-admin/auth');
  const auth = getAuth();
  const problems = [];
  for (const u of users) {
    const fb = await auth.getUser(u.uid);
    const fbRoles = ((fb.customClaims && fb.customClaims.roles) || []).slice().sort().join(',');
    const { rows } = await pool.query('SELECT roles FROM profiles WHERE uid = $1', [u.uid]);
    if (rows.length !== 1) {
      problems.push(u.uid + ': expected 1 profile row, found ' + rows.length);
    } else if (rows[0].roles.slice().sort().join(',') !== fbRoles) {
      problems.push(u.uid + ': roles differ between Firebase and the database');
    }
  }
  if (problems.length > 0) throw new Error('Check failed:\n  ' + problems.join('\n  '));
}

async function main() {
  checkData(users, categories);
  const settings = getSettings();
  initFirebase(settings.keyPath);
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: settings.databaseUrl });
  try {
    console.log('\n1. Firebase users');
    await seedFirebase(settings.demoPassword);
    console.log('\n2. Database rows');
    await seedDatabase(pool);
    console.log('\n3. Check');
    await verify(pool);
    console.log('  OK: ' + users.length + ' users and ' + categories.length +
      ' categories match in Firebase and the database.\n');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nSeed failed: ' + err.message);
    process.exit(1);
  });
}

module.exports = { seedDatabase, normalizePostalCode, verify };
