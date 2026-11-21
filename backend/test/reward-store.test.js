'use strict';

// Needs TEST_DATABASE_URL pointing at a database built by backend/scripts/reward/load-db.sh.
// Use the admin login: the ecocollect_reward login cannot delete the rows this test adds.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { skip, openPool } = require('./db');
const handlers = require('../src/reward/handlers');
const { saveResult, getEcopoints, getPublicStats, getProfileStats } = require('../src/reward/store');

// Seeded assignment that has no awards yet: 4 items, 0.80 kg.
const ASSIGNMENT_ID = '00000005-0000-4000-8000-000000000003';

test('R1 to R3 read the seeded awards', { skip }, async (t) => {
  const pool = openPool();
  t.after(() => pool.end());

  const mine = await getEcopoints(pool, 'resident1');
  assert.equal(mine.total, 13);
  assert.equal(mine.awards[0].kind, 'DELIVERY');

  const stats = await getPublicStats(pool);
  assert.equal(stats.deliveries, 2);
  assert.equal(stats.ecopointsAwarded, 79.1);

  assert.deepEqual(await getProfileStats(pool, 'volunteer1'), { accountId: 'volunteer1', ecopoints: 26 });
  assert.deepEqual(await getProfileStats(pool, 'unknown'), { accountId: 'unknown', ecopoints: 0 });
});

test('a delivery is saved once, even if the event arrives twice', { skip }, async (t) => {
  const pool = openPool();
  const event = {
    eventId: randomUUID(),
    type: 'RequestAssignmentDelivered',
    data: {
      request: { requestId: '00000003-0000-4000-8000-000000000003', residentUid: 'resident3', categoryName: 'Phones', quantity: 4, estimatedWeightKg: 0.8 },
      assignment: { assignmentId: ASSIGNMENT_ID, volunteerUid: 'volunteer2' },
    },
  };

  // Remove the rows this test added, so the seed stays as it was.
  t.after(async () => {
    const awards = `SELECT ecopoints_award_id FROM ecocollect608.ecopoints_award WHERE assignment_id = $1`;
    await pool.query(`DELETE FROM ecocollect608.volunteer_award WHERE ecopoints_award_id IN (${awards})`, [ASSIGNMENT_ID]);
    await pool.query(`DELETE FROM ecocollect608.resident_award WHERE ecopoints_award_id IN (${awards})`, [ASSIGNMENT_ID]);
    await pool.query('DELETE FROM ecocollect608.ecopoints_award WHERE assignment_id = $1', [ASSIGNMENT_ID]);
    await pool.query(`DELETE FROM rewards.outbox WHERE payload->'data'->>'assignmentId' = $1`, [ASSIGNMENT_ID]);
    await pool.query('DELETE FROM rewards.processed_events WHERE event_id = $1', [event.eventId]);
    await pool.end();
  });

  const save = () => saveResult(pool, event.eventId, handlers[event.type](event));
  assert.equal(await save(), true);
  assert.equal(await save(), false);

  const { rows } = await pool.query(
    `SELECT points::float8 AS points FROM ecocollect608.ecopoints_award WHERE assignment_id = $1 ORDER BY points`,
    [ASSIGNMENT_ID],
  );
  assert.deepEqual(rows.map((r) => r.points), [7.6, 15.2]);

  const outbox = await pool.query(`SELECT 1 FROM rewards.outbox WHERE payload->'data'->>'assignmentId' = $1`, [ASSIGNMENT_ID]);
  assert.equal(outbox.rowCount, 1);
});