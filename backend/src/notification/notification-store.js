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

  /*
   * One page of the account's unexpired notifications, newest first, and its unread count.
   * `before` (a createdAt) gives the page after one already shown.
   */
  async function listForAccount(uid, { before = null, limit = 30 } = {}) {
    const { rows } = await pool.query(
      `SELECT n.notification_id, n.type, n.created_at, n.is_read, rn.pickup_request_id
       FROM notifications.request_notification rn
       JOIN notifications.notification n ON n.notification_id = rn.notification_id
       WHERE rn.account_id = $1
         AND NOT n.is_expired
         AND ($2::timestamptz IS NULL OR n.created_at < $2)
       ORDER BY n.created_at DESC, n.notification_id
       LIMIT $3`,
      [uid, before, limit],
    );
    // Award notifications join here too once award_notification exists (UNION ALL, same columns).
    const unread = await pool.query(
      `SELECT count(*)::int AS n
       FROM notifications.request_notification rn
       JOIN notifications.notification n ON n.notification_id = rn.notification_id
       WHERE rn.account_id = $1 AND NOT n.is_expired AND NOT n.is_read`,
      [uid],
    );
    return { rows, unreadCount: unread.rows[0].n };
  }

  // Marks one of the account's notifications read; false if it isn't theirs or doesn't exist.
  async function markRead(uid, notificationId) {
    const { rowCount } = await pool.query(
      `UPDATE notifications.notification n SET is_read = true
       FROM notifications.request_notification rn
       WHERE n.notification_id = rn.notification_id
         AND rn.account_id = $1 AND n.notification_id = $2`,
      [uid, notificationId],
    );
    return rowCount > 0;
  }

  // Marks all of the account's notifications read.
  async function markAllRead(uid) {
    await pool.query(
      `UPDATE notifications.notification n SET is_read = true
       FROM notifications.request_notification rn
       WHERE n.notification_id = rn.notification_id
         AND rn.account_id = $1 AND NOT n.is_read`,
      [uid],
    );
  }

  return { saveRequestNotifications, listForAccount, markRead, markAllRead };
}

module.exports = { createNotificationStore };
