const test = require('node:test');
const assert = require('node:assert');
const { windowStart } = require('../src/api/requests/calgary');

const zone = { timeZone: 'America/Edmonton' };
const clock = new Intl.DateTimeFormat('en-CA', { ...zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
const offsetName = new Intl.DateTimeFormat('en-CA', { ...zone, timeZoneName: 'longOffset' });

// What a Calgary clock shows at this instant, as "2026-10-30 14".
function wallClock(instant) {
  const p = Object.fromEntries(clock.formatToParts(instant).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}`;
}

function utcOffset(iso) {
  return offsetName.formatToParts(new Date(iso)).find((p) => p.type === 'timeZoneName').value;
}

// Whether Calgary still goes back an hour in winter depends on the timezone data in this Node build.
// Alberta moved to permanent MDT in tzdata 2026e, but older Node builds still have the clock change.
const hasWinterTime = utcOffset('2026-07-01T12:00:00Z') !== utcOffset('2027-01-15T12:00:00Z');

test('a late October window is six hours behind UTC', () => {
  assert.strictEqual(windowStart('2026-10-30', 14).toISOString(), '2026-10-30T20:00:00.000Z');
});

test('midnight and the last hour of the day land on the right day', () => {
  assert.strictEqual(windowStart('2026-10-30', 0).toISOString(), '2026-10-30T06:00:00.000Z');
  assert.strictEqual(windowStart('2026-10-30', 23).toISOString(), '2026-10-31T05:00:00.000Z');
});

// This doesn't say what the winter offset is, only that the answer reads back as the same Calgary
// date and hour, so it holds whichever rules the timezone data has. The days the clocks used to
// change (Nov 1, Mar 14) are left out because some of their hours are doubled or missing.
test('a window reads back as the same Calgary date and hour, all year', () => {
  const days = ['2026-10-31', '2026-11-02', '2026-11-27', '2027-01-15', '2027-03-13', '2027-03-15', '2027-07-01'];
  for (const date of days) {
    for (let hour = 0; hour < 24; hour++) {
      const expected = `${date} ${String(hour).padStart(2, '0')}`;
      assert.strictEqual(wallClock(windowStart(date, hour)), expected, `${date} at ${hour}:00`);
    }
  }
});

const noWinterTime = hasWinterTime ? false : 'Calgary has no winter time in this Node timezone data';

test('where Calgary still has winter time, a winter window is seven hours behind UTC', { skip: noWinterTime }, () => {
  assert.strictEqual(windowStart('2026-11-02', 14).toISOString(), '2026-11-02T21:00:00.000Z');
});

test('where Calgary still has winter time, the clocks go back on Nov 1', { skip: noWinterTime }, () => {
  assert.strictEqual(windowStart('2026-11-01', 8).toISOString(), '2026-11-01T15:00:00.000Z');
  assert.strictEqual(windowStart('2026-10-31', 8).toISOString(), '2026-10-31T14:00:00.000Z');
});
