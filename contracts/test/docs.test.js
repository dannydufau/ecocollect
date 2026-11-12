const { test } = require('node:test');
const assert = require('node:assert/strict');
const { read, openapi, asyncapi } = require('./helpers');

// README.md is the Nov 9 contract (Jasdeep's). These checks keep the specs and the README in step.
const readme = read('README.md');
const specs = ['openapi.yaml', 'asyncapi.yaml', 'schemas/common.yaml'];

test('the spec files are plain ASCII, so they look the same in every editor and terminal', () => {
  for (const file of specs) {
    const bad = [...read(file)].find((c) => c.charCodeAt(0) > 126);
    assert.equal(bad, undefined, `${file} has ${JSON.stringify(bad)}`);
  }
});

test('nothing in the specs talks about who or what wrote them', () => {
  for (const file of specs) assert.doesNotMatch(read(file), /claude|anthropic|generated (by|with)|\bAI\b/i, file);
});

test('every path in the OpenAPI file is in the README', () => {
  for (const route of Object.keys(openapi.paths)) {
    const asReadme = route.replace(/\{(\w+)\}/g, ':$1');
    assert.ok(readme.includes(asReadme), `${asReadme} is not in the README`);
  }
});

test('every event and SSE message in the AsyncAPI file is in the README', () => {
  for (const message of Object.values(asyncapi.components.messages)) {
    const name = message.name === 'push' ? 'Push' : message.name;
    assert.ok(readme.includes(name), `${name} is not in the README`);
  }
});
