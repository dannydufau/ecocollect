'use strict';

// Unit tests for the notification service's event handlers.
// Pure functions: an envelope goes in, a list of { uid, signal } comes out.
// No broker, no HTTP.  Run with:  npm test   (from backend/)

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { requestCreated, SIGNAL } = require('../src/notification/handlers');

// --- fixtures ---------------------------------------------------------------

// A RequestCreated envelope shaped like the example in contracts/asyncapi.yaml.
// Pass `data` to override fields for a particular test.
function envelope(data = {}) {
  return {
    eventId: '6f1c9c2e-3b0e-4f0f-9d57-2c2f6a1d8e11',
    type: 'RequestCreated',
    version: 1,
    occurredAt: '2026-10-28T16:15:00Z',
    data: {
      requestId: '0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11',
      residentUid: 'firebaseUid_abc',
      matchedVolunteerUids: ['firebaseUid_v1', 'firebaseUid_v2'],
      ...data,
    },
  };
}

// --- tests ------------------------------------------------------------------

test('RequestCreated: the resident gets REQUEST_CREATED, each volunteer NEW_MATCHING_REQUEST', () => {
  const out = requestCreated(envelope());
  const requestId = '0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11';

  assert.deepEqual(out, [
    { uid: 'firebaseUid_abc', signal: { type: SIGNAL.REQUEST_CREATED, requestId } },
    { uid: 'firebaseUid_v1', signal: { type: SIGNAL.NEW_MATCHING_REQUEST, requestId } },
    { uid: 'firebaseUid_v2', signal: { type: SIGNAL.NEW_MATCHING_REQUEST, requestId } },
  ]);
});

test('RequestCreated: nothing but type and requestId reaches a signal, even if the event carries more', () => {
  // An event loaded with fields that must never reach a browser.
  const out = requestCreated(envelope({
    postalCode: 'T2P1J9',
    streetAddress: '123 Secret St',
    unitNumber: '4B',
    residentName: 'Jane Doe',
  }));

  assert.ok(out.length > 0);
  for (const { signal } of out) {
    // Exactly these two keys, so an address can't hide under any name.
    assert.deepEqual(Object.keys(signal).sort(), ['requestId', 'type']);
  }
});

test('RequestCreated: a volunteer listed twice gets one signal', () => {
  const out = requestCreated(envelope({
    matchedVolunteerUids: ['firebaseUid_v1', 'firebaseUid_v2', 'firebaseUid_v1'],
  }));

  // Recipients of NEW_MATCHING_REQUEST, in order.
  const volunteers = out
    .filter(({ signal }) => signal.type === SIGNAL.NEW_MATCHING_REQUEST)
    .map(({ uid }) => uid);

  assert.deepEqual(volunteers, ['firebaseUid_v1', 'firebaseUid_v2']);
});

test('RequestCreated: no matched volunteers means only the resident is signalled', () => {
  const requestId = '0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11';

  // The contract allows an empty list: nobody nearby has signed up yet.
  assert.deepEqual(requestCreated(envelope({ matchedVolunteerUids: [] })), [
    { uid: 'firebaseUid_abc', signal: { type: SIGNAL.REQUEST_CREATED, requestId } },
  ]);

  // A missing list is outside the contract, but the handler treats it the
  // same way instead of crashing (tolerant reader).
  assert.deepEqual(requestCreated(envelope({ matchedVolunteerUids: undefined })), [
    { uid: 'firebaseUid_abc', signal: { type: SIGNAL.REQUEST_CREATED, requestId } },
  ]);
});

test('RequestCreated: an event without a requestId throws, so the subscriber nacks it', () => {
  // Without a requestId the browser wouldn't know what to refetch, so there
  // is nothing useful to send. Throwing makes the subscriber log and nack.
  for (const requestId of [undefined, '', 42]) {
    assert.throws(
      () => requestCreated(envelope({ requestId })),
      /RequestCreated without a requestId/,
    );
  }

  // A missing data block or envelope fails the same way, not with a TypeError.
  assert.throws(() => requestCreated({ type: 'RequestCreated' }), /without a requestId/);
  assert.throws(() => requestCreated(undefined), /without a requestId/);
});