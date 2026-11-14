'use strict';

// The connection hub, with fake responses that record what is written to them.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createHub, frame } = require('../src/notification/hub');

function fakeRes() {
  return {
    written: [],
    writableEnded: false,
    write(text) { this.written.push(text); return true; },
    end() { this.writableEnded = true; },
  };
}

const signal = { type: 'NEW_MATCHING_REQUEST', requestId: '0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11' };

test('send reaches every open tab of that user, and nobody else', () => {
  const hub = createHub();
  const v1tab1 = fakeRes();
  const v1tab2 = fakeRes();
  const v2tab = fakeRes();
  hub.add('firebaseUid_v1', v1tab1);
  hub.add('firebaseUid_v1', v1tab2);
  hub.add('firebaseUid_v2', v2tab);

  const reached = hub.send('firebaseUid_v1', signal);

  assert.equal(reached, 2);
  assert.deepEqual(v1tab1.written, [frame(signal)]);
  assert.deepEqual(v1tab2.written, [frame(signal)]);
  assert.deepEqual(v2tab.written, [], 'another user must not get it');
});

test('remove forgets one tab; the user goes away with their last tab', () => {
  const hub = createHub();
  const tab1 = fakeRes();
  const tab2 = fakeRes();
  hub.add('firebaseUid_v1', tab1);
  hub.add('firebaseUid_v1', tab2);

  hub.remove('firebaseUid_v1', tab1);
  assert.deepEqual(hub.stats(), { users: 1, connections: 1 });
  assert.equal(hub.send('firebaseUid_v1', signal), 1, 'the other tab still gets signals');
  assert.deepEqual(tab1.written, []);

  hub.remove('firebaseUid_v1', tab2);
  assert.deepEqual(hub.stats(), { users: 0, connections: 0 }, 'no empty entries left behind');
});

test('frame is one SSE message: event line, one-line JSON data, blank line', () => {
  const text = frame(signal);
  assert.equal(
    text,
    'event: signal\ndata: {"type":"NEW_MATCHING_REQUEST","requestId":"0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11"}\n\n',
  );
  // A newline inside data would split the message in the browser.
  const dataLine = text.split('\n')[1];
  assert.ok(dataLine.startsWith('data: ') && !dataLine.slice(6).includes('\n'));
});
