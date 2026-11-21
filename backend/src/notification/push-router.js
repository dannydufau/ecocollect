'use strict';

/*
 * Web Push subscriptions: save (N6) or remove (N7) this browser's subscription.
 */

const express = require('express');

const { gatewayUser } = require('../api/requests/user');

// Error body: { error: { code, message } }, the same as the other routes.
function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function createPushRouter({ subscriptions }) {
  const router = express.Router();

  router.use('/api/push/subscriptions', gatewayUser, express.json());

  // Body: subscription.toJSON(), { endpoint, expirationTime, keys: { p256dh, auth } }.
  router.post('/api/push/subscriptions', async (req, res) => {
    try {
      await subscriptions.add(req.user.uid, req.body ?? {}, req.get('User-Agent') ?? null);
    } catch (err) {
      if (err.status === 400) return fail(res, 400, 'invalid_subscription', err.message);
      // 23503: foreign key violation, the uid has no row in users.account.
      if (err.code === '23503') return fail(res, 400, 'unknown_account', 'No account for this user');
      console.error(`[push] saving a subscription failed: ${err.message}`);
      return fail(res, 500, 'internal_error', 'Something went wrong');
    }
    res.status(201).end();
  });

  // On logout. Nothing to remove is still a 204.
  router.delete('/api/push/subscriptions', async (req, res) => {
    const { endpoint } = req.body ?? {};
    try {
      if (endpoint) await subscriptions.remove(req.user.uid, endpoint);
    } catch (err) {
      console.error(`[push] removing a subscription failed: ${err.message}`);
      return fail(res, 500, 'internal_error', 'Something went wrong');
    }
    res.status(204).end();
  });

  // express.json() marks a body that isn't JSON with status 400.
  router.use((err, req, res, next) => {
    if (err.status === 400) return fail(res, 400, 'invalid_json', 'The body is not valid JSON');
    next(err);
  });

  return router;
}

module.exports = { createPushRouter };
