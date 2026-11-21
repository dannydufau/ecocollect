'use strict';

/*
 * Stored notifications (notifications.notification + request_notification), per the physical model.
 */

function createNotificationStore(pool) {
  /*
   * Saves one request event's notifications in one transaction and returns the ids that were new.
   * An id that already exists means the event was redelivered: nothing is saved for it again.
   */
  async function saveRequestNotifications(rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const saved = new Set();
      for (const row of rows) {
        const { rowCount } = await client.query(
          `INSERT INTO notifications.notification
             (notification_id, type, created_at, pushed_at, is_read, is_expired)
           VALUES ($1, $2, $3, NULL, false, false)
           ON CONFLICT (notification_id) DO NOTHING`,
          [row.notificationId, row.type, row.createdAt],
        );
        if (rowCount === 0) continue;
        await client.query(
          `INSERT INTO notifications.request_notification
             (notification_id, account_id, pickup_request_id, request_seq)
           VALUES ($1, $2, $3, $4)`,
          [row.notificationId, row.accountId, row.pickupRequestId, row.requestSeq],
        );
        saved.add(row.notificationId);
      }
      await client.query('COMMIT');
      return saved;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return { saveRequestNotifications };
}

module.exports = { createNotificationStore };
