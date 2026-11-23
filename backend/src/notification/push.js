'use strict';

/*
 * Web Push: what a push carries, and who sends it.
 * The sender is the seam: the real one below, or the logging stand-in for tests and demos.
 */

const webpush = require('web-push');

// The push payload, built from a notification; tag lets a newer push replace an older one.
function pushPayload(notification) {
  const tag = notification.awardId
    ? `award-${notification.awardId}`
    : `request-${notification.requestId}`;
  return {
    notificationId: notification.notificationId,
    title: notification.title,
    body: notification.body,
    url: notification.url,
    tag,
    silent: false,
  };
}

/*
 * Real Web Push: for each of the user's browsers, web-push signs (VAPID JWT) and
 * encrypts (aes128gcm) the request; we POST it to that browser's push service.
 */
function createWebPushSender({ vapid, subscriptions, log = console }) {
  async function send(uid, payload) {
    const body = JSON.stringify(payload);
    let delivered = 0;

    for (const sub of await subscriptions.list(uid)) {
      try {
        const req = webpush.generateRequestDetails(sub, body, {
          vapidDetails: vapid,      // { subject, publicKey, privateKey }
          TTL: 60 * 60,             // the push service holds it up to an hour if the device is offline
        });
        // fetch sets Content-Length itself.
        const { 'Content-Length': _, ...headers } = req.headers;
        const res = await fetch(req.endpoint, {
          method: req.method,
          headers,
          body: req.body,
          signal: AbortSignal.timeout(10000), // give up on a push service after 10 s
          redirect: 'error',                  // never follow a push URL somewhere else
        });

        if (res.status === 404 || res.status === 410) {
          // Browser unsubscribed or the subscription expired: forget it.
          await subscriptions.remove(uid, sub.endpoint);
          log.info?.(`[push] removed dead subscription for ${uid}`);
        } else if (!res.ok) {
          log.warn?.(`[push] ${res.status} from push service for ${uid}`);
        } else {
          delivered += 1;
        }
      } catch (err) {
        // One browser failing (network error, timeout, redirect) mustn't stop the others.
        log.warn?.(`[push] failed for one of ${uid}'s browsers: ${err.message}`);
      }
    }
    return delivered;
  }

  return { send };
}

// Stand-in sender: logs what would be pushed. Async like the real one will be.
function createLogSender({ log = console } = {}) {
  return {
    async send(uid, payload) {
      log.info(`[push] would push to ${uid}: "${payload.title}" (${payload.tag})`);
    },
  };
}

module.exports = { pushPayload, createLogSender, createWebPushSender };