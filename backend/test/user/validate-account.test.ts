import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCalgaryPostalCode, validateAccount } from '../../src/user/validation/account.ts';

const now = new Date('2026-11-20T00:30:00Z');
const account = () => ({
  username: 'test-resident', email: 'resident@example.com', password: 'Demo1234!',
  firstName: 'Avery', lastName: 'Chen', publicName: 'Avery C.', dateOfBirth: '1990-01-15',
  role: 'resident', termsDocumentId: '00000001-0000-4000-8000-000000000002',
  address: { street: '1 Example Street', postalCode: 'T2P1J9' },
});

test('accepts a resident, a volunteer without an address, and optional empty codes', () => {
  assert.deepEqual(validateAccount(account(), now), {});
  const { address, ...volunteer } = { ...account(), role: 'volunteer', preferredPostalCodes: [] };
  assert.deepEqual(validateAccount(volunteer, now), {});
  assert.deepEqual(validateAccount({ ...volunteer, preferredPostalCodes: ['T0A0A0', 'T2N1N4', 'T2T4M3'] }, now), {});
});

test('every required field has its own missing and wrong-type error', () => {
  const required = ['username', 'email', 'password', 'firstName', 'lastName', 'publicName', 'dateOfBirth', 'role', 'termsDocumentId'];
  for (const key of required) {
    const body: Record<string, unknown> = account();
    delete body[key];
    assert.deepEqual(Object.keys(validateAccount(body, now)), [key], `missing ${key}`);
    for (const value of [null, false, 5, [], {}]) {
      assert.deepEqual(Object.keys(validateAccount({ ...account(), [key]: value }, now)), [key], `${key}: ${JSON.stringify(value)}`);
    }
    assert.ok(validateAccount({ ...account(), [key]: '' }, now)[key], `empty ${key}`);
  }
});

test('non-object bodies produce a field error rather than throwing', () => {
  for (const body of [undefined, null, false, 3, 'text', [], [account()]]) {
    assert.deepEqual(Object.keys(validateAccount(body, now)), ['body']);
  }
});

test('unknown fields, including prototype names, get safe field errors', () => {
  const body = JSON.parse(JSON.stringify(account()).replace('{', '{"__proto__":{},"constructor":5,"extra":true,'));
  const errors = validateAccount(body, now);
  assert.deepEqual(Object.keys(errors).sort(), ['__proto__', 'constructor', 'extra']);
  assert.equal(Object.getPrototypeOf(errors), Object.prototype);
  assert.equal(Object.hasOwn(errors, '__proto__'), true);
});

test('username limits and allowed characters are exact', () => {
  for (const username of ['abc', 'a'.repeat(50), 'test_9-user']) assert.deepEqual(validateAccount({ ...account(), username }, now), {});
  for (const username of ['ab', 'a'.repeat(51), 'Uppercase', 'has space', 'a.b', 'test\n', 'test\r', 'éclair']) {
    assert.ok(validateAccount({ ...account(), username }, now).username, JSON.stringify(username));
  }
});

test('email accepts common valid forms and rejects malformed addresses', () => {
  for (const email of ['person@example.com', 'First.Last+tag@sub.example.ca', 'a_b@xn--bcher-kva.example']) {
    assert.deepEqual(validateAccount({ ...account(), email }, now), {});
  }
  for (const email of ['not-an-email', '@example.com', 'a@', 'a@@example.com', 'a b@example.com', '.a@example.com', 'a..b@example.com', 'a@-example.com', 'a@example..com', 'a@example.com\n', ' a@example.com']) {
    assert.ok(validateAccount({ ...account(), email }, now).email, JSON.stringify(email));
  }
});

test('password minimum counts characters and names reject blank text', () => {
  assert.ok(validateAccount({ ...account(), password: '12345' }, now).password);
  assert.deepEqual(validateAccount({ ...account(), password: '123456' }, now), {});
  assert.ok(validateAccount({ ...account(), password: '😀😀😀' }, now).password);
  assert.deepEqual(validateAccount({ ...account(), password: '😀😀😀😀😀😀' }, now), {});
  for (const key of ['firstName', 'lastName', 'publicName']) {
    for (const value of [' ', '\t\n']) assert.ok(validateAccount({ ...account(), [key]: value }, now)[key]);
    assert.deepEqual(validateAccount({ ...account(), [key]: 'Élodie' }, now), {});
  }
});

test('Calgary birthdays use the local day even when UTC is already tomorrow', () => {
  assert.deepEqual(validateAccount({ ...account(), dateOfBirth: '2008-11-19' }, now), {});
  assert.ok(validateAccount({ ...account(), dateOfBirth: '2008-11-20' }, now).dateOfBirth);
  assert.deepEqual(validateAccount({ ...account(), dateOfBirth: '2008-11-20' }, new Date('2026-11-20T06:00:00Z')), {});
  assert.ok(validateAccount({ ...account(), dateOfBirth: '2026-11-20' }, now).dateOfBirth?.includes('future'));
});

test('leap-day birthdays become 18 on March 1 in a non-leap year', () => {
  const body = { ...account(), dateOfBirth: '2004-02-29' };
  assert.ok(validateAccount(body, new Date('2022-02-28T20:00:00Z')).dateOfBirth);
  assert.deepEqual(validateAccount(body, new Date('2022-03-01T20:00:00Z')), {});
});

test('date validation rejects impossible dates, timestamps and future dates', () => {
  for (const dateOfBirth of ['2007-02-29', '1900-02-29', '2000-04-31', '2000-00-10', '2000-13-01', '2000-01-00', '0000-01-01', '2000-1-01', '2000-01-01T00:00:00Z', '1990-01-01\n', '2030-01-01']) {
    assert.ok(validateAccount({ ...account(), dateOfBirth }, now).dateOfBirth, dateOfBirth);
  }
  assert.deepEqual(validateAccount({ ...account(), dateOfBirth: '2000-02-29' }, now), {});
  assert.throws(() => validateAccount(account(), new Date('invalid')), RangeError);
});

test('the role must be one supported role and a resident needs an address', () => {
  for (const role of ['both', 'Resident', 'admin']) assert.ok(validateAccount({ ...account(), role }, now).role);
  const { address, ...body } = account();
  assert.ok(validateAccount(body, now).address);
  for (const value of [null, 'street', 5, []]) assert.ok(validateAccount({ ...body, address: value }, now).address);
});

test('address errors use nested paths and the optional city follows the shared schema', () => {
  assert.deepEqual(Object.keys(validateAccount({ ...account(), address: {} }, now)).sort(), ['address.postalCode', 'address.street']);
  assert.ok(validateAccount({ ...account(), address: { street: ' ', postalCode: 'T2P1J9' } }, now)['address.street']);
  assert.ok(validateAccount({ ...account(), address: { street: 'A street', postalCode: 't2p 1j9' } }, now)['address.postalCode']);
  assert.ok(validateAccount({ ...account(), address: { ...account().address, extra: 1 } }, now)['address.extra']);
  assert.ok(validateAccount({ ...account(), address: { ...account().address, city: 'Edmonton' } }, now)['address.city']);
  assert.deepEqual(validateAccount({ ...account(), address: { ...account().address, city: 'Calgary' } }, now), {});
});

test('postal format is strict, does not normalize and matches the contract', () => {
  for (const value of ['T2P1J9', 'T0A0A0', 'T9Z9Z9']) assert.equal(isCalgaryPostalCode(value), true);
  for (const value of ['t2p1j9', 'T2P 1J9', 'V2P1J9', 'T2P1J9\n', 'T2P1J', ' T2P1J9', null, 123456]) assert.equal(isCalgaryPostalCode(value), false, String(value));
});

test('preferred code errors identify the list or the offending entry', () => {
  assert.deepEqual(validateAccount({ ...account(), preferredPostalCodes: [] }, now), {});
  for (const value of [null, 'T2P1J9', 5, {}]) assert.ok(validateAccount({ ...account(), preferredPostalCodes: value }, now).preferredPostalCodes);
  assert.ok(validateAccount({ ...account(), preferredPostalCodes: ['T2P1J9','T2N1N4','T2T4M3','T0A0A0'] }, now).preferredPostalCodes);
  assert.ok(validateAccount({ ...account(), preferredPostalCodes: ['T2P1J9','T2P1J9'] }, now)['preferredPostalCodes[1]']);
  assert.ok(validateAccount({ ...account(), preferredPostalCodes: ['T2P1J9','bad'] }, now)['preferredPostalCodes[1]']);
});

test('optional fields are checked for either role without changing the submitted object', () => {
  const body = Object.freeze({ ...account(), role: 'volunteer', address: Object.freeze(account().address), preferredPostalCodes: Object.freeze(['T2P1J9']) });
  assert.deepEqual(validateAccount(body, now), {});
  assert.ok(validateAccount({ ...account(), role: 'volunteer', address: { street: '', postalCode: 'bad' } }, now)['address.street']);
  assert.ok(validateAccount({ ...account(), preferredPostalCodes: ['bad'] }, now)['preferredPostalCodes[0]']);
});

test('a supplied terms string is not checked against current terms by this function', () => {
  assert.deepEqual(validateAccount({ ...account(), termsDocumentId: 'not-a-current-uuid' }, now), {});
});
