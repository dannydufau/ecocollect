'use strict';

/*
 * Push subscriptions in Postgres (notifications.push_subscription): one row per browser.
 */

function createSubscriptionStore(pool) {
  // Saves a browser's subscription; the same endpoint again updates it (and moves it to this account).
  async function add(uid, { endpoint, keys, expirationTime = null }, userAgent = null) {
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw Object.assign(new Error('endpoint, keys.p256dh and keys.auth are required'), { status: 400 });
    }
    await pool.query(
      `INSERT INTO notifications.push_subscription
         (endpoint, account_id, p256dh, auth, expiration_time, user_agent, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (endpoint) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         expiration_time = EXCLUDED.expiration_time,
         user_agent = EXCLUDED.user_agent,
         updated_at = now()`,
      // The browser gives expirationTime in milliseconds (or null).
      [endpoint, uid, keys.p256dh, keys.auth, expirationTime == null ? null : new Date(expirationTime), userAgent],
    );
  }

  // Every browser this user turned push on in, in the shape web-push expects.
  async function list(uid) {
    const { rows } = await pool.query(
      'SELECT endpoint, p256dh, auth FROM notifications.push_subscription WHERE account_id = $1',
      [uid],
    );
    return rows.map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }));
  }

  // Forgets one browser (logout, or the push service answered 404/410).
  async function remove(uid, endpoint) {
    const { rowCount } = await pool.query(
      'DELETE FROM notifications.push_subscription WHERE account_id = $1 AND endpoint = $2',
      [uid, endpoint],
    );
    return rowCount > 0;
  }

  return { add, list, remove };
}

module.exports = { createSubscriptionStore };
