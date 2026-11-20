import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPool } from '../../src/user/db/pool.ts';
import { enqueueEvent } from '../../src/user/db/outbox.ts';

test('the User database requires an explicit connection URL', () => {
  assert.throws(() => createPool(''), /DATABASE_URL is required/);
});

test('unknown events and mismatched routing keys are rejected before a write', async () => {
  const client = { query: async () => { throw new Error('Unexpected database call'); } };
  for (const [type, routingKey] of [['RequestCreated', 'request.created'], ['ProfileUpdated', 'wrong.key']]) {
    await assert.rejects(enqueueEvent(client, { type, routingKey, data: { accountId: 'sample-user' } }), /Unknown User Service event/);
  }
});

test('User database transactions and permissions', {
  skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL to a scratch database loaded with the User scripts',
}, async t => {
  const pool = createPool(process.env.TEST_DATABASE_URL);
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  t.after(async () => { await Promise.all([pool.end(), admin.end()]); });
  const accountId = `test-${randomUUID().slice(0, 8)}`;
  const acceptanceId = randomUUID();
  const termsId = '00000001-0000-4000-8000-000000000002';

  await t.test('account, resident, acceptance and event commit together under the service role', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ecocollect_user');
      await client.query(`INSERT INTO users.account VALUES ($1,'Avery','Chen','Avery','1990-01-01',now(),NULL)`, [accountId]);
      await client.query("INSERT INTO users.resident VALUES ($1,'1 Example Street','T0A0A0')", [accountId]);
      await client.query("INSERT INTO users.terms_acceptance VALUES ($1,$2,$3,now(),'AT_RESIDENT_REGISTRATION_OR_ACTIVATION')", [acceptanceId, termsId, accountId]);
      const event = await enqueueEvent(client, {
        type: 'ProfileUpdated', routingKey: 'user.profile.updated', traceId: 'request-test',
        data: { accountId, changed: ['publicName'], publicName: 'Avery', roles: ['resident'] },
      });
      const result = await client.query(`SELECT a.account_id, r.postal_code, t.terms_document_id
        FROM users.account a JOIN users.resident r USING (account_id)
        JOIN users.terms_acceptance t USING (account_id) WHERE a.account_id=$1`, [accountId]);
      assert.equal(result.rows[0].account_id, accountId);
      assert.equal(result.rows[0].postal_code, 'T0A0A0');
      assert.equal(result.rows[0].terms_document_id, termsId);
      const row = (await client.query('SELECT * FROM users.outbox WHERE event_id=$1', [event.eventId])).rows[0];
      assert.deepEqual(Object.keys(row.payload).sort(), ['data','eventId','occurredAt','producer','traceId','type','version']);
      assert.equal(row.payload.producer, 'user-service');
      assert.equal(row.payload.traceId, 'request-test');
      assert.equal(row.payload.version, 1);
      assert.equal(row.payload.type, 'ProfileUpdated');
      assert.match(row.payload.occurredAt, /^\d{4}-\d\d-\d\dT.*Z$/);
      assert.equal(row.payload.occurredAt, row.created_at.toISOString());
      assert.equal(row.aggregate_id, accountId);
      assert.equal(row.event_type, row.payload.type);
      assert.equal(row.event_version, row.payload.version);
      assert.equal(row.routing_key, 'user.profile.updated');
      assert.equal(row.published_at, null);
      assert.equal(JSON.stringify(row.payload).includes('Example Street'), false);
      assert.equal((await admin.query('SELECT 1 FROM users.account WHERE account_id=$1', [accountId])).rowCount, 0);
      await client.query('COMMIT');
      assert.equal((await admin.query('SELECT 1 FROM users.account WHERE account_id=$1', [accountId])).rowCount, 1);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });

  await t.test('rolling back removes both the account change and its event', async () => {
    const client = await pool.connect();
    let event;
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ecocollect_user');
      await client.query("UPDATE users.account SET public_name='Changed' WHERE account_id=$1", [accountId]);
      event = await enqueueEvent(client, { type: 'AccountDeactivated', routingKey: 'user.account.deactivated',
        data: { accountId, deactivatedAt: new Date().toISOString() } });
      assert.equal(event.traceId, null);
      await client.query('ROLLBACK');
      assert.equal((await client.query('SELECT public_name FROM users.account WHERE account_id=$1', [accountId])).rows[0].public_name, 'Avery');
      assert.equal((await client.query('SELECT 1 FROM users.outbox WHERE event_id=$1', [event.eventId])).rowCount, 0);
    } finally { await client.query('ROLLBACK'); client.release(); }
  });

  await t.test('the service cannot update or delete terms acceptances', async () => {
    for (const sql of ['UPDATE users.terms_acceptance SET accepted_at=now() WHERE terms_acceptance_id=$1', 'DELETE FROM users.terms_acceptance WHERE terms_acceptance_id=$1']) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN'); await client.query('SET LOCAL ROLE ecocollect_user');
        await assert.rejects(client.query(sql, [acceptanceId]), { code: '42501' });
      } finally { await client.query('ROLLBACK'); client.release(); }
    }
  });

  await t.test('the service reads future tables in another schema but cannot write them', async () => {
    const schema = 'read_test_' + randomUUID().replaceAll('-', '');
    await admin.query(`CREATE SCHEMA ${schema}`);
    try {
      await admin.query(`CREATE TABLE ${schema}.sample (id INTEGER); INSERT INTO ${schema}.sample VALUES (7)`);
      const client = await pool.connect();
      try {
        await client.query('BEGIN'); await client.query('SET LOCAL ROLE ecocollect_user');
        assert.equal((await client.query(`SELECT id FROM ${schema}.sample`)).rows[0].id, 7);
        await assert.rejects(client.query(`INSERT INTO ${schema}.sample VALUES (8)`), { code: '42501' });
      } finally { await client.query('ROLLBACK'); client.release(); }
    } finally { await admin.query(`DROP TABLE ${schema}.sample; DROP SCHEMA ${schema}`); }
  });

  await admin.query('DELETE FROM users.outbox WHERE aggregate_id=$1', [accountId]);
  await admin.query('DELETE FROM users.terms_acceptance WHERE account_id=$1', [accountId]);
  await admin.query('DELETE FROM users.resident WHERE account_id=$1', [accountId]);
  await admin.query('DELETE FROM users.account WHERE account_id=$1', [accountId]);
});
