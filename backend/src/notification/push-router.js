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
  router.post('/api/push/subscriptions', (req, res) => {
    try {
      subscriptions.add(req.user.uid, req.body ?? {}, req.get('User-Agent') ?? null);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    res.status(201).end();
  });

  // on logout. Nothing to remove is still a 204.
  router.delete('/api/push/subscriptions', (req, res) => {
    const { endpoint } = req.body ?? {};
    if (endpoint) subscriptions.remove(req.user.uid, endpoint);
    res.status(204).end();
  });

  // express.json() marks a body that is not JSON with status 400.
  router.use((err, req, res, next) => {
    if (err.status === 400) return res.status(400).json({ error: 'the body is not valid JSON' });
    next(err);
  });

  return router;
}

module.exports = { createPushRouter };
