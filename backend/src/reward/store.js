'use strict';

async function saveResult(pool, eventId, result) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Remember the event. If it is already there, this is a redelivery: do nothing.
    const processed = await client.query(
      'INSERT INTO rewards.processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [eventId],
    );
    if (processed.rowCount === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    // null means no points (15.3): only the processed event is saved.
    if (result) {
      // At most one award per assignment per role: an award that already exists is skipped.
      let saved = 0;
      for (const award of result.awards) {
        const inserted = await client.query(
          `INSERT INTO rewards.ecopoints_award (award_id, assignment_id, account_id, earned_as, points, formula)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT ON CONSTRAINT ecopoints_award_one_per_role DO NOTHING`,
          [award.awardId, result.assignmentId, award.accountId, award.earnedAs, award.points, award.formula],
        );
        saved += inserted.rowCount;
      }

      // Only announce points that were actually saved.
      if (saved > 0) {
        await client.query(
          `INSERT INTO rewards.outbox (event_id, event_type, event_version, routing_key, payload)
           VALUES ($1, $2, $3, $4, $5)`,
          [result.event.eventId, result.event.type, result.event.version, result.routingKey, JSON.stringify(result.event)],
        );
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { saveResult };