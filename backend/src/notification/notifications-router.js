'use strict';

/*
 * The notification list: GET /api/notifications, N4 PATCH /api/notifications/:id/read,
 * POST /api/notifications/read-all. Every route is the caller's own notifications only.
 */

const express = require('express');

const { gatewayUser } = require('../api/requests/user');
const { describe, describeAward, describeEnded, NOTIFICATION_TYPES, UPDATE_TITLES } = require('./handlers');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/;

function isValidUtcTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = TIMESTAMP.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

// Error body: { error: { code, message } }.
function fail(res, status, code, message, details) {
  return res.status(status).json({ error: { code, message, ...(details && { details }) } });
}

// A stored row in the Notification shape; title, body and url are built here.
function present(row) {
  const t = NOTIFICATION_TYPES[row.type];
  const common = {
    notificationId: row.notification_id,
    type: row.type,
    requestId: row.pickup_request_id,
    isRead: row.is_read,
    // Keep the milliseconds: the client sends this back as `before`, and a page must end exactly here.
    createdAt: row.created_at.toISOString(),
  };

  const window = row.pickup_date ? { date: row.pickup_date, startHour: row.start_hour } : undefined;

  // An award notification opens the EcoPoints page.
  if (row.ecopoints_award_id) {
    const { title, body } = describeAward(row.type, row.points, { quantity: row.quantity, categoryName: row.category_name, window });
    return { ...common, awardId: row.ecopoints_award_id, title, body, url: t?.path ?? '/' };
  }

  return {
    ...common,
    awardId: null,
    // An update's title depends on its reason (edited or reopened), like the live message.
    title: (row.type === 'REQUEST_UPDATED_RESIDENT' && UPDATE_TITLES[row.update_reason]) || t?.title || 'Notification',
    // Same text as the live message. A request can only change while Open, which expires these.
    body: t?.endedAs
      ? describeEnded(t.endedAs, window)
      : describe({ quantity: row.quantity, categoryName: row.category_name, postalCode: row.postal_code }),
    url: t ? (t.endedAs ? t.path : `${t.path}${row.pickup_request_id}`) : '/',
  };
}

function createNotificationsRouter({ notifications, hub }) {
  const router = express.Router();
  router.use('/api/notifications', gatewayUser);

  // Newest first, never expired; page with `before` (the createdAt of the last one shown, included).
  router.get('/api/notifications', async (req, res) => {
    const { before, limit } = req.query;
    if (before !== undefined && !isValidUtcTimestamp(before)) {
      return fail(res, 400, 'validation_failed', 'before must be a UTC timestamp like 2026-10-28T16:15:00Z',
        { fields: { before: 'must be a UTC timestamp like 2026-10-28T16:15:00Z' } });
    }
    const n = limit === undefined ? 30 : Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return fail(res, 400, 'validation_failed', 'limit must be a whole number from 1 to 100',
        { fields: { limit: 'must be a whole number from 1 to 100' } });
    }
    try {
      const { rows, unreadCount } = await notifications.listForAccount(req.user.uid, { before: before ?? null, limit: n });
      res.json({ unreadCount, notifications: rows.map(present) });
    } catch (err) {
      console.error(`[notifications] list failed: ${err.message}`);
      fail(res, 500, 'internal_error', 'Something went wrong');
    }
  });

  // 404 when it isn't the caller's (or isn't there), so other users' ids can't be probed.
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

  // Then one notification-read with all: true.
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
