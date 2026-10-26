const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { read, root, openapi } = require('./helpers');

const files = ['README.md', 'openapi.yaml', 'asyncapi.yaml', 'schemas/common.yaml'];
const deferred = ['/api/categories', '/api/profile', '/api/notifications', '/api/push'];

test('the files are plain ASCII, so they look the same in every editor and terminal', () => {
  for (const file of files) {
    const bad = [...read(file)].find((c) => c.charCodeAt(0) > 126);
    assert.equal(bad, undefined, `${file} has ${JSON.stringify(bad)}`);
  }
});

test('every link in the README points at a file that exists', () => {
  const links = [...read('README.md').matchAll(/\]\(\.\/([^)#]+)/g)].map((m) => m[1]);
  assert.ok(links.length > 0);
  for (const link of links) assert.ok(fs.existsSync(path.join(root, link)), `${link} is missing`);
});

test('the README mentions every path in the OpenAPI file', () => {
  const readme = read('README.md');
  for (const route of Object.keys(openapi.paths)) assert.ok(readme.includes(route), `${route} is not in the README`);
});

test('deferred endpoints only show up in the Deferred section', () => {
  const [flow, afterDeferred] = read('README.md').split('## Deferred');
  assert.ok(afterDeferred, 'the README has no Deferred section');
  for (const route of deferred) {
    assert.ok(afterDeferred.includes(route), `${route} should be listed as deferred`);
    for (const [name, text] of [['README flow', flow], ['openapi.yaml', read('openapi.yaml')], ['asyncapi.yaml', read('asyncapi.yaml')]]) {
      assert.ok(!text.includes(route), `${name} still uses ${route}`);
    }
  }
});

test('nothing in the contracts talks about who or what wrote it', () => {
  for (const file of files) assert.doesNotMatch(read(file), /claude|anthropic|generated (by|with)|\bAI\b/i, file);
});

test('the notification service has no database for Oct 28', () => {
  const [flow] = read('README.md').split('## Deferred');
  const stored = /processed_events|notification rows|saves? (a |the )?notifications?|database work/i;
  assert.doesNotMatch(flow, stored, 'README flow');
  assert.doesNotMatch(read('asyncapi.yaml'), stored, 'asyncapi.yaml');
  assert.doesNotMatch(read('openapi.yaml'), stored, 'openapi.yaml');
});

test('the Deferred section keeps the plan for stored notifications', () => {
  const [, deferredText] = read('README.md').split('## Deferred');
  assert.match(deferredText, /processed_events/, 'repeat handling comes back with storage');
  assert.match(deferredText, /notifications table|stored notifications/i);
});

test('no shared queue is named anywhere, each notification instance has its own', () => {
  for (const file of ['README.md', 'asyncapi.yaml']) {
    assert.doesNotMatch(read(file), /notification\.request-events/, `${file} still names the shared queue`);
  }
});

test('every file says the frontend refetches when the stream opens, that is how missed signals are recovered', () => {
  for (const file of ['README.md', 'asyncapi.yaml', 'openapi.yaml']) {
    assert.match(read(file), /onopen/, `${file} should mention refetching in onopen`);
  }
  assert.doesNotMatch(read('README.md'), /every 30 seconds/, 'no polling while the stream is down');
});

test('the outbox only promises delivery to RabbitMQ, what happens after that is up to each consumer', () => {
  assert.match(read('asyncapi.yaml'), /never lost before it reaches RabbitMQ/);
  assert.doesNotMatch(read('asyncapi.yaml'), /so it is never lost\./);
  assert.match(read('README.md'), /never lost before it reaches RabbitMQ/);
});

test('the README says how events may change: new fields are fine, breaking changes need a new version', () => {
  assert.match(read('README.md'), /ignore (the )?fields they don't know/i);
  assert.match(read('README.md'), /new `version`/);
});
