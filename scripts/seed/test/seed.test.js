const test = require('node:test');
const assert = require('node:assert/strict');
const { checkData, normalizePostalCode, getSettings } = require('../settings');
const { seedDatabase } = require('../index');
const { users, categories } = require('../data');

test('all ten demo users and categories are valid; one demo user has both roles', () => {
  assert.equal(users.length, 10);
  assert.equal(categories.length, 10);
  assert.doesNotThrow(() => checkData(users, categories));
  assert.ok(users.some(u => u.roles.includes('resident') && u.roles.includes('volunteer')));
});
test('postal codes normalize correctly', () => assert.equal(normalizePostalCode('t2p 1j9'), 'T2P1J9'));
test('duplicate identities or too many preferences are rejected', () => {
  assert.throws(() => checkData([users[0], users[0]], categories), /Duplicate uid/);
  const bad = {...users[5], preferredPostalCodes: ['T2P1J9','T3A0B1','T2Y3K5','T3G1H6']};
  assert.throws(() => checkData([bad], categories), /Invalid preferred/);
});
test('no silent database password fallback', () => {
  assert.throws(() => getSettings({ FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099' }), /Missing DATABASE_URL/);
});
test('settings construct URL from .env-style parameters, including special password characters', () => {
  const settings = getSettings({POSTGRES_PASSWORD:'pa@ss:word', POSTGRES_PORT:'5433', FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'});
  assert.match(settings.databaseUrl, /pa%40ss%3Aword@127\.0\.0\.1:5433/);
});
test('database reseeding uses a transaction and conflict updates', async () => {
  const queries = [];
  const client = { query: async (sql) => {queries.push(sql); return { rows: []};}, release() {} };
  await seedDatabase({connect: async () => client});
  assert.equal(queries[0], 'BEGIN');
  assert.equal(queries.at(-1), 'COMMIT');
  assert.equal(queries.filter(q => q.includes('ON CONFLICT')).length, 20);
  assert.equal(queries.filter(q => q.startsWith('DELETE FROM volunteer_preferred')).length, 10);
});
test('database failure rolls back', async () => {
  const queries=[];
  const client={query: async(sql)=>{queries.push(sql); if(sql.includes('INSERT INTO categories')) throw Error('example failure');}, release(){}};
  await assert.rejects(() => seedDatabase({connect:async()=>client}), /example failure/);
  assert.equal(queries.at(-1), 'ROLLBACK');
});
