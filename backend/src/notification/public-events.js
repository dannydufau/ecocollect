'use strict';

/*
 * GET /api/public/events (N2): one Server-Sent Events stream per public page, no login.
 * Opened with exactly one of ?profile=<accountId> (a public profile page) or ?stats (the
 * statistics page). Its messages only say what to refetch; no user data travels on it.
 *
 * Watchers are kept in their own hub (from createHub()), keyed by what they watch instead of
 * by user: profileKey(accountId) or STATS_KEY. The same ready frame and heartbeat as /api/events.
 */

const express = require('express');

const { READY_FRAME, PING_FRAME, DEFAULT_HEARTBEAT_MS } = require('./events');

// Same rule as the AccountId schema in the contract.
const ACCOUNT_ID = /^[a-z0-9_-]{3,50}$/;

// Hub keys: what a watcher is watching.
const STATS_KEY = 'stats';
function profileKey(accountId) {
  return `profile:${accountId}`;
}

// Error body: { error: { code, message, details } }, as in notifications-router.js.
function fail(res, code, message, fields) {
  return res.status(400).json({ error: { code, message, details: { fields } } });
}

/**
 * @param {object} publicHub              a hub of its own, from createHub()
 * @param {object} [opts]
 * @param {number} [opts.heartbeatMs]     ping interval; tests pass a small value
 * @param {object} [opts.log]             console-like logger
 */
function createPublicEventsRouter(publicHub, { heartbeatMs = DEFAULT_HEARTBEAT_MS, log = console } = {}) {
  const router = express.Router();

  router.get('/api/public/events', (req, res) => {
    const { profile } = req.query;
    // ?stats arrives as stats = '' (no value), so check that it is there, not its value.
    const wantsProfile = profile !== undefined;
    const wantsStats = req.query.stats !== undefined;

    // 1. Exactly one of the two.
    if (wantsProfile === wantsStats) {
      const problem = 'use exactly one of profile or stats';
      return fail(res, 'invalid_stream', `Open the stream with ${problem}.`, { profile: problem, stats: problem });
    }

    // 2. A profile must be one account id (a repeated ?profile= arrives as an array).
    const profileIsValid = typeof profile === 'string' && ACCOUNT_ID.test(profile);
    if (wantsProfile && !profileIsValid) {
      return fail(res, 'invalid_profile', 'profile must be an account id.', { profile: 'must be an account id' });
    }

    const key = wantsProfile ? profileKey(profile) : STATS_KEY;

    // 3. Headers that make this a stream, sent now rather than on first write.
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    // 4. Make this page reachable by what it watches, then tell the browser the stream is live.
    publicHub.add(key, res);
    res.write(READY_FRAME);

    // 5. Heartbeat for this connection only.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(PING_FRAME);
    }, heartbeatMs);

    // 6. Cleanup, however the stream ends.
    res.on('close', () => {
      clearInterval(heartbeat);
      publicHub.remove(key, res);
      log.info?.(`[public-events] closed stream for ${key}`);
    });

    log.info?.(`[public-events] opened stream for ${key}`);
  });

  return router;
}

module.exports = { createPublicEventsRouter, profileKey, STATS_KEY };
