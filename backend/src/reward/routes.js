'use strict';

// R1 to R3 (contract 5.3). R1 reads the caller from X-User-Id, set by the gateway.
// R2 and R3 are public and never read X-User-* headers (contract 4.8).

const express = require('express');
const { getEcopoints, getPublicStats, getProfileStats } = require('./store');

function createRoutes(pool) {
  const router = express.Router();

  // R1: the signed-in account's EcoPoints.
  router.get('/api/ecopoints', async (req, res) => {
    const accountId = req.get('X-User-Id');
    if (!accountId) {
      res.status(401).json({ error: { code: 'unauthenticated', message: 'Sign in to view your EcoPoints.' } });
      return;
    }
    res.json(await getEcopoints(pool, accountId));
  });

  // R2: community impact statistics.
  router.get('/api/public/stats', async (req, res) => {
    res.json(await getPublicStats(pool));
  });

  // R3: the EcoPoints shown on a public profile.
  router.get('/api/public/profiles/:accountId/stats', async (req, res) => {
    res.json(await getProfileStats(pool, req.params.accountId));
  });

  return router;
}

module.exports = { createRoutes };