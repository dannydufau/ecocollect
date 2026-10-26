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
