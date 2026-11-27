'use strict';

// Tests for GET /api/public/events (N2) against a real Express server on a random port.
// Run with:  npm test   (from backend/)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createHub } = require('../src/notification/hub');
const { createPublicEventsRouter, profileKey } = require('../src/notification/public-events');
const { READY_FRAME } = require('../src/notification/events');

// Start the public stream router on a random free port with a fresh hub.
async function startServer() {
  const publicHub = createHub();
  const app = express();
  app.use(createPublicEventsRouter(publicHub, { log: { info() {} } }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/public/events`;
  const stop = () => {
    server.closeAllConnections(); // an open stream would keep close() waiting
    return new Promise((resolve) => server.close(resolve));
  };
  return { publicHub, url, stop };
}

test('a profile page opens a stream: ready first, and sends for that profile reach it', async () => {
  const { publicHub, url, stop } = await startServer();
  const abort = new AbortController();
  try {
    const res = await fetch(`${url}?profile=danny`, { signal: abort.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/event-stream/);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    assert.equal(decoder.decode((await reader.read()).value), READY_FRAME);

    // The page is reachable by the profile it watches.
    assert.equal(publicHub.send(profileKey('danny'), 'public-profile-updated', { accountId: 'danny' }), 1);
    assert.equal(decoder.decode((await reader.read()).value),
      'event: public-profile-updated\ndata: {"accountId":"danny"}\n\n');
  } finally {
    abort.abort();
    await stop();
  }
});

test('a stream without exactly one valid profile or stats gets 400 and is never opened', async () => {
  const { publicHub, url, stop } = await startServer();
  try {
    for (const [query, code] of [
      ['', 'invalid_stream'],                            // neither
      ['?profile=danny&stats', 'invalid_stream'],        // both
      ['?profile=Danny!', 'invalid_profile'],            // not an account id
      ['?profile=danny&profile=sam', 'invalid_profile'], // two profiles
    ]) {
      const res = await fetch(url + query);
      assert.equal(res.status, 400, query);
      assert.equal((await res.json()).error.code, code, query);
    }
    assert.deepEqual(publicHub.stats(), { users: 0, connections: 0 }, 'no watcher was added');
  } finally {
    await stop();
  }
});
