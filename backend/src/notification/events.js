'use strict';

// GET /api/events: one Server-Sent Events stream per browser tab, kept open and written to by the hub.

const express = require('express');

// TODO(#1): gatewayUser is gateway auth; move it to a shared src/gateway/user.js.
const { gatewayUser } = require('../api/requests/user');

const DEFAULT_HEARTBEAT_MS = 25000;

// Sent first, so the browser's EventSource opens right away and the frontend can refetch (see #15).
const READY_FRAME = 'event: ready\ndata: {}\n\n';

// SSE comment, ignored by browsers: keeps idle connections alive through proxies.
const PING_FRAME = ': ping\n\n';

function createEventsRouter(hub, { heartbeatMs = DEFAULT_HEARTBEAT_MS, log = console } = {}) {
  const router = express.Router();

  // gatewayUser answers 401 without X-User-Id, so no stream is opened.
  router.get('/api/events', gatewayUser, (req, res) => {
    const { uid } = req.user;

    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    hub.add(uid, res);
    res.write(READY_FRAME);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(PING_FRAME);
    }, heartbeatMs);

    // However the stream ends (tab closed, network gone, shutdown), stop writing to it.
    res.on('close', () => {
      clearInterval(heartbeat);
      hub.remove(uid, res);
      log.info?.(`[events] closed stream for ${uid}`);
    });

    log.info?.(`[events] opened stream for ${uid}`);
  });

  return router;
}

module.exports = { createEventsRouter, READY_FRAME, PING_FRAME, DEFAULT_HEARTBEAT_MS };