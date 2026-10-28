const test = require('node:test');
const assert = require('node:assert');
const { parseCreate, parseList } = require('../src/api/requests/validate');

// Wednesday Oct 28, 10:15 in Calgary.
const now = new Date('2026-10-28T16:15:00Z');
const body = (extra = {}) => ({
  items: [{ categoryId: 'laptops', quantity: 2 }],
  windows: [{ date: '2026-10-30', startHour: 14 }],
  safetyAcknowledged: true,
  ...extra,
});
const rejects = (input, pattern) => {
  const { error } = parseCreate(input, now);
  assert.match(error, pattern);
};

test('a complete body comes back ready to store', () => {
  const { error, items, windows, notes } = parseCreate(body({ notes: 'Back door' }), now);
  assert.strictEqual(error, undefined);
  assert.deepStrictEqual(items, [{ categoryId: 'laptops', quantity: 2 }]);
  assert.deepStrictEqual(windows, [{ date: '2026-10-30', startHour: 14 }]);
  assert.strictEqual(notes, 'Back door');
});

test('no body, or no items, is rejected', () => {
  rejects(undefined, /JSON body/);
  rejects(body({ items: [] }), /at least one item/);
  rejects(body({ items: 'laptops' }), /at least one item/);
});

test('items need a category and a whole quantity of 1 or more', () => {
  rejects(body({ items: [{ quantity: 1 }] }), /categoryId/);
  rejects(body({ items: [{ categoryId: 'laptops', quantity: 0 }] }), /quantity/);
  rejects(body({ items: [{ categoryId: 'laptops', quantity: 1.5 }] }), /quantity/);
  rejects(body({ items: [{ categoryId: 'laptops', quantity: '2' }] }), /quantity/);
  rejects(body({ items: [{ categoryId: 'laptops', quantity: 1, description: 5 }] }), /description/);
});

test('other-electronics needs a description that is not blank', () => {
  const other = (description) => body({ items: [{ categoryId: 'other-electronics', quantity: 1, description }] });
  rejects(other(undefined), /other-electronics/);
  rejects(other('   '), /other-electronics/);
  assert.strictEqual(parseCreate(other('Old label printer'), now).error, undefined);
});

test('one to three windows are fine, none or four are not', () => {
  const day = (n) => ({ date: `2026-11-0${n}`, startHour: 9 });
  assert.strictEqual(parseCreate(body({ windows: [day(1), day(2), day(3)] }), now).error, undefined);
  rejects(body({ windows: [] }), /1 to 3/);
  rejects(body({ windows: [day(1), day(2), day(3), day(4)] }), /1 to 3/);
  rejects(body({ windows: undefined }), /1 to 3/);
});

test('a window needs a real date and an hour from 0 to 23', () => {
  rejects(body({ windows: [{ date: '2026-02-30', startHour: 9 }] }), /date/);
  rejects(body({ windows: [{ date: '30/10/2026', startHour: 9 }] }), /date/);
  rejects(body({ windows: [{ date: '2026-10-30', startHour: 24 }] }), /startHour/);
  rejects(body({ windows: [{ date: '2026-10-30', startHour: 9.5 }] }), /startHour/);
});

test('windows must start in the future, by Calgary time', () => {
  rejects(body({ windows: [{ date: '2026-10-27', startHour: 9 }] }), /not in the future/);
  rejects(body({ windows: [{ date: '2026-10-28', startHour: 10 }] }), /not in the future/);
  assert.strictEqual(parseCreate(body({ windows: [{ date: '2026-10-28', startHour: 11 }] }), now).error, undefined);
});

test('windows must start before the request expires, 30 days after creation', () => {
  // The cutoff is 9:15 on Nov 27 in Calgary. These hours are far enough from it to give the same answer
  // whether or not Calgary goes back to winter time, which depends on the timezone data in Node.
  assert.strictEqual(parseCreate(body({ windows: [{ date: '2026-11-27', startHour: 8 }] }), now).error, undefined);
  rejects(body({ windows: [{ date: '2026-11-27', startHour: 12 }] }), /expire/);
  rejects(body({ windows: [{ date: '2026-12-31', startHour: 9 }] }), /expire/);
});

test('two windows on the same date are rejected', () => {
  rejects(body({ windows: [{ date: '2026-10-30', startHour: 9 }, { date: '2026-10-30', startHour: 15 }] }), /different date/);
});

test('notes must be text, and safety has to be acknowledged', () => {
  rejects(body({ notes: 5 }), /notes/);
  rejects(body({ safetyAcknowledged: false }), /safetyAcknowledged/);
  rejects(body({ safetyAcknowledged: 'true' }), /safetyAcknowledged/);
  rejects({ items: body().items, windows: body().windows }, /safetyAcknowledged/);
});

const listRejects = (query, pattern) => assert.match(parseList(query).error, pattern);

test('list: view is required and is mine or available', () => {
  listRejects({}, /view/);
  listRejects({ view: 'all' }, /view/);
  listRejects({ view: ['mine', 'available'] }, /view/);
  assert.deepStrictEqual(parseList({ view: 'mine' }), { view: 'mine', status: undefined });
  assert.deepStrictEqual(parseList({ view: 'available' }), { view: 'available' });
});

test('list: status is for mine only, and has to be a real status', () => {
  assert.strictEqual(parseList({ view: 'mine', status: 'Collected' }).status, 'Collected');
  listRejects({ view: 'mine', status: 'Done' }, /status must be one of/);
  listRejects({ view: 'mine', status: 'open' }, /status must be one of/);
  listRejects({ view: 'available', status: 'Open' }, /view=mine/);
});

test('list: postal codes are for available only', () => {
  listRejects({ view: 'mine', postalCodes: 'T2P1J9' }, /view=available/);
});

test('list: postal codes are tidied up before matching', () => {
  assert.deepStrictEqual(parseList({ view: 'available', postalCodes: 'T2P1J9' }).postalCodes, ['T2P1J9']);
  assert.deepStrictEqual(parseList({ view: 'available', postalCodes: ' t2p 1j9 ,T3A0B1' }).postalCodes, ['T2P1J9', 'T3A0B1']);
});

test('list: bad postal codes are rejected', () => {
  for (const postalCodes of ['T2P', 'M5V3L9', 'T2P1J9,', '', 'T2P1J9,,T3A0B1']) {
    listRejects({ view: 'available', postalCodes }, /postal code/);
  }
  listRejects({ view: 'available', postalCodes: ['T2P1J9', 'T3A0B1'] }, /comma separated/);
});

test('list: ten postal codes are fine, eleven are not', () => {
  const codes = (n) => Array.from({ length: n }, (_, i) => `T2P1J${i}`).join(',');
  assert.strictEqual(parseList({ view: 'available', postalCodes: codes(10) }).postalCodes.length, 10);
  listRejects({ view: 'available', postalCodes: codes(11) }, /at most 10/);
});
