const { randomUUID } = require('node:crypto');

// These tests need a Postgres with the schema loaded, and they should get a scratch database, not the
// demo one: the outbox tests mark every unsent event as sent. Without TEST_DATABASE_URL they are skipped.
const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'set TEST_DATABASE_URL to run the database tests';

function openPool() {
  const { Pool } = require('pg');
  return new Pool({ connectionString: url });
}

// Each run gets its own users, so tests don't trip over each other or over seeded demo data.
async function addFixtures(pool) {
  const tag = randomUUID().slice(0, 8);
  const person = (name, roles, postalCode) => ({ uid: `${name}-${tag}`, roles, postalCode });
  const resident = person('res', ['resident'], 'T2P1J9');
  const near = person('volnear', ['volunteer'], 'T3A0B1');
  const same = person('volsame', ['volunteer'], 'T2E5A8');
  const both = person('both', ['resident', 'volunteer'], 'T2P1J9');

  for (const p of [resident, near, same, both]) {
    await pool.query(
      `INSERT INTO profiles (uid, first_name, last_name, public_name, username, email, date_of_birth, roles, street, postal_code)
       VALUES ($1, 'Test', 'User', 'Test U.', $1, $1 || '@test.local', '1990-01-01', $2, '1 Secret St SW', $3)`,
      [p.uid, p.roles, p.postalCode],
    );
  }
  // near and both want the resident's area, same wants somewhere else.
  await pool.query(
    'INSERT INTO volunteer_preferred_postal_codes (uid, postal_code, preference_slot) VALUES ($1, $2, 1), ($3, $4, 1), ($5, $6, 1)',
    [near.uid, 'T2P1J9', same.uid, 'T2E5A8', both.uid, 'T2P1J9'],
  );
  await pool.query(
    `INSERT INTO categories (category_id, name, standard_weight_kg) VALUES
       ('laptops', 'Computers/Laptops', 2.5), ('other-electronics', 'Other Electronics', 1.0)
     ON CONFLICT DO NOTHING`,
  );
  return { resident, near, same, both, uids: [resident, near, same, both].map((p) => p.uid) };
}

async function removeFixtures(pool, uids) {
  const { rows } = await pool.query('SELECT request_id FROM pickup_request WHERE resident_uid = ANY($1)', [uids]);
  const ids = rows.map((r) => r.request_id);
  await pool.query('DELETE FROM outbox WHERE aggregate_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM pickup_request WHERE resident_uid = ANY($1)', [uids]);
  await pool.query('DELETE FROM profiles WHERE uid = ANY($1)', [uids]);
}

module.exports = { skip, openPool, addFixtures, removeFixtures };
