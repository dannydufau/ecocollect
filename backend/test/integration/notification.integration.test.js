'use strict';

/*
 * The whole notification service: the real index.js as its own process against
 * a real RabbitMQ. Open tabs, publish RequestCreated, see signals, notifications and pushes.
 * Run with `npm run test:integration` (from backend/); skipped without RABBITMQ_URL.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { randomUUID, createECDH, randomBytes } = require('node:crypto');
const amqp = require('amqplib');
const webpush = require('web-push');

const { exchange, events, queues } = require('../../src/messaging/topology');
const { declareConsumerQueue } = require('../../src/messaging/declare');

const URL_AMQP = process.env.RABBITMQ_URL;
const skip = URL_AMQP ? false : 'RABBITMQ_URL not set';
const ENTRY = path.join(__dirname, '../../src/notification/index.js');

// VAPID keys for this run; index.js refuses to start without them.
const VAPID = webpush.generateVAPIDKeys();

async function waitFor(condition, what, ms = 10000) {
  const deadline = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

// Ask the OS for a free port, then release it for the service to use.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// Starts index.js as a child process; resolves once it is listening and consuming.
async function startService() {
  const port = await freePort();
  const child = spawn(process.execPath, [ENTRY], {
    env: {
      ...process.env,
      RABBITMQ_URL: URL_AMQP,
      PORT: String(port),
      VAPID_PUBLIC_KEY: VAPID.publicKey,
      VAPID_PRIVATE_KEY: VAPID.privateKey,
      VAPID_SUBJECT: 'mailto:test@example.com',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = [];
  const collect = (chunk) => lines.push(...chunk.toString().split('\n').filter(Boolean));
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));

  await waitFor(
    () => lines.some((l) => l.includes('listening on port')) && lines.some((l) => l.includes('consuming')),
    `the service to start (log so far: ${JSON.stringify(lines)})`,
  );
  const base = `http://127.0.0.1:${port}`;
  return { child, lines, exited, url: `${base}/api/events`, subscriptionsUrl: `${base}/api/push/subscriptions` };
}

async function stopService(service) {
  if (service.child.exitCode === null) service.child.kill('SIGTERM');
  return service.exited;
}

// A browser tab: opens the stream as a signed-in user (as Caddy would, via X-User-Id).
async function openTab(url, uid) {
  const abort = new AbortController();
  const res = await fetch(url, { headers: { 'X-User-Id': uid }, signal: abort.signal });
  const tab = { res, text: '', close: () => abort.abort() };
  (async () => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of res.body) tab.text += decoder.decode(chunk, { stream: true });
    } catch { /* aborted */ }
  })();
  await waitFor(() => tab.text.includes('event: ready'), `the ready frame for ${uid}`);
  return tab;
}

// Stands in for FCM/Mozilla: records the path of each push it receives and accepts it.
async function startPushService() {
  const paths = [];
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      paths.push(req.url);
      res.statusCode = 201;
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { paths, endpointFor: (uid) => `${base}/push/${uid}`, close: () => server.close() };
}

// A browser subscribing to push (N6), as Caddy would forward it, with its own keys.
async function subscribe(service, pushService, uid) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const res = await fetch(service.subscriptionsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': uid },
    body: JSON.stringify({
      endpoint: pushService.endpointFor(uid),
      keys: {
        p256dh: ecdh.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    }),
  });
  assert.equal(res.status, 201);
}

// Every complete frame of one event name received so far: { id, data } (id undefined if none).
function framesIn(tab, event) {
  return tab.text
    .split('\n\n')
    .slice(0, -1) // the last piece may still be arriving
    .map((frame) => frame.split('\n'))
    .filter((lines) => lines.includes(`event: ${event}`))
    .map((lines) => ({
      id: lines.find((l) => l.startsWith('id: '))?.slice('id: '.length),
      data: JSON.parse(lines.find((l) => l.startsWith('data: ')).slice('data: '.length)),
    }));
}

const signalsIn = (tab) => framesIn(tab, 'signal').map((f) => f.data);
const notificationsIn = (tab) => framesIn(tab, 'notification');

// Publish like the outbox relay: full envelope, routing key from topology.
let pubConn;
let pubCh;

async function publishRequestCreated(data) {
  const envelope = {
    eventId: randomUUID(),
    type: 'RequestCreated',
    version: 1,
    occurredAt: new Date().toISOString(),
    data,
  };
  pubCh.publish(exchange.name, events.RequestCreated.routingKey, Buffer.from(JSON.stringify(envelope)), {
    contentType: 'application/json',
    messageId: envelope.eventId,
    persistent: true,
  });
  await pubCh.waitForConfirms();
}

before(async () => {
  if (skip) return;
  pubConn = await amqp.connect(URL_AMQP);
  pubCh = await pubConn.createConfirmChannel();
  /*
   * The service uses the real, durable notification.events: empty it so leftovers
   * from earlier runs or demos can't reach this run. Declare first: purging a
   * missing queue closes the channel.
   */
  await declareConsumerQueue(pubCh, queues.notification);
  await pubCh.purgeQueue(queues.notification.name);
});

after(async () => {
  if (pubConn) await pubConn.close().catch(() => {});
});

test('a RequestCreated reaches the resident and matched volunteers as signals, notifications and pushes', { skip }, async () => {
  const service = await startService();
  const pushService = await startPushService();
  // Fresh uids per run, so nothing from an earlier run can count.
  const resident = `it-resident-${randomUUID()}`;
  const volunteer = `it-volunteer-${randomUUID()}`;
  const offline = `it-offline-${randomUUID()}`;
  const bystander = `it-bystander-${randomUUID()}`;
  const tabs = [];
  try {
    const residentTab = await openTab(service.url, resident);
    const volunteerTab = await openTab(service.url, volunteer);
    const bystanderTab = await openTab(service.url, bystander); // connected, but not a recipient
    tabs.push(residentTab, volunteerTab, bystanderTab);
    // Everyone has push on, so the test shows who it goes to.
    for (const uid of [resident, volunteer, offline]) await subscribe(service, pushService, uid);

    const requestId = randomUUID();
    await publishRequestCreated({
      requestId,
      residentUid: resident,
      categoryName: 'Computers/Laptops',
      quantity: 2,
      postalCode: 'T2P1J9',
      matchedVolunteerUids: [volunteer, offline],
    });

    // The notification is written after the signal, so waiting for it means both arrived.
    await waitFor(
      () => notificationsIn(residentTab).length > 0 && notificationsIn(volunteerTab).length > 0,
      'both recipients to get their frames',
    );

    // The Oct 28 signal, unchanged.
    assert.deepEqual(signalsIn(residentTab), [{ type: 'REQUEST_CREATED', requestId }]);
    assert.deepEqual(signalsIn(volunteerTab), [{ type: 'NEW_MATCHING_REQUEST', requestId }]);

    // The new notification, with its id line set to the notificationId.
    const [toVolunteer] = notificationsIn(volunteerTab);
    assert.equal(toVolunteer.id, toVolunteer.data.notificationId);
    assert.equal(toVolunteer.data.type, 'NEW_MATCHING_REQUEST');
    assert.equal(toVolunteer.data.title, 'New pickup near you');
    assert.equal(toVolunteer.data.body, '2 x Computers/Laptops in T2P1J9');
    assert.equal(toVolunteer.data.url, `/volunteer/requests/${requestId}`);
    assert.equal(notificationsIn(residentTab)[0].data.type, 'REQUEST_CREATED');

    // Push goes to every matched volunteer, tab or not; never to the resident.
    await waitFor(
      () => [volunteer, offline].every((uid) => pushService.paths.includes(`/push/${uid}`)),
      'the pushes at the push service',
    );
    assert.ok(!pushService.paths.includes(`/push/${resident}`));

    // The offline volunteer had no tab: logged as delivered to 0 tabs, no error.
    assert.ok(service.lines.some((l) => l.includes(`-> ${offline} (0 open tabs)`)));
    // A connected user who isn't a recipient gets nothing.
    assert.deepEqual(framesIn(bystanderTab, 'signal'), []);
    assert.deepEqual(notificationsIn(bystanderTab), []);
  } finally {
    tabs.forEach((t) => t.close());
    pushService.close();
    await stopService(service);
  }
});