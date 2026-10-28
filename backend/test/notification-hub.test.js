'use strict';

// Unit tests for the connection hub (uid -> open SSE responses).
// No HTTP: a fake response records what is written to it.
// Run with:  npm test   (from backend/)

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createHub, frame } = require('../src/notification/hub');

// --- fakes ------------------------------------------------------------------

// Stands in for an Express response held open as an SSE stream: just the
// parts the hub uses (write, end, writableEnded), plus a record of writes.
function fakeRes() {
  return {
    written: [],
    writableEnded: false,
    write(text) { this.written.push(text); return true; },
    end() { this.writableEnded = true; },
  };
}

const signal = { type: 'NEW_MATCHING_REQUEST', requestId: '0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11' };

// --- tests ------------------------------------------------------------------

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

test('send to a user with no open stream is a no-op that returns 0', () => {
  const hub = createHub();
  // Offline on this instance is normal: they catch up over REST next load.
  assert.equal(hub.send('firebaseUid_nobody', signal), 0);
  assert.deepEqual(hub.stats(), { users: 0, connections: 0 }, 'sending must not create an entry');
});

test('send skips a stream that already ended instead of throwing', () => {
  const hub = createHub();
  const closing = fakeRes();
  const open = fakeRes();
  hub.add('firebaseUid_v1', closing);
  hub.add('firebaseUid_v1', open);

  // A tab closes just as a signal arrives: ended, but its 'close' handler
  // hasn't removed it from the hub yet.
  closing.end();

  assert.equal(hub.send('firebaseUid_v1', signal), 1);
  assert.deepEqual(closing.written, []);
  assert.deepEqual(open.written, [frame(signal)]);
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

test('remove for an unknown user or stream does nothing', () => {
  const hub = createHub();
  const tab = fakeRes();
  hub.add('firebaseUid_v1', tab);

  // 'close' can fire for a stream the hub never had (e.g. a request rejected
  // before add), so remove must be safe to call anyway.
  hub.remove('firebaseUid_nobody', fakeRes());
  hub.remove('firebaseUid_v1', fakeRes());

  assert.deepEqual(hub.stats(), { users: 1, connections: 1 });
});

test('closeAll ends every open stream and empties the hub', () => {
  const hub = createHub();
  const a = fakeRes();
  const b = fakeRes();
  const c = fakeRes();
  hub.add('firebaseUid_v1', a);
  hub.add('firebaseUid_v1', b);
  hub.add('firebaseUid_abc', c);

  hub.closeAll();

  assert.ok(a.writableEnded && b.writableEnded && c.writableEnded);
  assert.deepEqual(hub.stats(), { users: 0, connections: 0 });
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
