'use strict';

/*
 * The notification list routes (N3–N5) over HTTP, with a fake store and hub.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createNotificationsRouter, present } = require('../src/notification/notifications-router');

const ID = '5b1d7c9e-3f2a-5c4b-8d6e-1a2b3c4d5e6f';
const REQUEST_ID = '0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11';

// Stands in for the Postgres store: one stored notification belonging to uid_v1.
function fakeStore() {
  const row = {
    notification_id: ID, type: 'NEW_MATCHING_REQUEST', created_at: new Date('2026-11-20T16:15:00Z'),
    is_read: false, pickup_request_id: REQUEST_ID, account: 'uid_v1',
    quantity: 2, category_name: 'Computers/Laptops', postal_code: 'T2P1J9',
  };
  return {
    row,
    async listForAccount(uid) {
      const mine = row.account === uid ? [row] : [];
      return { rows: mine, unreadCount: mine.filter((r) => !r.is_read).length };
    },
    async markRead(uid, id) {
      if (row.account !== uid || row.notification_id !== id) return false;
      row.is_read = true;
      return true;
    },
    async markAllRead(uid) { if (row.account === uid) row.is_read = true; },
  };
}

// Records what would go to the user's open tabs.
function fakeHub() {
  const sent = [];
  return { sent, send: (uid, event, data) => sent.push({ uid, event, data }) };
}

async function start(t) {
  const store = fakeStore();
  const hub = fakeHub();
  const server = express().use(createNotificationsRouter({ notifications: store, hub })).listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/notifications`;
  const call = (path, uid, method = 'GET') =>
    fetch(`${base}${path}`, { method, headers: uid ? { 'X-User-Id': uid } : {} });
  return { store, hub, call };
}

test('N3 lists the caller\'s notifications in the contract shape, with the unread count', async (t) => {
  const { call } = await start(t);
  assert.equal((await call('', null)).status, 401);

  const res = await call('', 'uid_v1');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    unreadCount: 1,
    notifications: [{
      notificationId: ID,
      type: 'NEW_MATCHING_REQUEST',
      requestId: REQUEST_ID,
      awardId: null,
      title: 'New pickup near you',
      body: '2 * Computers/Laptops in T2P1J9',
      url: `/volunteer/requests/${REQUEST_ID}`,
      isRead: false,
      createdAt: '2026-11-20T16:15:00.000Z',
    }],
  });

  assert.deepEqual(await (await call('', 'uid_other')).json(), { unreadCount: 0, notifications: [] });
  // A 400 names the bad field.
  for (const [query, field] of [['?limit=0', 'limit'], ['?before=yesterday', 'before']]) {
    const bad = await call(query, 'uid_v1');
    assert.equal(bad.status, 400);
    assert.deepEqual(Object.keys((await bad.json()).error.details.fields), [field]);
  }
});

test('N4 marks the caller\'s own notification read and tells their tabs; anyone else gets 404', async (t) => {
  const { store, hub, call } = await start(t);

  assert.equal((await call(`/${ID}/read`, 'uid_other', 'PATCH')).status, 404);
  assert.equal((await call('/not-a-uuid/read', 'uid_v1', 'PATCH')).status, 404);
  assert.equal(store.row.is_read, false);

  assert.equal((await call(`/${ID}/read`, 'uid_v1', 'PATCH')).status, 204);
  assert.equal(store.row.is_read, true);
  assert.deepEqual(hub.sent, [{ uid: 'uid_v1', event: 'notification-read', data: { notificationIds: [ID] } }]);
});

test('N5 marks everything read and sends one notification-read with all: true', async (t) => {
  const { store, hub, call } = await start(t);
  assert.equal((await call('/read-all', 'uid_v1', 'POST')).status, 204);
  assert.equal(store.row.is_read, true);
  assert.deepEqual(hub.sent, [{ uid: 'uid_v1', event: 'notification-read', data: { all: true } }]);
});

test('An award notification lists with its award, the live title and body, and the EcoPoints page', () => {
  const AWARD_ID = '7c2e9a41-0d3b-4f6e-8a15-2b9c4d6e8f01';
  assert.deepEqual(present({
    notification_id: ID, type: 'ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT', created_at: new Date('2026-11-20T16:15:00Z'),
    is_read: false, pickup_request_id: REQUEST_ID, quantity: 2, category_name: 'Computers/Laptops',
    postal_code: 'T2P1J9', update_reason: null, ecopoints_award_id: AWARD_ID, points: '13.50',
  }), {
    notificationId: ID,
    type: 'ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT',
    requestId: REQUEST_ID,
    awardId: AWARD_ID,
    title: 'You earned 13.5 EcoPoints',
    body: 'For 2 * Computers/Laptops delivered',
    url: '/ecopoints',
    isRead: false,
    createdAt: '2026-11-20T16:15:00.000Z',
  });
});
