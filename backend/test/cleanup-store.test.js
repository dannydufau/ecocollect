'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { skip, openPool } = require('./db');
const { saveJobChange, fireDueJobs, requestDailyCleanup } = require('../src/cleanup/store');

test('cleanup store', { skip }, async (t) => {
  const pool = openPool();
  const ids = [randomUUID(), randomUUID()];
  t.after(async () => {
    await pool.query(`DELETE FROM cleanup.outbox WHERE payload->'data'->>'requestId' = ANY($1) OR payload->'data'->>'requestedAt' LIKE '2030-%'`, [ids]);
    await pool.query('DELETE FROM cleanup.expiry_job WHERE request_id = ANY($1)', [ids]);
    await pool.query(`DELETE FROM cleanup.daily_run WHERE run_date >= '2030-01-01'`);
    await pool.end();
  });

  const save = (id, requestSeq, expiresAt, eventId = randomUUID()) => saveJobChange(pool, eventId, { requestId: id, requestSeq, expiresAt });
  const runAt = async (id) => (await pool.query('SELECT run_at FROM cleanup.expiry_job WHERE request_id = $1', [id])).rows[0].run_at;

  await t.test('a job is set, then ended, and a late older event does not bring it back', async () => {
    await save(ids[0], 1, '2030-01-15T21:00:00Z');
    assert.equal((await runAt(ids[0])).toISOString(), '2030-01-15T21:00:00.000Z');
    await save(ids[0], 2, null);
    await save(ids[0], 1, '2030-01-15T21:00:00Z');
    assert.equal(await runAt(ids[0]), null);
  });

  await t.test('the same event twice is processed once', async () => {
    const eventId = randomUUID();
    assert.equal(await save(ids[1], 1, '2030-01-15T21:00:00Z', eventId), true);
    assert.equal(await save(ids[1], 1, '2030-01-15T21:00:00Z', eventId), false);
  });

  await t.test('a due job fires, then again 5 minutes later', async () => {
    const fired = async (at) => (await fireDueJobs(pool, at)).some((job) => job.request_id === ids[1]);
    assert.equal(await fired('2030-01-15T21:00:00Z'), true);
    assert.equal(await fired('2030-01-15T21:04:00Z'), false);
    assert.equal(await fired('2030-01-15T21:05:00Z'), true);
  });

  await t.test('the daily cleanup is sent once a day, from 03:00 Calgary time', async () => {
    assert.equal(await requestDailyCleanup(pool, '2030-01-15 02:59 America/Edmonton'), false);
    assert.equal(await requestDailyCleanup(pool, '2030-01-15 03:00 America/Edmonton'), true);
    assert.equal(await requestDailyCleanup(pool, '2030-01-15 04:00 America/Edmonton'), false);
  });
});