'use strict';

/*
 * The notification service's event handlers: an envelope goes in, one delivery per
 * recipient comes out ({ uid, signal, notification, push }). Pure functions, no broker, no HTTP.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  requestCreated, requestUpdated, assignmentCollected, assignmentDelivered,
  assignmentCancelledByResident, assignmentCancelledByVolunteer, assignmentMissed, awardsEarned, replacements, SIGNAL,
} = require('../src/notification/handlers');
const { notificationUuid } = require('../src/notification/ids');

const EVENT_ID = '6f1c9c2e-3b0e-4f0f-9d57-2c2f6a1d8e11';
const REQUEST_ID = '0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11';

// A RequestCreated v1 envelope like the contract's example; `data` overrides fields.
function envelope(data = {}) {
  return {
    eventId: EVENT_ID,
    type: 'RequestCreated',
    version: 1,
    occurredAt: '2026-10-28T16:15:00Z',
    data: {
      requestId: REQUEST_ID,
      residentUid: 'firebaseUid_abc',
      categoryName: 'Computers/Laptops',
      quantity: 2,
      postalCode: 'T2P1J9',
      streetAddress: '123 Secret St', // must never appear in a signal or notification
      matchedVolunteerUids: ['firebaseUid_v1', 'firebaseUid_v2'],
      ...data,
    },
  };
}

// Just the recipient, signal and push flag of each delivery.
const brief = (out) => out.map(({ uid, signal, push }) => ({ uid, signal, push }));

test('RequestCreated: the resident gets REQUEST_CREATED, each volunteer NEW_MATCHING_REQUEST with a push', () => {
  assert.deepEqual(brief(requestCreated(envelope())), [
    { uid: 'firebaseUid_abc', signal: { type: SIGNAL.REQUEST_CREATED, requestId: REQUEST_ID }, push: false },
    { uid: 'firebaseUid_v1', signal: { type: SIGNAL.NEW_MATCHING_REQUEST, requestId: REQUEST_ID }, push: true },
    { uid: 'firebaseUid_v2', signal: { type: SIGNAL.NEW_MATCHING_REQUEST, requestId: REQUEST_ID }, push: true },
  ]);
});

test('RequestCreated: private fields never reach a signal or a notification', () => {
  // An event loaded with fields that must never reach a browser.
  const out = requestCreated(envelope({
    streetAddress: '123 Secret St',
    unitNumber: '4B',
    residentName: 'Jane Doe',
  }));

  for (const { signal, notification } of out) {
    assert.deepEqual(Object.keys(signal).sort(), ['requestId', 'type']);
    const text = JSON.stringify(notification);
    for (const secret of ['123 Secret St', '4B', 'Jane Doe']) {
      assert.ok(!text.includes(secret), `notification leaked "${secret}"`);
    }
  }
});

test('RequestCreated: a volunteer listed twice gets one delivery', () => {
  const out = requestCreated(envelope({
    matchedVolunteerUids: ['firebaseUid_v1', 'firebaseUid_v2', 'firebaseUid_v1'],
  }));

  // Recipients of NEW_MATCHING_REQUEST, in order.
  const volunteers = out
    .filter(({ signal }) => signal.type === SIGNAL.NEW_MATCHING_REQUEST)
    .map(({ uid }) => uid);

  assert.deepEqual(volunteers, ['firebaseUid_v1', 'firebaseUid_v2']);
});

test('RequestCreated: no matched volunteers means only the resident gets a delivery', () => {
  const residentOnly = [
    { uid: 'firebaseUid_abc', signal: { type: SIGNAL.REQUEST_CREATED, requestId: REQUEST_ID }, push: false },
  ];

  // The contract allows an empty list: nobody nearby has signed up yet.
  assert.deepEqual(brief(requestCreated(envelope({ matchedVolunteerUids: [] }))), residentOnly);

  // A missing list is outside the contract; treated the same way instead of crashing (tolerant reader).
  assert.deepEqual(brief(requestCreated(envelope({ matchedVolunteerUids: undefined }))), residentOnly);
});

test('RequestCreated v2: the request sits in data.request, same deliveries as v1', () => {
  const v2 = {
    eventId: EVENT_ID,
    type: 'RequestCreated',
    version: 2,
    occurredAt: '2026-10-28T16:15:00Z',
    data: {
      request: {
        requestId: REQUEST_ID,
        requestSeq: 1,
        residentUid: 'firebaseUid_abc',
        categoryName: 'Computers/Laptops',
        quantity: 2,
        postalCode: 'T2P1J9',
      },
      matchedVolunteerUids: ['firebaseUid_v1', 'firebaseUid_v2'],
    },
  };

  assert.deepEqual(requestCreated(v2), requestCreated(envelope()));
});

test('RequestCreated: an event without a requestId or eventId throws, so the subscriber retries it', () => {
  for (const requestId of [undefined, '', 42]) {
    assert.throws(() => requestCreated(envelope({ requestId })), /without a requestId/);
  }

  // A missing data block or envelope fails the same way, not with a TypeError.
  assert.throws(() => requestCreated({ type: 'RequestCreated' }), /without a requestId/);
  assert.throws(() => requestCreated(undefined), /without a requestId/);

  assert.throws(() => requestCreated({ ...envelope(), eventId: undefined }), /without an eventId/);
});

test('a notification id is a UUID that the same event, recipient and type always repeat', () => {
  const id = notificationUuid(EVENT_ID, 'firebaseUid_v1', 'NEW_MATCHING_REQUEST');
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(notificationUuid(EVENT_ID, 'firebaseUid_v1', 'NEW_MATCHING_REQUEST'), id);
  assert.notEqual(notificationUuid(EVENT_ID, 'firebaseUid_v2', 'NEW_MATCHING_REQUEST'), id);
});

test('replacements: one silent text per account whose pushed notification went stale', () => {
  const request = { requestId: REQUEST_ID, quantity: 2, categoryName: 'Computers/Laptops', postalCode: 'T2P1J9' };
  const own = (uid, title, push) => ({ uid, push, notification: { notificationId: `new-${uid}`, title } });
  const deliveries = [own('resident', 'Pickup accepted', true), own('accepter', 'You accepted a pickup', false)];
  const stale = (accountId, notificationId, replace = true) => ({ accountId, notificationId, replace });

  assert.deepEqual(
    replacements(request, deliveries, [
      stale('resident', 'r1'), // gets a new push, which replaces by tag anyway
      stale('accepter', 'a1'),
      stale('other', 'o1'),
      stale('other', 'o2'),
      stale('unpushed', 'u1', false), // never pushed, or already read
    ]),
    [
      { uid: 'accepter', notification: deliveries[1].notification },
      {
        uid: 'other',
        notification: {
          notificationId: 'o2', requestId: REQUEST_ID, awardId: null,
          title: 'This pickup is no longer available', body: '2 * Computers/Laptops in T2P1J9',
          url: `/volunteer/requests/${REQUEST_ID}`,
        },
      },
    ],
  );
});

// An E6 or E7 envelope: the request snapshot and the assignment that just ended.
function assignmentEnvelope(type) {
  return {
    eventId: EVENT_ID,
    type,
    version: 1,
    occurredAt: '2026-11-20T10:00:00Z',
    data: {
      request: {
        requestId: REQUEST_ID, requestSeq: 3, transitionId: 'a1b2c3d4-0000-4000-8000-000000000001',
        residentUid: 'firebaseUid_abc', categoryName: 'Computers/Laptops', quantity: 2, postalCode: 'T2P1J9',
      },
      assignment: { assignmentId: 'as_1', volunteerUid: 'firebaseUid_v1', window: { windowId: 'w_1', date: '2026-11-22', startHour: 14 } },
      cancelledAt: '2026-11-20T10:00:00Z',
    },
  };
}

test('E6 and E7: the other side is pushed; the volunteer sees only the window and the history page', () => {
  const byResident = assignmentCancelledByResident(assignmentEnvelope('RequestAssignmentCancelledResident'));
  const byVolunteer = assignmentCancelledByVolunteer(assignmentEnvelope('RequestAssignmentCancelledVolunteer'));
  const summary = (out) => out.map(({ uid, push, notification: n }) => ({ uid, push, type: n.type, body: n.body, url: n.url }));

  const volunteerText = { body: 'Your pickup on Nov 22, 14:00–15:00 was cancelled', url: '/volunteer/history' };
  const residentText = { body: '2 * Computers/Laptops in T2P1J9', url: `/resident/requests/${REQUEST_ID}` };
  assert.deepEqual(summary(byResident), [
    { uid: 'firebaseUid_abc', push: false, type: 'ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT', ...residentText },
    { uid: 'firebaseUid_v1', push: true, type: 'ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER', ...volunteerText },
  ]);
  assert.deepEqual(summary(byVolunteer), [
    { uid: 'firebaseUid_abc', push: true, type: 'ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT', ...residentText },
    { uid: 'firebaseUid_v1', push: false, type: 'ASSIGNMENT_CANCELLED_BY_VOLUNTEER_VOLUNTEER', ...volunteerText },
  ]);

  const noVolunteer = assignmentEnvelope('RequestAssignmentCancelledResident');
  delete noVolunteer.data.assignment.volunteerUid;
  assert.throws(() => assignmentCancelledByResident(noVolunteer), /without a volunteerUid/);
});

test('E2: the resident gets a record titled by the reason; matched volunteers get fresh NEW_MATCHING_REQUESTs', () => {
  const updated = (reason) => {
    const env = assignmentEnvelope('RequestUpdated');
    delete env.data.assignment;
    return { ...env, data: { ...env.data, reason, matchedVolunteerUids: ['firebaseUid_v1', 'firebaseUid_v1', 'firebaseUid_v2'] } };
  };
  const summary = (out) => out.map(({ uid, push, notification: n }) => ({ uid, push, type: n.type, title: n.title }));

  assert.deepEqual(summary(requestUpdated(updated('edited'))), [
    { uid: 'firebaseUid_abc', push: false, type: 'REQUEST_UPDATED_RESIDENT', title: 'Request updated' },
    { uid: 'firebaseUid_v1', push: true, type: 'NEW_MATCHING_REQUEST', title: 'New pickup near you' },
    { uid: 'firebaseUid_v2', push: true, type: 'NEW_MATCHING_REQUEST', title: 'New pickup near you' },
  ]);
  assert.equal(requestUpdated(updated('reopened'))[0].notification.title, 'Request reopened');
  assert.throws(() => requestUpdated(updated('moved')), /unknown reason/);
});

test('E4, E5 and E8: one notification per side, pushed to the side that did not act', () => {
  const summary = (out) => out.map(({ uid, push, notification: n }) => ({ uid, push, type: n.type, url: n.url }));
  const resident = (type, push) => ({ uid: 'firebaseUid_abc', push, type, url: `/resident/requests/${REQUEST_ID}` });
  const volunteer = (type, push, url = `/volunteer/requests/${REQUEST_ID}`) => ({ uid: 'firebaseUid_v1', push, type, url });

  assert.deepEqual(summary(assignmentCollected(assignmentEnvelope('RequestAssignmentCollected'))), [
    resident('REQUEST_COLLECTED_RESIDENT', false), volunteer('REQUEST_COLLECTED_VOLUNTEER', true),
  ]);
  assert.deepEqual(summary(assignmentDelivered(assignmentEnvelope('RequestAssignmentDelivered'))), [
    resident('REQUEST_DELIVERED_RESIDENT', true), volunteer('REQUEST_DELIVERED_VOLUNTEER', false),
  ]);
  const missed = assignmentMissed(assignmentEnvelope('RequestAssignmentMissed'));
  assert.deepEqual(summary(missed), [
    resident('ASSIGNMENT_MISSED_RESIDENT', false), volunteer('ASSIGNMENT_MISSED_VOLUNTEER', true, '/volunteer/history'),
  ]);
  assert.equal(missed[1].notification.body, 'Your pickup on Nov 22, 14:00–15:00 was marked as missed');
});

test('E11 and E12: one pushed notification per award, opening the EcoPoints page', () => {
  const awardEnvelope = (type, awards) => ({
    eventId: EVENT_ID, type, version: 1, occurredAt: '2026-11-20T10:00:00Z',
    data: { requestId: REQUEST_ID, assignmentId: 'as_1', categoryName: 'Computers/Laptops', quantity: 2, estimatedWeightKg: 5, awards },
  });
  const summary = (out) => out.map(({ uid, awardId, push, notification: n }) => ({ uid, awardId, push, type: n.type, title: n.title, body: n.body, url: n.url }));

  const delivery = awardsEarned('delivery')(awardEnvelope('PointsAwardedDelivery', [
    { awardId: 'aw_1', accountId: 'firebaseUid_v1', earnedAs: 'volunteer', points: 26, formula: 'f' },
    { awardId: 'aw_2', accountId: 'firebaseUid_abc', earnedAs: 'resident', points: '13.50', formula: 'f' },
  ]));
  assert.deepEqual(summary(delivery), [
    { uid: 'firebaseUid_v1', awardId: 'aw_1', push: true, type: 'ECOPOINTS_AWARDED_ON_DELIVERY_VOLUNTEER',
      title: 'You earned 26 EcoPoints', body: 'For 2 * Computers/Laptops delivered', url: '/ecopoints' },
    { uid: 'firebaseUid_abc', awardId: 'aw_2', push: true, type: 'ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT',
      title: 'You earned 13.5 EcoPoints', body: 'For 2 * Computers/Laptops delivered', url: '/ecopoints' },
  ]);

  const cancellation = awardsEarned('cancellation')(awardEnvelope('PointsAwardedCancellation', [
    { awardId: 'aw_3', accountId: 'firebaseUid_v1', earnedAs: 'volunteer', points: 8, formula: 'f' },
  ]));
  assert.deepEqual(summary(cancellation), [
    { uid: 'firebaseUid_v1', awardId: 'aw_3', push: true, type: 'ECOPOINTS_AWARDED_ON_ASSIGNMENT_CANCELLATION_VOLUNTEER',
      title: 'You earned 8 EcoPoints', body: 'For a pickup cancelled late', url: '/ecopoints' },
  ]);

  // A cancellation award is only ever the volunteer's.
  assert.throws(() => awardsEarned('cancellation')(awardEnvelope('PointsAwardedCancellation', [
    { awardId: 'aw_4', accountId: 'firebaseUid_abc', earnedAs: 'resident', points: 4, formula: 'f' },
  ])), /earned as resident/);
});
