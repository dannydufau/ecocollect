const ZONE = 'America/Edmonton';

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

// How far Calgary clocks are from UTC at this moment, in ms (negative, -6h in summer).
function offsetAt(instant) {
  const p = Object.fromEntries(parts.formatToParts(instant).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

// The moment a pickup window starts. The date and hour are Calgary wall-clock time.
function windowStart(date, startHour) {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, startHour);
  // The offset depends on the instant we are looking for, so guess once and correct once.
  const guess = wall - offsetAt(new Date(wall));
  return new Date(wall - offsetAt(new Date(guess)));
}

module.exports = { windowStart };
