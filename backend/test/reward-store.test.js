'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { skip, openPool } = require('./db');
const handlers = require('../src/reward/handlers');
const { saveResult } = require('../src/reward/store');

// An incoming event with new ids, so every run uses fresh rows.
function sampleEvent(type, extra = {}) {
  return {
    eventId: randomUUID(),
    type,
    data: {
      request: { requestId: randomUUID(), residentUid: 'resident_one', categoryName: 'Computers/Laptops', quantity: 2, estimatedWeightKg: 5.0 },
      assignment: { assignmentId: randomUUID(), volunteerUid: 'volunteer_one' },
      ...extra,
    },
  };
}

test('saving reward results', { skip }, async (t) => {
  const pool = openPool();
  const assignmentIds = [];

  // Remove the rows these tests added.
  t.after(async () => {
    await pool.query(`DELETE FROM rewards.outbox WHERE payload->'data'->>'assignmentId' = ANY($1)`, [assignmentIds]);
    await pool.query('DELETE FROM rewards.ecopoints_award WHERE assignment_id = ANY($1)', [assignmentIds]);
    await pool.end();
  });

  // Runs the handler and saves its result, like the consumer will.
  function handle(event) {
    assignmentIds.push(event.data.assignment.assignmentId);
    return saveResult(pool, event.eventId, handlers[event.type](event));
  }

  // How many rows an event left in each table.
  async function rowsFor(event) {
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM rewards.processed_events WHERE event_id = $1) AS processed,
         (SELECT count(*)::int FROM rewards.ecopoints_award WHERE assignment_id = $2) AS awards,
         (SELECT count(*)::int FROM rewards.outbox WHERE payload->'data'->>'assignmentId' = $2::text) AS outbox`,
      [event.eventId, event.data.assignment.assignmentId],
    );
    return rows[0];
  }

  await t.test('delivery is saved once, even if the event arrives twice', async () => {
    const event = sampleEvent('RequestAssignmentDelivered');
    assert.equal(await handle(event), true);
    assert.equal(await handle(event), false);
    assert.deepEqual(await rowsFor(event), { processed: 1, awards: 2, outbox: 1 });

    const { rows } = await pool.query(
      'SELECT earned_as, points::float8 AS points FROM rewards.ecopoints_award WHERE assignment_id = $1 ORDER BY earned_as',
      [event.data.assignment.assignmentId],
    );
    assert.deepEqual(rows, [{ earned_as: 'resident', points: 13 }, { earned_as: 'volunteer', points: 26 }]);
  });

  await t.test('early cancellation saves only the processed event', async () => {
    const event = sampleEvent('RequestAssignmentCancelledResident', { outsideCancellationWindow: false });
    await handle(event);
    assert.deepEqual(await rowsFor(event), { processed: 1, awards: 0, outbox: 0 });
  });

  await t.test('an assignment is never paid twice', async () => {
    const first = sampleEvent('RequestAssignmentDelivered');
    const second = sampleEvent('RequestAssignmentDelivered');
    second.data.assignment = first.data.assignment;
    await handle(first);
    await handle(second);
    assert.deepEqual(await rowsFor(first), { processed: 1, awards: 2, outbox: 1 });
  });
});