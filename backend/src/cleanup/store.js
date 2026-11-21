'use strict';

// Cleanup Service data access: expiry jobs, daily run and outbox (contract 14).

const { randomUUID } = require('node:crypto');

// Runs work(db) in a transaction.
async function inTransaction(pool, work) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

// Writes an event to the outbox.
function addToOutbox(db, type, routingKey, occurredAt, data) {
  const event = { eventId: randomUUID(), type, version: 1, occurredAt, producer: 'cleanup-service', traceId: null, data };
  return db.query(
    'INSERT INTO cleanup.outbox (event_id, event_type, routing_key, payload) VALUES ($1, $2, $3, $4)',
    [event.eventId, type, routingKey, event],
  );
}

// 14.1, 14.2: applies a job change if requestSeq is newer than the stored one.
// Returns false for an event that was already processed.
function saveJobChange(pool, eventId, { requestId, requestSeq, expiresAt }) {
  return inTransaction(pool, async (db) => {
    const processed = await db.query(
      'INSERT INTO cleanup.processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [eventId],
    );
    if (processed.rowCount === 0) return false;

    await db.query(
      `INSERT INTO cleanup.expiry_job (request_id, request_seq, expires_at, run_at) VALUES ($1, $2, $3, $3)
       ON CONFLICT (request_id) DO UPDATE SET request_seq = $2, expires_at = $3, run_at = $3, fire_count = 0
       WHERE cleanup.expiry_job.request_seq < $2`,
      [requestId, requestSeq, expiresAt],
    );
    return true;
  });
}

// 14.3, 14.5: writes a CleanupRequest for each due job and reschedules it 5 minutes later.
// Returns the fired jobs.
function fireDueJobs(pool, at = null) {
  return inTransaction(pool, async (db) => {
    const { rows } = await db.query(
      `WITH clock AS (SELECT COALESCE($1::timestamptz, now()) AS moment)
       UPDATE cleanup.expiry_job SET run_at = clock.moment + interval '5 minutes', fire_count = fire_count + 1
       FROM clock WHERE run_at <= clock.moment
       RETURNING request_id, request_seq, expires_at, fire_count, clock.moment AS fired_at`,
      [at],
    );
    for (const job of rows) {
      await addToOutbox(db, 'CleanupRequest', 'cleanup.request.due', job.fired_at, {
        requestId: job.request_id, requestSeq: job.request_seq, expiresAt: job.expires_at,
      });
    }
    return rows;
  });
}

// 14.4: writes NotificationCleanupRequested once per Calgary day, from 03:00.
// Returns true when written.
function requestDailyCleanup(pool, at = null) {
  return inTransaction(pool, async (db) => {
    const { rows } = await db.query(
      `WITH clock AS (SELECT COALESCE($1::timestamptz, now()) AS moment)
       INSERT INTO cleanup.daily_run (run_date)
       SELECT (moment AT TIME ZONE 'America/Edmonton')::date FROM clock
       WHERE (moment AT TIME ZONE 'America/Edmonton')::time >= '03:00'
       ON CONFLICT DO NOTHING
       RETURNING (SELECT moment FROM clock) AS requested_at`,
      [at],
    );
    if (rows.length === 0) return false;

    const requestedAt = rows[0].requested_at;
    await addToOutbox(db, 'NotificationCleanupRequested', 'cleanup.notifications.due', requestedAt, { requestedAt });
    return true;
  });
}

module.exports = { saveJobChange, fireDueJobs, requestDailyCleanup };