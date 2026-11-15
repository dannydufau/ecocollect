'use strict';

// Saves expiry jobs and turns due jobs into outgoing events (contract 14).

const { randomUUID } = require('node:crypto');

// Runs work(db) in one transaction: all of it is saved, or none of it.
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

// Adds an outgoing event to the outbox. The outbox publisher sends it.
function addToOutbox(db, type, routingKey, data) {
  const event = { eventId: randomUUID(), type, version: 1, occurredAt: new Date().toISOString(), producer: 'cleanup-service', traceId: null, data };
  return db.query(
    'INSERT INTO cleanup.outbox (event_id, event_type, routing_key, payload) VALUES ($1, $2, $3, $4)',
    [event.eventId, type, routingKey, event],
  );
}

// 14.1, 14.2: sets, moves or ends a request's job, but only if the event is newer than the job.
// Returns false if the event was already handled.
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

// 14.3, 14.5: each due job sends a CleanupRequest and is due again in 5 minutes.
// Returns the jobs that fired.
function fireDueJobs(pool) {
  return inTransaction(pool, async (db) => {
    const { rows } = await db.query(
      `UPDATE cleanup.expiry_job SET run_at = now() + interval '5 minutes', fire_count = fire_count + 1
       WHERE run_at <= now()
       RETURNING request_id, request_seq, expires_at, fire_count`,
    );
    for (const job of rows) {
      await addToOutbox(db, 'CleanupRequest', 'cleanup.request.due', {
        requestId: job.request_id, requestSeq: job.request_seq, expiresAt: job.expires_at,
      });
    }
    return rows;
  });
}

// 14.4: from 03:00 Calgary time (America/Edmonton), sends NotificationCleanupRequested once a day.
// Returns true if it was sent now.
function requestDailyCleanup(pool) {
  return inTransaction(pool, async (db) => {
    const { rowCount } = await db.query(
      `INSERT INTO cleanup.daily_run (run_date)
       SELECT (now() AT TIME ZONE 'America/Edmonton')::date
       WHERE (now() AT TIME ZONE 'America/Edmonton')::time >= '03:00'
       ON CONFLICT DO NOTHING`,
    );
    if (rowCount === 1) {
      await addToOutbox(db, 'NotificationCleanupRequested', 'cleanup.notifications.due', { requestedAt: new Date() });
    }
    return rowCount === 1;
  });
}

module.exports = { saveJobChange, fireDueJobs, requestDailyCleanup };