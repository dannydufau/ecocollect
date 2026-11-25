// These tests need a Postgres with the schema loaded, and they should get a scratch database, not the
// demo one: the outbox tests mark every unsent event as sent. Without TEST_DATABASE_URL they are skipped.
const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'set TEST_DATABASE_URL to run the database tests';

function openPool() {
  const { Pool } = require('pg');
  return new Pool({ connectionString: url });
}

module.exports = { skip, openPool };
