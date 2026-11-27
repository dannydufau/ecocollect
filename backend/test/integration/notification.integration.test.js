'use strict';

/*
 * The whole notification service: the real index.js as its own process against
 * a real RabbitMQ. Open tabs, publish RequestCreated, see signals, notifications and pushes.
 * Run with `npm run test:integration` (from backend/); skipped without RABBITMQ_URL or DATABASE_URL.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { randomUUID, createECDH, randomBytes } = require('node:crypto');
const amqp = require('amqplib');
const { Pool } = require('pg');
const webpush = require('web-push');

const { exchange, events, queues } = require('../../src/messaging/topology');
const { declareConsumerQueue } = require('../../src/messaging/declare');
const { createNotificationStore } = require('../../src/notification/notification-store');

const URL_AMQP = process.env.RABBITMQ_URL;
const URL_DB = process.env.DATABASE_URL;
const skip = URL_AMQP && URL_DB ? false : 'RABBITMQ_URL or DATABASE_URL not set';
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
      DATABASE_URL: URL_DB,
      PORT: String(port),
      VAPID_PUBLIC_KEY: VAPID.publicKey,
      VAPID_PRIVATE_KEY: VAPID.privateKey,
      VAPID_SUBJECT: 'mailto:test@example.com',
      PUSH_TEST_HOST: '127.0.0.1', // lets the fake push service through the endpoint check
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
  return {
    child, lines, exited,
    url: `${base}/api/events`,
    publicEventsUrl: `${base}/api/public/events`,
    subscriptionsUrl: `${base}/api/push/subscriptions`,
    notificationsUrl: `${base}/api/notifications`,
  };
}

async function stopService(service) {
  if (service.child.exitCode === null) service.child.kill('SIGTERM');
  return service.exited;
}

// A browser tab: opens the stream as a signed-in user (as Caddy would, via X-User-Id).
async function openTab(url, uid, roles = '') {
  const abort = new AbortController();
  const res = await fetch(url, { headers: uid ? { 'X-User-Id': uid, 'X-User-Roles': roles } : {}, signal: abort.signal });
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

// Test accounts: push_subscription points at users.account, so subscribers need a row there.
async function addAccounts(db, uids) {
  for (const uid of uids) {
    await db.query(
      `INSERT INTO users.account (account_id, first_name, last_name, public_name, date_of_birth, created_at)
       VALUES ($1, 'Test', 'User', 'Test User', '1990-01-01', now())`,
      [uid],
    );
  }
}

/*
 * The request an event is about (request_event points at it), as the Request Service would
 * have stored it. 'laptops' (Computers/Laptops) comes from db/init/011_request_seed.sql.
 */
async function addRequest(db, requestId, residentUid, quantity) {
  const documentId = randomUUID();
  const acceptanceId = randomUUID();
  await db.query(
    `INSERT INTO users.terms_document (terms_document_id, content, published_at) VALUES ($1, 'Test terms', now())`,
    [documentId],
  );
  await db.query(
    `INSERT INTO users.terms_acceptance (terms_acceptance_id, terms_document_id, account_id, accepted_at, type)
     VALUES ($1, $2, $3, now(), 'AT_RESIDENT_REQUEST_CREATION')`,
    [acceptanceId, documentId, residentUid],
  );
  await db.query(
    `INSERT INTO requests.pickup_request (pickup_request_id, category_id, terms_acceptance_id, quantity,
       estimated_weight_kg, created_at, request_seq, pickup_street, pickup_postal_code)
     VALUES ($1, 'laptops', $2, $3, 2.5 * $3::int, now(), 1, '1 Test Street', 'T2P1J9')`,
    [requestId, acceptanceId, quantity],
  );
}

// Removes the requests addRequest() made for these accounts, with their terms rows.
async function removeRequests(db, uids) {
  await db.query(
    `DELETE FROM requests.pickup_request r USING users.terms_acceptance t
     WHERE t.terms_acceptance_id = r.terms_acceptance_id AND t.account_id = ANY($1)`,
    [uids],
  );
  const { rows } = await db.query(
    'DELETE FROM users.terms_acceptance WHERE account_id = ANY($1) RETURNING terms_document_id',
    [uids],
  );
  await db.query('DELETE FROM users.terms_document WHERE terms_document_id = ANY($1)', [rows.map((r) => r.terms_document_id)]);
}

// Removes what the test wrote: notifications and subscriptions first, then what they point at.
async function removeAccounts(db, uids) {
  const { rows } = await db.query(
    'DELETE FROM notifications.request_notification WHERE account_id = ANY($1) RETURNING notification_id, pickup_request_id',
    [uids],
  );
  await db.query('DELETE FROM notifications.notification WHERE notification_id = ANY($1)', [rows.map((r) => r.notification_id)]);
  await db.query('DELETE FROM notifications.request_event WHERE pickup_request_id = ANY($1)', [rows.map((r) => r.pickup_request_id)]);
  await db.query('DELETE FROM notifications.push_subscription WHERE account_id = ANY($1)', [uids]);
  await removeRequests(db, uids);
  await db.query('DELETE FROM users.account WHERE account_id = ANY($1)', [uids]);
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
  await publish(envelope);
  return envelope;
}

// Publishes an envelope as is; publishing the same one twice is a redelivery.
async function publish(envelope) {
  pubCh.publish(exchange.name, events[envelope.type].routingKey, Buffer.from(JSON.stringify(envelope)), {
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
  const deactivated = `it-inactive-${randomUUID()}`;
  const subscribers = [resident, volunteer, offline, deactivated];
  const db = new Pool({ connectionString: URL_DB });
  const tabs = [];
  try {
    await addAccounts(db, subscribers);
    await db.query('UPDATE users.account SET deactivated_at = now() WHERE account_id = $1', [deactivated]);
    const residentTab = await openTab(service.url, resident);
    const volunteerTab = await openTab(service.url, volunteer, 'volunteer');
    const bystanderTab = await openTab(service.url, bystander); // connected, but not a recipient
    tabs.push(residentTab, volunteerTab, bystanderTab);
    // Everyone has push on, so the test shows who it goes to.
    for (const uid of subscribers) await subscribe(service, pushService, uid);

    const requestId = randomUUID();
    await addRequest(db, requestId, resident, 2);
    const first = await publishRequestCreated({
      requestId,
      residentUid: resident,
      categoryName: 'Computers/Laptops',
      quantity: 2,
      postalCode: 'T2P1J9',
      matchedVolunteerUids: [volunteer, offline, deactivated],
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
    assert.equal(toVolunteer.data.body, '2 * Computers/Laptops in T2P1J9');
    assert.equal(toVolunteer.data.url, `/volunteer/requests/${requestId}`);
    assert.equal(notificationsIn(residentTab)[0].data.type, 'REQUEST_CREATED');

    // Push goes to every matched volunteer, tab or not; never to the resident.
    await waitFor(
      () => [volunteer, offline].every((uid) => pushService.paths.includes(`/push/${uid}`)),
      'the pushes at the push service',
    );
    assert.ok(!pushService.paths.includes(`/push/${resident}`));
    assert.ok(!pushService.paths.includes(`/push/${deactivated}`));

    // The offline volunteer had no tab: logged as delivered to 0 tabs, no error.
    assert.ok(service.lines.some((l) => l.includes(`-> ${offline} (0 open tabs)`)));
    // A connected user who isn't a recipient gets nothing.
    assert.deepEqual(framesIn(bystanderTab, 'signal'), []);
    assert.deepEqual(notificationsIn(bystanderTab), []);

    // Each recipient's notification is stored once, with its account and request; none for the deactivated account.
    const stored = await db.query(
      'SELECT account_id FROM notifications.request_notification WHERE pickup_request_id = $1 ORDER BY account_id',
      [requestId],
    );
    assert.deepEqual(stored.rows.map((r) => r.account_id), [offline, resident, volunteer].sort());

    // Done-when: the volunteer's list shows it (N3), and it can be marked read (N4).
    const asVolunteer = { headers: { 'X-User-Id': volunteer } };
    const list = await (await fetch(service.notificationsUrl, asVolunteer)).json();
    assert.equal(list.unreadCount, 1);
    assert.equal(list.notifications[0].notificationId, toVolunteer.id);
    assert.equal(list.notifications[0].url, `/volunteer/requests/${requestId}`);
    assert.equal(list.notifications[0].body, toVolunteer.data.body); // the same text after a refresh
    const read = await fetch(`${service.notificationsUrl}/${toVolunteer.id}/read`, { ...asVolunteer, method: 'PATCH' });
    assert.equal(read.status, 204);
    assert.equal((await (await fetch(service.notificationsUrl, asVolunteer)).json()).unreadCount, 0);
    await waitFor(() => framesIn(volunteerTab, 'notification-read').length === 1, 'notification-read at the volunteer');

    // The same event again saves and sends nothing. A second, new request after it shows
    // the redelivery was handled (the queue delivers one at a time, in order).
    await publish(first);
    const secondId = randomUUID();
    await addRequest(db, secondId, resident, 1);
    await publishRequestCreated({
      requestId: secondId,
      residentUid: resident,
      categoryName: 'Computers/Laptops',
      quantity: 1,
      postalCode: 'T2P1J9',
      matchedVolunteerUids: [volunteer],
    });
    await waitFor(() => notificationsIn(volunteerTab).length === 2, 'the second request at the volunteer');
    assert.deepEqual(notificationsIn(volunteerTab).map((f) => f.data.requestId), [requestId, secondId]);
    const again = await db.query(
      'SELECT count(*)::int AS n FROM notifications.request_notification WHERE pickup_request_id = $1',
      [requestId],
    );
    assert.equal(again.rows[0].n, 3);

    // A sent push is recorded, which is what lets it be replaced later.
    await waitFor(async () => {
      const { rows } = await db.query(
        'SELECT 1 FROM notifications.notification WHERE notification_id = $1 AND pushed_at IS NOT NULL',
        [toVolunteer.id],
      );
      return rows.length === 1;
    }, 'pushed_at on the volunteer notification');
    const pushesTo = (uid) => pushService.paths.filter((p) => p === `/push/${uid}`).length;
    const offlinePushes = pushesTo(offline);

    // The volunteer accepts the first request (step 2). The resident is told (with a push), and
    // every volunteer's "New pickup near you" for it expires (X2), on their tabs and in their list.
    const matchingIds = notificationsIn(volunteerTab).filter((f) => f.data.requestId === requestId).map((f) => f.id);
    await publish({
      eventId: randomUUID(),
      type: 'RequestAssigned',
      version: 1,
      occurredAt: new Date().toISOString(),
      data: {
        request: {
          requestId, requestSeq: 2, transitionId: randomUUID(), status: 'Assigned', residentUid: resident,
          categoryName: 'Computers/Laptops', quantity: 2, postalCode: 'T2P1J9',
        },
        assignment: { volunteerUid: volunteer },
      },
    });
    await waitFor(
      () => notificationsIn(residentTab).some((f) => f.data.type === 'REQUEST_ASSIGNED_RESIDENT'),
      'the accepted notification at the resident',
    );
    await waitFor(() => pushesTo(resident) === 1, 'the push to the resident');
    // The other volunteer's "New pickup near you" is still on their phone, so it is replaced.
    await waitFor(() => pushesTo(offline) === offlinePushes + 1, 'the replacement push to the offline volunteer');
    await waitFor(() => framesIn(volunteerTab, 'notification-expired').length === 1, 'notification-expired at the volunteer');
    assert.deepEqual(framesIn(volunteerTab, 'notification-expired')[0].data.notificationIds, matchingIds);
    const after = await (await fetch(service.notificationsUrl, asVolunteer)).json();
    assert.ok(!after.notifications.some((n) => n.type === 'NEW_MATCHING_REQUEST' && n.requestId === requestId));
    assert.ok(after.notifications.some((n) => n.type === 'REQUEST_ASSIGNED_VOLUNTEER' && n.requestId === requestId));

    // X2 still expires the second request's matching notice if cancellation saves nothing.
    await db.query('UPDATE users.account SET deactivated_at = now() WHERE account_id = $1', [resident]);
    const request = {
      requestId: secondId, requestSeq: 3, transitionId: randomUUID(), status: 'Cancelled',
      residentUid: resident, categoryName: 'Computers/Laptops', quantity: 1, postalCode: 'T2P1J9',
    };
    await publish({
      eventId: randomUUID(), type: 'RequestCancelled', version: 1,
      occurredAt: new Date().toISOString(), data: { request },
    });
    await waitFor(() => framesIn(volunteerTab, 'notification-expired').length === 2, 'expiry without a new recipient');
    const availableUpdates = () => framesIn(volunteerTab, 'available-requests-changed')
      .filter(({ data }) => data.requestId === secondId);
    assert.equal(availableUpdates().length, 2);

    // E3 arrives late after E9. It still invalidates the list without sending the assigned notice.
    await publish({
      eventId: randomUUID(), type: 'RequestAssigned', version: 1,
      occurredAt: new Date().toISOString(),
      data: {
        request: { ...request, requestSeq: 2, transitionId: randomUUID(), status: 'Assigned' },
        assignment: { volunteerUid: volunteer },
      },
    });
    await waitFor(() => availableUpdates().length === 3, 'the late assignment to invalidate the available list');
    const refreshed = await (await fetch(service.notificationsUrl, asVolunteer)).json();
    assert.ok(!refreshed.notifications.some((n) => n.requestId === secondId));
  } finally {
    tabs.forEach((t) => t.close());
    pushService.close();
    await stopService(service);
    await removeAccounts(db, subscribers);
    await db.end();
  }
});

// The store alone on the real database, for one account and one request of its own.
async function withStore(run) {
  const db = new Pool({ connectionString: URL_DB });
  const uid = `it-store-${randomUUID()}`;
  const requestId = randomUUID();
  const store = createNotificationStore(db);
  // One request event for this account, with one notification per type, all at the same time.
  const save = (requestSeq, transitionId, ...types) => {
    const createdAt = new Date().toISOString();
    return store.saveRequestNotifications(
      randomUUID(),
      types.map((type) => ({ notificationId: randomUUID(), type, createdAt, accountId: uid })),
      { pickupRequestId: requestId, requestSeq, transitionId, expiresMatching: true },
    );
  };
  try {
    await addAccounts(db, [uid]);
    await addRequest(db, requestId, uid, 1);
    await run({ db, store, uid, save });
  } finally {
    await removeAccounts(db, [uid]);
    await db.end();
  }
}

test('the next page includes a notification saved at the same time as the last one shown', { skip }, () =>
  withStore(async ({ store, uid, save }) => {
    // Self-accept: one account gets both sides of the same event.
    const { saved } = await save(2, randomUUID(), 'REQUEST_ASSIGNED_RESIDENT', 'REQUEST_ASSIGNED_VOLUNTEER');
    const [first] = (await store.listForAccount(uid, { limit: 1 })).rows;
    const { rows } = await store.listForAccount(uid, { before: first.created_at.toISOString(), limit: 30 });
    assert.deepEqual(new Set(rows.map((r) => r.notification_id)), saved);
  }));

test('a later step expires older notifications from other actions, not from the same one', { skip }, () =>
  withStore(async ({ save }) => {
    const action = randomUUID();
    const first = await save(2, action, 'ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT');
    const sameAction = await save(3, action, 'REQUEST_UPDATED_RESIDENT'); // e.g. the reopen that follows
    assert.deepEqual(sameAction.expired, []);
    const nextAction = await save(4, randomUUID(), 'REQUEST_CANCELLED_RESIDENT');
    assert.deepEqual(
      new Set(nextAction.expired.map((e) => e.notificationId)),
      new Set([...first.saved, ...sameAction.saved]),
    );
  }));

test('award, cleanup and deactivation events commit once and refresh the right streams', { skip }, async (t) => {
  const db = new Pool({ connectionString: URL_DB });
  const uid = `it-award-${randomUUID()}`;
  const requestId = randomUUID();
  const assignmentId = randomUUID();
  const windowId = randomUUID();
  const acceptanceId = randomUUID();
  const awardId = randomUUID();
  const ids = [];
  const envelope = (type, data) => {
    const eventId = randomUUID();
    ids.push(eventId);
    return { eventId, type, data, version: 1, occurredAt: new Date().toISOString() };
  };
  let service = await startService();
  t.after(async () => {
    await stopService(service);
    try {
      await db.query('CALL notifications.delete_account_data($1, NULL, NULL)', [uid]);
      await db.query('DELETE FROM notifications.processed_events WHERE event_id = ANY($1)', [ids]);
      await db.query('DELETE FROM notifications.request_event WHERE pickup_request_id = $1', [requestId]);
      await db.query('DELETE FROM rewards.volunteer_award WHERE ecopoints_award_id = $1', [awardId]);
      await db.query('DELETE FROM rewards.ecopoints_award WHERE ecopoints_award_id = $1', [awardId]);
      await db.query('DELETE FROM requests.assignment WHERE assignment_id = $1', [assignmentId]);
      await db.query('DELETE FROM requests.pickup_window WHERE pickup_window_id = $1', [windowId]);
      await removeAccounts(db, [uid]);
    } finally {
      await db.end();
    }
  });
  const pushService = await startPushService();
  t.after(() => pushService.close());
  const personalList = async () => (await (await fetch(service.notificationsUrl, {
    headers: { 'X-User-Id': uid },
  })).json()).notifications;
  const processed = async (event) => (await db.query(
    'SELECT 1 FROM notifications.processed_events WHERE event_id = $1', [event.eventId],
  )).rowCount === 1;

  await addAccounts(db, [uid]);
  await addRequest(db, requestId, uid, 2);
  await db.query(
    `INSERT INTO users.terms_acceptance (terms_acceptance_id, terms_document_id, account_id, accepted_at, type)
     SELECT $1, terms_document_id, account_id, now(), 'AT_VOLUNTEER_ACCEPTANCE'
     FROM users.terms_acceptance WHERE account_id = $2`, [acceptanceId, uid],
  );
  await db.query(
    `INSERT INTO requests.pickup_window VALUES ($1, $2, '2026-11-28', 6, false)`, [windowId, requestId],
  );
  await db.query(
    `INSERT INTO requests.assignment (assignment_id, pickup_window_id, terms_acceptance_id, accepted_at, ended_at, end_reason)
     VALUES ($1, $2, $3, now(), now(), 'Resident_Cancelled')`, [assignmentId, windowId, acceptanceId],
  );
  await db.query('INSERT INTO rewards.ecopoints_award VALUES ($1, $2, 26, $3)', [awardId, assignmentId, 'test formula']);
  await db.query('INSERT INTO rewards.volunteer_award VALUES ($1)', [awardId]);

  const tab = await openTab(service.url, uid);
  const stats = await openTab(`${service.publicEventsUrl}?stats`);
  t.after(tab.close);
  t.after(stats.close);
  await subscribe(service, pushService, uid);

  const award = envelope('PointsAwardedCancellation', {
    requestId, assignmentId, awards: [{ awardId, accountId: uid, earnedAs: 'volunteer', points: 26 }],
  });
  await publish(award);
  await waitFor(() => framesIn(stats, 'stats-updated').length === 1, 'stats refresh after award');
  const [savedAward] = await personalList();
  assert.equal(savedAward.awardId, awardId);
  assert.equal(savedAward.body, 'For a pickup on Nov 28, 06:00–07:00 cancelled late');

  await publish(envelope('RequestAssignmentCancelledResident', {
    request: {
      requestId, requestSeq: 2, transitionId: randomUUID(), status: 'Cancelled', residentUid: uid,
      categoryName: 'Computers/Laptops', quantity: 2, postalCode: 'T2P1J9',
    },
    assignment: { assignmentId, volunteerUid: uid, window: { date: '2026-11-28', startHour: 6 } },
  }));
  await waitFor(() => notificationsIn(tab).length === 3, 'both sides of the cancellation');
  const cancelled = (await personalList()).find((n) => n.type === 'ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER');
  assert.equal(cancelled.body, 'Your pickup on Nov 28, 06:00–07:00 was cancelled');
  const residentNotice = (await personalList()).find((n) => n.type === 'ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT');

  const cleanup = envelope('NotificationCleanupRequested', {});
  const expire = (id) => db.query('UPDATE notifications.notification SET is_expired = true WHERE notification_id = $1', [id]);
  const exists = async (id) => (await db.query(
    'SELECT 1 FROM notifications.notification WHERE notification_id = $1', [id],
  )).rowCount === 1;
  await expire(cancelled.notificationId);
  await publish(cleanup);
  await waitFor(() => processed(cleanup), 'cleanup commit');
  assert.equal(await exists(cancelled.notificationId), false);

  // The replay must skip even after a restart, while an unrelated notification is now expired.
  tab.close();
  stats.close();
  await stopService(service);
  service = await startService();
  await expire(residentNotice.notificationId);
  const reconnected = await openTab(service.url, uid);
  const reconnectedStats = await openTab(`${service.publicEventsUrl}?stats`);
  t.after(reconnected.close);
  t.after(reconnectedStats.close);
  await publish(cleanup);
  await publish(award);
  const profile = envelope('ProfileUpdated', { accountId: uid, changed: ['publicName'] });
  await publish(profile);
  await publish(profile);
  const barrier = envelope('ProfileUpdated', { accountId: uid, changed: ['roles'] });
  await publish(barrier);
  await waitFor(() => framesIn(reconnected, 'profile-updated').some(({ data }) => data.changed.includes('roles')), 'profile barrier');
  assert.deepEqual(framesIn(reconnected, 'profile-updated').map(({ data }) => data.changed), [['publicName'], ['roles']]);
  assert.equal(await exists(residentNotice.notificationId), true);
  assert.deepEqual(framesIn(reconnectedStats, 'stats-updated'), []);

  await db.query('UPDATE users.account SET deactivated_at = now() WHERE account_id = $1', [uid]);
  const deactivate = envelope('AccountDeactivated', { accountId: uid });
  await publish(deactivate);
  await waitFor(() => framesIn(reconnected, 'account-deactivated').length === 1, 'account deactivation');
  assert.deepEqual(await personalList(), []);
  assert.equal(await exists(savedAward.notificationId), false);
  assert.equal((await db.query('SELECT 1 FROM notifications.push_subscription WHERE account_id = $1', [uid])).rowCount, 0);

  const inactiveAward = envelope('PointsAwardedCancellation', award.data);
  await publish(inactiveAward);
  await waitFor(() => framesIn(reconnectedStats, 'stats-updated').length === 1, 'stats refresh for an inactive award recipient');
  assert.deepEqual(await personalList(), []);
});
