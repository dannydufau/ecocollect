'use strict';

/*
 * The notification list: N3 GET /api/notifications, N4 PATCH /api/notifications/:id/read,
 * N5 POST /api/notifications/read-all. Every route is the caller's own notifications only.
 */

const express = require('express');

const { gatewayUser } = require('../api/requests/user');
const { NOTIFICATION_TYPES } = require('./handlers');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// The contract's error body: { error: { code, message } }.
function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// A stored row in the contract's Notification shape; title, body and url are built here.
function present(row) {
  const t = NOTIFICATION_TYPES[row.type];
  return {
    notificationId: row.notification_id,
    type: row.type,
    requestId: row.pickup_request_id,
    awardId: null,
    title: t?.title ?? 'Notification',
    body: t?.listBody ?? 'Open EcoCollect for details',
    url: t ? `${t.path}${row.pickup_request_id}` : '/',
    isRead: row.is_read,
    createdAt: row.created_at.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

function createNotificationsRouter({ notifications, hub }) {
  const router = express.Router();
  router.use('/api/notifications', gatewayUser);

  // N3: newest first, never expired; page with `before` (the createdAt of the last one shown).
  router.get('/api/notifications', async (req, res) => {
    const { before, limit } = req.query;
    if (before !== undefined && !(typeof before === 'string' && TIMESTAMP.test(before))) {
      return fail(res, 400, 'invalid_before', 'before must be a UTC timestamp like 2026-10-28T16:15:00Z');
    }
    const n = limit === undefined ? 30 : Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return fail(res, 400, 'invalid_limit', 'limit must be a whole number from 1 to 100');
    }
    try {
      const { rows, unreadCount } = await notifications.listForAccount(req.user.uid, { before: before ?? null, limit: n });
      res.json({ unreadCount, notifications: rows.map(present) });
    } catch (err) {
      console.error(`[notifications] list failed: ${err.message}`);
      fail(res, 500, 'internal_error', 'Something went wrong');
    }
  });

  // N4: 404 when it isn't the caller's (or isn't there), so other users' ids can't be probed.
  router.patch('/api/notifications/:id/read', async (req, res) => {
    const { id } = req.params;
    try {
      if (!UUID.test(id) || !(await notifications.markRead(req.user.uid, id))) {
        return fail(res, 404, 'notification_not_found', 'No such notification');
      }
    } catch (err) {
      console.error(`[notifications] mark read failed: ${err.message}`);
      return fail(res, 500, 'internal_error', 'Something went wrong');
    }
    hub.send(req.user.uid, 'notification-read', { notificationIds: [id] });
    res.status(204).end();
  });

  // N5: then one notification-read with all: true.
  router.post('/api/notifications/read-all', async (req, res) => {
    try {
      await notifications.markAllRead(req.user.uid);
    } catch (err) {
      console.error(`[notifications] mark all read failed: ${err.message}`);
      return fail(res, 500, 'internal_error', 'Something went wrong');
    }
    hub.send(req.user.uid, 'notification-read', { all: true });
    res.status(204).end();
  });

  return router;
}

module.exports = { createNotificationsRouter, present };
