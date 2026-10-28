'use strict';

// GET /api/events: one Server-Sent Events stream per browser tab.
//
// The response is never ended by us during normal operation; the hub keeps it
// and writes signal frames to it. This module owns everything about ONE
// connection: auth, headers, the ready frame, the heartbeat, and cleanup.

const express = require('express');

// gatewayUser is gateway auth (trusts X-User-Id from Caddy), not request logic.
// It lives in api/requests/ only because the request service needed it first.
// TODO(danny): move to a shared src/gateway/user.js and import from both services.
const { gatewayUser } = require('../api/requests/user');

const DEFAULT_HEARTBEAT_MS = 25000;

// First frame on every new stream. Writing something immediately is what
// makes the browser's EventSource report the stream as open, so the frontend
// can refetch right away instead of waiting for the first ping (see #15).
const READY_FRAME = 'event: ready\ndata: {}\n\n';

// SSE comment line: browsers ignore it. Keeps idle connections alive through
// proxies and routers, and a failed write reveals a dead connection.
const PING_FRAME = ': ping\n\n';

/**
 * @param {object} hub                   from createHub()
 * @param {object} [opts]
 * @param {number} [opts.heartbeatMs]    ping interval; tests pass a small value
 * @param {object} [opts.log]            console-like logger
 */
function createEventsRouter(hub, { heartbeatMs = DEFAULT_HEARTBEAT_MS, log = console } = {}) {
  const router = express.Router();

  // gatewayUser runs first: no X-User-Id means 401, and we never open a stream.
  router.get('/api/events', gatewayUser, (req, res) => {
    const { uid } = req.user;

    // 1. Headers that make this a stream, sent now rather than on first write.
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform', // no caching, no compression in between
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    // 2. Make this tab reachable, then tell the browser the stream is live.
    hub.add(uid, res);
    res.write(READY_FRAME);

    // 3. Heartbeat for this connection only.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(PING_FRAME);
    }, heartbeatMs);

    // 4. Cleanup, however the stream ends: tab closed, network gone, a failed
    //    ping, or hub.closeAll() at shutdown. Without this the hub would keep
    //    writing to dead connections.
    res.on('close', () => {
      clearInterval(heartbeat);
      hub.remove(uid, res);
      log.info?.(`[events] closed stream for ${uid}`);
    });

    log.info?.(`[events] opened stream for ${uid}`);
    // The handler returns here, but the response stays open: nothing ended it.
  });

  return router;
}

module.exports = { createEventsRouter, READY_FRAME, PING_FRAME, DEFAULT_HEARTBEAT_MS };