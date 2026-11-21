'use strict';

/*
 * The notification service's event handlers: an envelope goes in, one delivery per
 * recipient comes out ({ uid, signal, notification, push }). Pure functions, no broker, no HTTP.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { requestCreated, SIGNAL } = require('../src/notification/handlers');
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

test('RequestCreated: a volunteer notification has the contract fields and text', () => {
  const volunteer = requestCreated(envelope())[1];

  assert.deepEqual(volunteer.notification, {
    notificationId: notificationUuid(EVENT_ID, 'firebaseUid_v1'),
    type: 'NEW_MATCHING_REQUEST',
    requestId: REQUEST_ID,
    awardId: null,
    title: 'New pickup near you',
    body: '2 x Computers/Laptops in T2P1J9',
    url: `/volunteer/requests/${REQUEST_ID}`,
    createdAt: '2026-10-28T16:15:00Z',
  });
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

test('a notification id is a UUID that the same event and recipient always repeat', () => {
  const id = notificationUuid(EVENT_ID, 'firebaseUid_v1');
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(notificationUuid(EVENT_ID, 'firebaseUid_v1'), id);
  assert.notEqual(notificationUuid(EVENT_ID, 'firebaseUid_v2'), id);
});
