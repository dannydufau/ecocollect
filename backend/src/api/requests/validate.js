const { windowStart } = require('./calgary');

const DAY_MS = 24 * 60 * 60 * 1000;

function isRealDate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  return new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);
}

function checkItem(item) {
  if (typeof item?.categoryId !== 'string' || !item.categoryId) return 'every item needs a categoryId';
  if (!Number.isInteger(item.quantity) || item.quantity < 1) return 'quantity must be a whole number, 1 or more';
  if (item.description !== undefined && typeof item.description !== 'string') return 'description must be text';
  if (item.categoryId === 'other-electronics' && !item.description?.trim()) {
    return 'other-electronics needs a description';
  }
}

function checkWindows(windows, now) {
  if (!Array.isArray(windows) || windows.length < 1 || windows.length > 3) return 'give 1 to 3 pickup windows';
  const expiresAt = new Date(now.getTime() + 30 * DAY_MS);
  for (const w of windows) {
    if (!isRealDate(w?.date)) return 'a window date must look like 2026-10-30';
    if (!Number.isInteger(w.startHour) || w.startHour < 0 || w.startHour > 23) {
      return 'startHour must be a whole number from 0 to 23';
    }
    const start = windowStart(w.date, w.startHour);
    if (start <= now) return `window ${w.date} is not in the future`;
    if (start >= expiresAt) return `window ${w.date} is after the request would expire`;
  }
  if (new Set(windows.map((w) => w.date)).size !== windows.length) return 'every window needs a different date';
}

// Returns { error } for a bad body, or { items, windows, notes } ready to store.
function parseCreate(body, now = new Date()) {
  if (typeof body !== 'object' || body === null) return { error: 'send a JSON body' };
  const { items, windows, notes, safetyAcknowledged } = body;

  if (!Array.isArray(items) || items.length < 1) return { error: 'add at least one item' };
  for (const item of items) {
    const error = checkItem(item);
    if (error) return { error };
  }
  const error = checkWindows(windows, now);
  if (error) return { error };
  if (notes !== undefined && typeof notes !== 'string') return { error: 'notes must be text' };
  if (safetyAcknowledged !== true) return { error: 'safetyAcknowledged must be true' };

  return { items, windows, notes };
}

module.exports = { parseCreate };
