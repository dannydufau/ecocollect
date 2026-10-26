const { randomUUID, randomInt } = require('node:crypto');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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
  const code = () => `T${randomInt(10)}${LETTERS[randomInt(26)]}${randomInt(10)}${LETTERS[randomInt(26)]}${randomInt(10)}`;
  // Random areas, so volunteers already in the database (the demo seed) can't be matched by accident.
  const [here, elsewhere, far] = [code(), code(), code()];
  const person = (name, roles, postalCode) => ({ uid: `${name}-${tag}`, roles, postalCode });
  const resident = person('res', ['resident'], here);
  const near = person('volnear', ['volunteer'], here);
  const away = person('volelsewhere', ['volunteer'], elsewhere);
  const both = person('both', ['resident', 'volunteer'], here);

  for (const p of [resident, near, away, both]) {
    await pool.query(
      `INSERT INTO profiles (uid, first_name, last_name, public_name, username, email, date_of_birth, roles, street, postal_code)
       VALUES ($1, 'Test', 'User', 'Test U.', $1, $1 || '@test.local', '1990-01-01', $2, '1 Secret St SW', $3)`,
      [p.uid, p.roles, p.postalCode],
    );
  }
  // near and both want the resident's area, away wants somewhere else.
  await pool.query(
    'INSERT INTO volunteer_preferred_postal_codes (uid, postal_code, preference_slot) VALUES ($1, $2, 1), ($3, $4, 1), ($5, $6, 1)',
    [near.uid, here, away.uid, elsewhere, both.uid, here],
  );
  await pool.query(
    `INSERT INTO categories (category_id, name, standard_weight_kg) VALUES
       ('laptops', 'Computers/Laptops', 2.5), ('other-electronics', 'Other Electronics', 1.0)
     ON CONFLICT DO NOTHING`,
  );
  return { resident, near, away, both, here, elsewhere, far, uids: [resident, near, away, both].map((p) => p.uid) };
}

async function removeFixtures(pool, uids) {
  const { rows } = await pool.query('SELECT request_id FROM pickup_request WHERE resident_uid = ANY($1)', [uids]);
  const ids = rows.map((r) => r.request_id);
  await pool.query('DELETE FROM outbox WHERE aggregate_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM pickup_request WHERE resident_uid = ANY($1)', [uids]);
  await pool.query('DELETE FROM profiles WHERE uid = ANY($1)', [uids]);
}

module.exports = { skip, openPool, addFixtures, removeFixtures };
