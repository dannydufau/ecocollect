const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shared, common } = require('./helpers');

const accepts = (name, values) =>
  values.forEach((v) => assert.ok(shared(name)(v), `${name} should accept ${JSON.stringify(v)}`));
const rejects = (name, values) =>
  values.forEach((v) => assert.ok(!shared(name)(v), `${name} should reject ${JSON.stringify(v)}`));

test('PickupWindowInput takes a date and an hour from 0 to 23', () => {
  accepts('PickupWindowInput', [
    { date: '2026-10-30', startHour: 14 },
    { date: '2026-10-30', startHour: 0 },
    { date: '2026-10-30', startHour: 23 },
  ]);
});

test('PickupWindowInput rejects a bad hour, a bad date or a missing field', () => {
  rejects('PickupWindowInput', [
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

test('PickupWindowInput has no windowId: the server assigns it when the window is saved', () => {
  rejects('PickupWindowInput', [{ windowId: 'w_1', date: '2026-10-30', startHour: 14 }]);
});

test('PickupWindow is a saved window: windowId is required, with the same date and hour rules', () => {
  accepts('PickupWindow', [
    { windowId: 'w_1', date: '2026-10-30', startHour: 14 },
    { windowId: 'w_2', date: '2026-10-30', startHour: 0 },
    { windowId: 'w_3', date: '2026-10-30', startHour: 23 },
  ]);
  rejects('PickupWindow', [
    { date: '2026-10-30', startHour: 14 },
    { windowId: '', date: '2026-10-30', startHour: 14 },
    { windowId: 'w_1', date: '2026-10-30', startHour: 24 },
    { windowId: 'w_1', date: '2026-10-30' },
    { windowId: 'w_1', date: '2026-10-30', startHour: 14, extra: true },
  ]);
});

test('RequestStatus is exactly the seven states, with Missed as a final status', () => {
  assert.deepEqual(common.RequestStatus.enum, [
    'Open', 'Assigned', 'Collected', 'Delivered', 'Cancelled', 'Expired', 'Missed',
  ]);
  rejects('RequestStatus', ['open', 'OPEN', 'Done', 'Missed_Pickup', '', null]);
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

test('AssignmentStatus is exactly the six assignment states', () => {
  assert.deepEqual(common.AssignmentStatus.enum, [
    'Active', 'Collected', 'Delivered', 'Volunteer_Cancelled', 'Resident_Cancelled', 'Missed_Pickup',
  ]);
  rejects('AssignmentStatus', ['Assigned', 'Missed', 'active', '', null]);
});

test('Error has a snake_case code and a message, and validation details per field', () => {
  accepts('Error', [
    { error: { code: 'request_unavailable', message: 'This request is no longer available.' } },
    { error: { code: 'validation_failed', message: 'Check the form.',
               details: { fields: { 'items[1].categoryId': 'already selected', quantity: 'must be a positive integer' } } } },
  ]);
  rejects('Error', [
    { code: 'not_open', message: 'x' },
    { error: { code: 'NotOpen', message: 'x' } },
    { error: { code: 'not_open' } },
    { error: { code: 'not_open', message: '' } },
    { error: { code: 'invalid', message: 'x', details: { fields: { quantity: 3 } } } },
  ]);
});

test('Category has an id, a name and a waste type', () => {
  accepts('Category', [{ categoryId: 'laptops', name: 'Computers/Laptops', wasteType: 'Electronics' }]);
  rejects('Category', [
    { categoryId: 'laptops', name: 'Computers/Laptops' },
    'laptops',
    { categoryId: '', name: 'x', wasteType: 'y' },
  ]);
});

test('AccountId is 3 to 50 lowercase letters, digits, _ or -', () => {
  accepts('AccountId', ['dan', 'danny', 'satyam_b', 'demo-1a2b', 'a'.repeat(50)]);
  rejects('AccountId', ['da', 'Danny', 'dan ny', 'dan.ny', 'a'.repeat(51), '', 7]);
});

test('Decimal has at most 2 decimals and is never negative', () => {
  accepts('Decimal', [0, 5, 5.0, 5.07, 13.5, 26.01, 1234.99]);
  rejects('Decimal', [1.234, 0.001, -1, '5.07', null]);
});

test('Roles is one or both of resident and volunteer, without repeats', () => {
  accepts('Roles', [['resident'], ['volunteer'], ['resident', 'volunteer']]);
  rejects('Roles', [[], ['admin'], ['resident', 'resident'], 'resident']);
  accepts('Role', ['resident', 'volunteer']);
  rejects('Role', ['Resident', 'admin']);
});

test('Address is a street and a Calgary postal code; city is only ever Calgary', () => {
  accepts('Address', [
    { street: '123 4 Ave SW', postalCode: 'T2P1J9' },
    { street: '123 4 Ave SW', city: 'Calgary', postalCode: 'T2P1J9' },
  ]);
  rejects('Address', [
    { street: '123 4 Ave SW' },
    { street: '', postalCode: 'T2P1J9' },
    { street: '123 4 Ave SW', city: 'Edmonton', postalCode: 'T2P1J9' },
    { street: '123 4 Ave SW', postalCode: 'T2P 1J9' },
  ]);
});
