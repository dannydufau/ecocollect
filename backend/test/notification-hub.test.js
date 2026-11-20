'use strict';

/*
 * The connection hub (uid -> open SSE responses). No HTTP: a fake response
 * records what is written to it.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createHub, frame } = require('../src/notification/hub');

// Just what the hub uses of an Express response, plus a record of writes.
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

  assert.equal(hub.send('firebaseUid_v1', 'signal', signal), 2);
  assert.deepEqual(v1tab1.written, [frame('signal', signal)]);
  assert.deepEqual(v1tab2.written, [frame('signal', signal)]);
  assert.deepEqual(v2tab.written, [], 'another user must not get it');
});

test('send to a user with no open tab returns 0 and adds nothing', () => {
  const hub = createHub();
  assert.equal(hub.send('firebaseUid_nobody', 'signal', signal), 0);
  assert.deepEqual(hub.stats(), { users: 0, connections: 0 });
});

test('send skips a tab that already ended instead of throwing', () => {
  const hub = createHub();
  const closing = fakeRes();
  const open = fakeRes();
  hub.add('firebaseUid_v1', closing);
  hub.add('firebaseUid_v1', open);

  // Ended, but its 'close' handler hasn't removed it yet.
  closing.end();

  assert.equal(hub.send('firebaseUid_v1', 'signal', signal), 1);
  assert.deepEqual(closing.written, []);
  assert.deepEqual(open.written, [frame('signal', signal)]);
});

test('remove forgets one tab; the user goes away with their last tab', () => {
  const hub = createHub();
  const tab1 = fakeRes();
  const tab2 = fakeRes();
  hub.add('firebaseUid_v1', tab1);
  hub.add('firebaseUid_v1', tab2);

  hub.remove('firebaseUid_v1', tab1);
  assert.deepEqual(hub.stats(), { users: 1, connections: 1 });
  assert.equal(hub.send('firebaseUid_v1', 'signal', signal), 1);
  assert.deepEqual(tab1.written, []);

  hub.remove('firebaseUid_v1', tab2);
  assert.deepEqual(hub.stats(), { users: 0, connections: 0 }, 'no empty entries left behind');
});

test('remove for an unknown user or tab does nothing', () => {
  const hub = createHub();
  hub.add('firebaseUid_v1', fakeRes());

  // 'close' can fire for a tab the hub never had (rejected before add).
  hub.remove('firebaseUid_nobody', fakeRes());
  hub.remove('firebaseUid_v1', fakeRes());

  assert.deepEqual(hub.stats(), { users: 1, connections: 1 });
});

test('closeAll ends every open tab and empties the hub', () => {
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

test('frame is one SSE message, with an id line only when given', () => {
  // The signal frame is byte-for-byte what the frontend already reads.
  assert.equal(
    frame('signal', signal),
    'event: signal\ndata: {"type":"NEW_MATCHING_REQUEST","requestId":"0b7e3f2a-6d1c-4a52-9a43-6a1f5e0f1c11"}\n\n',
  );
  assert.equal(
    frame('notification', { notificationId: 'n_1' }, 'n_1'),
    'id: n_1\nevent: notification\ndata: {"notificationId":"n_1"}\n\n',
  );
  assert.throws(() => frame('notification', {}, 'n_1\nevent: fake'), /one line/);
});
