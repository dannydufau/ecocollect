'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startTimers } = require('../src/cleanup/timers');

test('the 12th fire of a job logs a warning with its requestId and requestSeq', async () => {
  // Fake pool: the poll returns one job at its 12th fire.
  const pool = {
    connect: async () => ({
      release() {},
      async query(sql) {
        if (sql.includes('UPDATE cleanup.expiry_job')) {
          return { rows: [{ request_id: 'r1', request_seq: 4, expires_at: new Date(), fire_count: 12, fired_at: new Date() }] };
        }
        return { rows: [] };
      },
    }),
  };
  const warnings = [];
  const log = { info() {}, error() {}, warn: (text) => warnings.push(text) };

  const stop = startTimers(pool, { log });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await stop();

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /requestId=r1 requestSeq=4/);
});