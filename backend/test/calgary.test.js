const test = require('node:test');
const assert = require('node:assert');
const { windowStart } = require('../src/api/requests/calgary');

test('a summer window is six hours behind UTC', () => {
  assert.strictEqual(windowStart('2026-10-30', 14).toISOString(), '2026-10-30T20:00:00.000Z');
});

test('a winter window is seven hours behind UTC', () => {
  assert.strictEqual(windowStart('2026-11-02', 14).toISOString(), '2026-11-02T21:00:00.000Z');
});

test('midnight and the last hour of the day land on the right day', () => {
  assert.strictEqual(windowStart('2026-10-30', 0).toISOString(), '2026-10-30T06:00:00.000Z');
  assert.strictEqual(windowStart('2026-10-30', 23).toISOString(), '2026-10-31T05:00:00.000Z');
});

test('the clocks go back on Nov 1, so hours either side of it differ', () => {
  assert.strictEqual(windowStart('2026-11-01', 8).toISOString(), '2026-11-01T15:00:00.000Z');
  assert.strictEqual(windowStart('2026-10-31', 8).toISOString(), '2026-10-31T14:00:00.000Z');
});
