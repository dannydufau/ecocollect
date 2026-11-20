'use strict';

/*
 * Web Push subscriptions: save (N6) or remove (N7) this browser's subscription.
 */

const express = require('express');

const { gatewayUser } = require('../api/requests/user');

function createPushRouter({ subscriptions }) {
  const router = express.Router();

  router.use('/api/push/subscriptions', gatewayUser, express.json());

  // Body: subscription.toJSON(), { endpoint, expirationTime, keys: { p256dh, auth } }.
  router.post('/api/push/subscriptions', async (req, res) => {
    try {
      await subscriptions.add(req.user.uid, req.body ?? {}, req.get('User-Agent') ?? null);
    } catch (err) {
      if (err.status === 400) return res.status(400).json({ error: err.message });
      // 23503: foreign key violation, the uid has no row in users.account.
      if (err.code === '23503') return res.status(400).json({ error: 'unknown account' });
      console.error(`[push] saving a subscription failed: ${err.message}`);
      return res.status(500).json({ error: 'internal error' });
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
      return res.status(500).json({ error: 'internal error' });
    }
    res.status(204).end();
  });

  return router;
}

module.exports = { createPushRouter };
