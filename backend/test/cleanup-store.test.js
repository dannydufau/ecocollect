'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { skip, openPool } = require('./db');
const { saveJobChange, fireDueJobs, requestDailyCleanup } = require('../src/cleanup/store');

test('cleanup jobs', { skip }, async (t) => {
  const pool = openPool();
  const ids = [randomUUID(), randomUUID()];
  t.after(async () => {
    await pool.query(`DELETE FROM cleanup.outbox WHERE payload->'data'->>'requestId' = ANY($1)`, [ids]);
    await pool.query('DELETE FROM cleanup.expiry_job WHERE request_id = ANY($1)', [ids]);
    await pool.end();
  });

  const save = (requestId, requestSeq, expiresAt) => saveJobChange(pool, randomUUID(), { requestId, requestSeq, expiresAt });
  const runAt = async (id) => (await pool.query('SELECT run_at FROM cleanup.expiry_job WHERE request_id = $1', [id])).rows[0].run_at;

  await t.test('a job is set and ended, and an older event is ignored', async () => {
    await save(ids[0], 2, '2030-01-15T21:00:00Z');
    await save(ids[0], 1, '2030-01-20T21:00:00Z');
    assert.equal((await runAt(ids[0])).toISOString(), '2030-01-15T21:00:00.000Z');

    await save(ids[0], 3, null);
    assert.equal(await runAt(ids[0]), null);
  });

  await t.test('a due job fires once, then again in 5 minutes', async () => {
    await save(ids[1], 1, new Date(Date.now() - 60000));
    assert.ok((await fireDueJobs(pool)).some((job) => job.request_id === ids[1]));
    assert.ok(!(await fireDueJobs(pool)).some((job) => job.request_id === ids[1]));
    assert.ok((await runAt(ids[1])) > new Date(Date.now() + 4 * 60000));
  });

  await t.test('the daily cleanup is sent at most once a day', async () => {
    await requestDailyCleanup(pool);
    assert.equal(await requestDailyCleanup(pool), false);
  });
});