'use strict';

// Integration test for the whole notification service: the real index.js runs
// as its own process against a real RabbitMQ. This is the scripted version of
// the manual end-to-end check: open tabs, publish RequestCreated, see signals.
//
// Run with:  npm run test:integration   (from backend/)
// Skipped when RABBITMQ_URL is not set.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const amqp = require('amqplib');

const { exchange, events } = require('../../src/messaging/topology');

const URL_AMQP = process.env.RABBITMQ_URL;
const skip = URL_AMQP ? false : 'RABBITMQ_URL not set';
const ENTRY = path.join(__dirname, '../../src/notification/index.js');

// --- helpers ----------------------------------------------------------------

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

// Start index.js as a child process, like `node src/notification/index.js`.
// Collects its log lines and resolves once it is listening AND consuming.
async function startService() {
  const port = await freePort();
  const child = spawn(process.execPath, [ENTRY], {
    env: { ...process.env, RABBITMQ_URL: URL_AMQP, PORT: String(port) },
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
  return { child, lines, exited, url: `http://127.0.0.1:${port}/api/events` };
}

async function stopService(service) {
  if (service.child.exitCode === null) service.child.kill('SIGTERM');
  return service.exited;
}

// A browser tab: open the stream as a signed-in user (as if Caddy had run
// /verify and added X-User-Id) and collect everything that arrives.
async function openTab(url, uid) {
  const abort = new AbortController();
  const res = await fetch(url, { headers: { 'X-User-Id': uid }, signal: abort.signal });
  const tab = { res, text: '', ended: false, close: () => abort.abort() };
  (async () => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of res.body) tab.text += decoder.decode(chunk, { stream: true });
    } catch { /* aborted */ }
    tab.ended = true;
  })();
  await waitFor(() => tab.text.includes('event: ready'), `the ready frame for ${uid}`);
  return tab;
}

// The data of every `event: signal` frame received so far, parsed.
function signalsIn(tab) {
  return tab.text
    .split('\n\n')
    .filter((frame) => frame.startsWith('event: signal\n'))
    .map((frame) => JSON.parse(frame.split('\n')[1].slice('data: '.length)));
}

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
  await pubCh.assertExchange(exchange.name, exchange.type, { durable: exchange.durable });
});

after(async () => {
  if (pubConn) await pubConn.close().catch(() => {});
});

// --- tests ------------------------------------------------------------------

test('a RequestCreated reaches the resident and matched volunteers as SSE signals', { skip }, async () => {
  const service = await startService();
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

    const requestId = randomUUID();
    await publishRequestCreated({ requestId, residentUid: resident, matchedVolunteerUids: [volunteer, offline] });

    await waitFor(
      () => signalsIn(residentTab).length > 0 && signalsIn(volunteerTab).length > 0,
      'both recipients to get their signal',
    );
    assert.deepEqual(signalsIn(residentTab), [{ type: 'REQUEST_CREATED', requestId }]);
    assert.deepEqual(signalsIn(volunteerTab), [{ type: 'NEW_MATCHING_REQUEST', requestId }]);

    // The offline volunteer had no tab: logged as delivered to 0 tabs, no error.
    await waitFor(() => service.lines.some((l) => l.includes(`-> ${offline} (0 open tabs)`)), 'the offline log line');
    // A connected user who isn't a recipient gets nothing.
    assert.deepEqual(signalsIn(bystanderTab), []);
  } finally {
    tabs.forEach((t) => t.close());
    await stopService(service);
  }
});

test('SIGTERM ends open streams and the service exits cleanly', { skip }, async () => {
  const service = await startService();
  const tab = await openTab(service.url, `it-volunteer-${randomUUID()}`);
  try {
    service.child.kill('SIGTERM');

    const code = await service.exited;
    assert.equal(code, 0, `exit code (log: ${JSON.stringify(service.lines)})`);
    // closeAll ended the stream, so the browser would reconnect elsewhere.
    await waitFor(() => tab.ended, 'the open stream to end');
    assert.ok(service.lines.some((l) => l.includes('SIGTERM: shutting down')));
  } finally {
    tab.close();
  }
});