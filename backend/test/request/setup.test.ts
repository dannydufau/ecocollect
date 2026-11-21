// Checks the toolchain itself: Node runs this .ts file directly, and an ES-module
// .ts file can import the shared CommonJS code in src/messaging (after Danny's 104
// merges, the publisher imports `exchange` from topology.js the same way).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import outbox from '../../src/messaging/outbox.js';

test('shared CommonJS modules can be imported from TypeScript', () => {
  assert.equal(typeof outbox.EXCHANGE, 'string');
});
