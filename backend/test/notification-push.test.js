'use strict';

/*
 * Web Push: the payload, the real sender against a fake push service, and the N6/N7 routes.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const webpush = require('web-push');

const { pushPayload, createWebPushSender } = require('../src/notification/push');
const { createPushRouter } = require('../src/notification/push-router');

const quiet = { info() {}, warn() {} };

// Stands in for the Postgres store: the same three functions, rows kept in a Map.
function fakeStore() {
  const rows = new Map(); // endpoint -> { uid, endpoint, keys }
  return {
    async add(uid, { endpoint, keys }) {
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        throw Object.assign(new Error('endpoint, keys.p256dh and keys.auth are required'), { status: 400 });
      }
      rows.set(endpoint, { uid, endpoint, keys });
    },
    async list(uid) {
      return [...rows.values()].filter((r) => r.uid === uid).map(({ endpoint, keys }) => ({ endpoint, keys }));
    },
    async remove(uid, endpoint) {
      return rows.get(endpoint)?.uid === uid && rows.delete(endpoint);
    },
  };
}

// Our VAPID keys, made for the test (no .env needed).
const keys = webpush.generateVAPIDKeys();
const vapid = { subject: 'mailto:test@example.com', publicKey: keys.publicKey, privateKey: keys.privateKey };

// A browser's subscription: real P-256 public key and auth secret, so web-push can encrypt to it.
function browserSubscription(endpoint) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') },
  };
}

// Stands in for FCM/Mozilla: records each request and answers with `status`.
async function fakePushService(status) {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push({ method: req.method, headers: req.headers, body: Buffer.concat(chunks) });
      res.statusCode = status;
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { endpoint: `http://127.0.0.1:${server.address().port}/push/abc`, received, close: () => server.close() };
}

test('pushPayload keeps only what the OS notification needs, tagged by request or award', () => {
  const notification = {
    notificationId: 'n_1',
    type: 'NEW_MATCHING_REQUEST',
    requestId: 'r1',
    awardId: null,
    title: 'New pickup near you',
    body: '2 x Computers/Laptops in T2P1J9',
    url: '/volunteer/requests/r1',
    createdAt: '2026-10-28T16:15:00Z',
  };

  assert.deepEqual(pushPayload(notification), {
    notificationId: 'n_1',
    title: 'New pickup near you',
    body: '2 x Computers/Laptops in T2P1J9',
    url: '/volunteer/requests/r1',
    tag: 'request-r1',
    silent: false,
  });

  assert.equal(pushPayload({ ...notification, requestId: null, awardId: 'a1' }).tag, 'award-a1');
});

test('the sender POSTs a signed, encrypted push to each of the user\'s browsers', async (t) => {
  const service = await fakePushService(201);
  t.after(service.close);
  const subscriptions = fakeStore();
  await subscriptions.add('uid_v1', browserSubscription(service.endpoint));
  const payload = { title: 'New pickup near you', tag: 'request-r1' };

  const delivered = await createWebPushSender({ vapid, subscriptions, log: quiet }).send('uid_v1', payload);

  assert.equal(delivered, 1);
  const [push] = service.received;
  assert.equal(push.method, 'POST');
  assert.equal(push.headers['content-encoding'], 'aes128gcm');
  assert.match(push.headers.authorization, new RegExp(`^vapid t=.+, k=${vapid.publicKey}$`));
  assert.ok(push.body.length > 0);
  assert.ok(!push.body.toString().includes('New pickup'), 'the push service must not see the text');
});

test('a 410 from the push service forgets that subscription', async (t) => {
  const service = await fakePushService(410);
  t.after(service.close);
  const subscriptions = fakeStore();
  await subscriptions.add('uid_v1', browserSubscription(service.endpoint));

  const delivered = await createWebPushSender({ vapid, subscriptions, log: quiet }).send('uid_v1', { title: 'x' });

  assert.equal(delivered, 0);
  assert.deepEqual(await subscriptions.list('uid_v1'), []);
});

test('POST /api/push/subscriptions saves the caller\'s subscription, DELETE removes it', async (t) => {
  const subscriptions = fakeStore();
  const server = express().use(createPushRouter({ subscriptions })).listen(0);
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/push/subscriptions`;
  const call = (method, headers, body) =>
    fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const user = { 'X-User-Id': 'uid_v1' };
  const sub = browserSubscription('https://push.example/abc');

  assert.equal((await call('POST', {}, sub)).status, 401);
  assert.equal((await call('POST', user, { endpoint: 'https://push.example/abc' })).status, 400);

  assert.equal((await call('POST', user, sub)).status, 201);
assert.equal((await subscriptions.list('uid_v1'))[0].endpoint, sub.endpoint);
  assert.equal((await call('DELETE', user, { endpoint: sub.endpoint })).status, 204);
  assert.deepEqual(await subscriptions.list('uid_v1'), []);
});
