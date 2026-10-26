const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shared, common } = require('./helpers');

const accepts = (name, values) =>
  values.forEach((v) => assert.ok(shared(name)(v), `${name} should accept ${JSON.stringify(v)}`));
const rejects = (name, values) =>
  values.forEach((v) => assert.ok(!shared(name)(v), `${name} should reject ${JSON.stringify(v)}`));

test('PickupWindow takes a date and an hour from 0 to 23', () => {
  accepts('PickupWindow', [
    { date: '2026-10-30', startHour: 14 },
    { date: '2026-10-30', startHour: 0 },
    { date: '2026-10-30', startHour: 23 },
  ]);
});

test('PickupWindow rejects a bad hour, a bad date or a missing field', () => {
  rejects('PickupWindow', [
    { date: '2026-10-30', startHour: 24 },
    { date: '2026-10-30', startHour: -1 },
    { date: '2026-10-30', startHour: 14.5 },
    { date: '2026-10-30', startHour: '14' },
    { date: '2026-13-01', startHour: 14 },
    { date: '2026-02-30', startHour: 14 },
    { date: '2026-10-30T14:00:00Z', startHour: 14 },
    { date: '2026-10-30' },
    { startHour: 14 },
  ]);
});

test('RequestStatus is exactly the six states in the database', () => {
  assert.deepEqual(common.RequestStatus.enum, [
    'Open', 'Assigned', 'Collected', 'Delivered', 'Cancelled', 'Expired',
  ]);
  rejects('RequestStatus', ['open', 'OPEN', 'Done', '', null]);
});

test('Timestamp is UTC with a Z, as the conventions say', () => {
  accepts('Timestamp', ['2026-10-28T16:15:00Z', '2026-10-28T16:15:00.250Z']);
  rejects('Timestamp', [
    '2026-10-28',
    '2026-10-28T16:15:00',
    '2026-10-28T10:15:00-06:00',
    '2026-10-28T16:15:00+00:00',
    1793204100,
  ]);
});

test('PostalCode is a full Calgary code: uppercase, no space, starts with T', () => {
  accepts('PostalCode', ['T2P1J9', 'T3A0B1', 'T2E5A8']);
  rejects('PostalCode', ['t2p1j9', 'T2P 1J9', 'T2P1J', 'T2P1J99', 'T2P', 'M5V3L9', '2TP1J9', 'TTPPJ9']);
});
