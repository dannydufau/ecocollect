// Checks the toolchain itself: Node runs this .ts file directly, and an ES-module
// .ts file can import the shared CommonJS code in src/messaging (the publisher
// imports `exchange` from topology.js the same way).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import topology from '../../src/messaging/topology.js';

test('shared CommonJS modules can be imported from TypeScript', () => {
  assert.equal(topology.exchange.name, 'ecocollect.events');
});
