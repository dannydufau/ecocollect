/*
 * In-memory push subscriptions, shaped like the push_subscription table.
 * Lost on restart (the frontend re-sends on load); a Postgres store with the same functions can replace it.
 */
function createSubscriptionStore() {
  const byUser = new Map();   // uid -> Map<endpoint, subscription>
  const owner = new Map();    // endpoint -> uid (an endpoint belongs to one account)

  // Adds or refreshes a subscription; moves the endpoint if another account had it.
  function add(uid, { endpoint, keys, expirationTime = null }, userAgent = null) {
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new Error('endpoint, keys.p256dh and keys.auth are required');
    }
    const previous = owner.get(endpoint);
    if (previous && previous !== uid) remove(previous, endpoint);

    if (!byUser.has(uid)) byUser.set(uid, new Map());
    byUser.get(uid).set(endpoint, {
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      expirationTime,
      userAgent,
      updatedAt: new Date().toISOString(),
    });
    owner.set(endpoint, uid);
  }

  function list(uid) {
    return [...(byUser.get(uid)?.values() ?? [])];
  }

  // Removes one endpoint (logout, or the push service answered 404/410).
  function remove(uid, endpoint) {
    const subs = byUser.get(uid);
    if (!subs?.delete(endpoint)) return false;
    if (subs.size === 0) byUser.delete(uid);
    owner.delete(endpoint);
    return true;
  }

  return { add, list, remove };
}

module.exports = { createSubscriptionStore };
