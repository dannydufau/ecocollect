'use strict';

/*
 * Stored notifications (notifications.notification + request_notification), per the physical model.
 */

function createNotificationStore(pool) {
  /*
   * Saves one request event's notifications and applies the expiry rules, in one transaction.
   *   rows:  [{ notificationId, type, createdAt, accountId }]
   *   event: { pickupRequestId, requestSeq, transitionId, expiresMatching, update }
   *          update: { reason, changed } for an E2, null for every other event
   * Returns { saved, expired, stale }:
   *   saved:   ids that were new (a redelivered event saves nothing again)
   *   expired: [{ notificationId, accountId, replace }] that this event made stale;
   *            replace: it was pushed and is unread, so it may still be on the phone
   *   stale:   true if a later step of this request was already seen, saved already expired
   */
  async function saveRequestNotifications(rows, { pickupRequestId, requestSeq, transitionId, expiresMatching, update = null }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // An event older than one already seen for this request is late.
      const latest = await client.query(
        'SELECT max(request_seq) AS seq FROM notifications.request_event WHERE pickup_request_id = $1',
        [pickupRequestId],
      );
      const stale = latest.rows[0].seq !== null && requestSeq < Number(latest.rows[0].seq);

      // The event itself, once: the request, its step and the user action. Its notifications point at it.
      await client.query(
        `INSERT INTO notifications.request_event (pickup_request_id, request_seq, transition_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (pickup_request_id, request_seq) DO NOTHING`,
        [pickupRequestId, requestSeq, transitionId],
      );

      // An update event: save its reason, then one row per field an edit changed.
      if (update) {
        await client.query(
          `INSERT INTO notifications.request_update_event (pickup_request_id, request_seq, reason)
           VALUES ($1, $2, $3)
           ON CONFLICT (pickup_request_id, request_seq) DO NOTHING`,
          [pickupRequestId, requestSeq, update.reason],
        );
        await client.query(
          `INSERT INTO notifications.request_changed_field (pickup_request_id, request_seq, field_name)
           SELECT $1, $2, unnest($3::text[])
           ON CONFLICT (pickup_request_id, request_seq, field_name) DO NOTHING`,
          [pickupRequestId, requestSeq, update.changed],
        );
      }

      // Deactivated accounts get nothing (and an id with no account is skipped, not retried forever).
      const active = await client.query(
        'SELECT account_id FROM users.account WHERE account_id = ANY($1) AND deactivated_at IS NULL',
        [rows.map((r) => r.accountId)],
      );
      const activeIds = new Set(active.rows.map((r) => r.account_id));

      const saved = new Set();
      for (const row of rows) {
        if (!activeIds.has(row.accountId)) continue;
        const { rowCount } = await client.query(
          `INSERT INTO notifications.notification
             (notification_id, type, created_at, pushed_at, is_read, is_expired)
           VALUES ($1, $2, $3, NULL, false, $4)
           ON CONFLICT (notification_id) DO NOTHING`,
          [row.notificationId, row.type, row.createdAt, stale],
        );
        if (rowCount === 0) continue;
        await client.query(
          `INSERT INTO notifications.request_notification
             (notification_id, account_id, pickup_request_id, request_seq)
           VALUES ($1, $2, $3, $4)`,
          [row.notificationId, row.accountId, pickupRequestId, requestSeq],
        );
        saved.add(row.notificationId);
      }

      let expired = [];
      if (!stale && saved.size > 0) {
        /*
         * Each recipient's older notifications about this request from other user actions
         * (one action can send several events, and those notifications stay together).
         * When the request leaves Open, every volunteer's NEW_MATCHING_REQUEST about it.
         * Only lower request_seq, so a late event can never expire a newer one.
         */
        const recipients = [...new Set(rows.map((r) => r.accountId))];
        const result = await client.query(
          `UPDATE notifications.notification n SET is_expired = true
           FROM notifications.request_notification rn
           JOIN notifications.request_event ev USING (pickup_request_id, request_seq)
           JOIN users.account a ON a.account_id = rn.account_id
           WHERE n.notification_id = rn.notification_id
             AND rn.pickup_request_id = $1
             AND rn.request_seq < $2
             AND NOT n.is_expired
             AND ((rn.account_id = ANY($3) AND ev.transition_id <> $5) OR ($4 AND n.type = 'NEW_MATCHING_REQUEST'))
           RETURNING n.notification_id, rn.account_id,
             (n.pushed_at IS NOT NULL AND NOT n.is_read AND a.deactivated_at IS NULL) AS replace`,
          [pickupRequestId, requestSeq, recipients, expiresMatching, transitionId],
        );
        expired = result.rows.map((r) => ({ notificationId: r.notification_id, accountId: r.account_id, replace: r.replace }));
      }

      await client.query('COMMIT');
      return { saved, expired, stale };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // A push reached at least one of the recipient's browsers.
  async function markPushed(notificationId) {
    // GREATEST: pushed_at may never be before created_at (notification_ck2), and clocks differ.
    await pool.query(
      'UPDATE notifications.notification SET pushed_at = GREATEST(now(), created_at) WHERE notification_id = $1',
      [notificationId],
    );
  }

  /*
   * One page of the account's unexpired notifications, newest first, and its unread count.
   * `before` (the last createdAt shown) gives the next page. It includes that time, because two
   * notifications can share one (self-accept); the client drops the repeat by notificationId.
   */
  async function listForAccount(uid, { before = null, limit = 30 } = {}) {
    const { rows } = await pool.query(
      `SELECT n.notification_id, n.type, n.created_at, n.is_read, rn.pickup_request_id,
              r.quantity, c.name AS category_name, r.pickup_postal_code AS postal_code,
              ue.reason AS update_reason
       FROM notifications.request_notification rn
       JOIN notifications.notification n ON n.notification_id = rn.notification_id
       JOIN requests.pickup_request r ON r.pickup_request_id = rn.pickup_request_id
       JOIN requests.item_category c ON c.category_id = r.category_id
       -- the reason of an update event, for REQUEST_UPDATED_RESIDENT's title; null for other events
       LEFT JOIN notifications.request_update_event ue
         ON ue.pickup_request_id = rn.pickup_request_id AND ue.request_seq = rn.request_seq
       WHERE rn.account_id = $1
         AND NOT n.is_expired
         AND ($2::timestamptz IS NULL OR n.created_at <= $2)
       ORDER BY n.created_at DESC, n.notification_id
       LIMIT $3`,
      [uid, before, limit],
    );
    // Award notifications join here too once they're saved (UNION ALL, same columns).
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
    // Procedure in db/notification/010_notification_read.sql; NULL fills its OUT parameter.
    const { rows } = await pool.query('CALL notifications.mark_read($1, $2, NULL)', [uid, notificationId]);
    return rows[0].p_found;
  }

  // Marks all of the account's notifications read.
  async function markAllRead(uid) {
    await pool.query('CALL notifications.mark_all_read($1)', [uid]);
  }

  return { saveRequestNotifications, markPushed, listForAccount, markRead, markAllRead };
}

module.exports = { createNotificationStore };
