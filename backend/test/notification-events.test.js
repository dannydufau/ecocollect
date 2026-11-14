'use strict';

/*
 * GET /api/events against a real Express server on a random port. fetch()
 * plays the browser and reads the stream as it arrives.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createHub } = require('../src/notification/hub');
const { createEventsRouter, READY_FRAME } = require('../src/notification/events');

const quietLog = { info() {} };

// Starts the events router on a free port with a fresh hub.
async function startServer() {
  const hub = createHub();
  const app = express();
  app.use(createEventsRouter(hub, { log: quietLog }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/events`;
  const stop = () => {
    server.closeAllConnections(); // open SSE streams would keep close() waiting
    return new Promise((resolve) => server.close(resolve));
  };
  return { hub, url, stop };
}

// Opens a stream like a browser tab (as if Caddy had added X-User-Id).
async function connect(url, uid) {
  const abort = new AbortController();
  const headers = uid ? { 'X-User-Id': uid } : {};
  const res = await fetch(url, { headers, signal: abort.signal });

  let text = '';
  let ended = false;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  // Reads chunks until the snippet arrives, the stream ends, or time runs out.
  async function waitFor(snippet, ms = 2000) {
    const deadline = Date.now() + ms;
    while (!text.includes(snippet) && !ended) {
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for ${JSON.stringify(snippet)}; got: ${JSON.stringify(text)}`);
      const chunk = await Promise.race([
        reader.read(),
        new Promise((r) => setTimeout(() => r({ timeout: true }), left)),
      ]);
      if (chunk.timeout) continue;
      if (chunk.done) ended = true;
      else text += decoder.decode(chunk.value, { stream: true });
    }
    return text;
  }

  return { res, text: () => text, waitFor, disconnect: () => abort.abort() };
}

async function waitFor(condition, what, ms = 2000) {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

test('without X-User-Id the request gets 401 and no stream is opened', async () => {
  const { hub, url, stop } = await startServer();
  try {
    const res = await fetch(url);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'not signed in' });
    assert.deepEqual(hub.stats(), { users: 0, connections: 0 });
  } finally {
    await stop();
  }
});

test('a signed-in tab gets SSE headers and a ready frame first', async () => {
  const { hub, url, stop } = await startServer();
  const tab = await connect(url, 'firebaseUid_v1');
  try {
    assert.equal(tab.res.status, 200);
    assert.match(tab.res.headers.get('content-type'), /^text\/event-stream/);
    assert.match(tab.res.headers.get('cache-control'), /no-cache/);

    await tab.waitFor(READY_FRAME);
    assert.ok(tab.text().startsWith(READY_FRAME), 'ready must be the very first frame');
    assert.deepEqual(hub.stats(), { users: 1, connections: 1 });
  } finally {
    tab.disconnect();
    await stop();
  }
});

test('when the tab disconnects, the hub forgets it', async () => {
  const { hub, url, stop } = await startServer();
  const tab = await connect(url, 'firebaseUid_v1');
  try {
    await tab.waitFor(READY_FRAME);
    assert.deepEqual(hub.stats(), { users: 1, connections: 1 });

    tab.disconnect();

    await waitFor(() => hub.stats().connections === 0, 'the hub to drop the closed stream');
  } finally {
    await stop();
  }
});