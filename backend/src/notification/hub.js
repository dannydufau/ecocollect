'use strict';

/*
 * Open SSE streams per user: uid -> Set of responses (one per browser tab). In memory only.
 * A "response" is anything with write() and writableEnded, so tests can use small fakes.
 */

// One SSE message: event name, the payload as one line of JSON, blank line.
function frame(signal) {
  return `event: signal\ndata: ${JSON.stringify(signal)}\n\n`;
}

// A factory, so index.js makes the real hub and each test gets a fresh one.
function createHub() {
  const byUid = new Map();

  // A user can have several tabs.
  function add(uid, res) {
    let set = byUid.get(uid);
    if (!set) {
      set = new Set();
      byUid.set(uid, set);
    }
    set.add(res);
  }

  // Drop the user once their last tab is gone, so the map doesn't keep growing.
  function remove(uid, res) {
    const set = byUid.get(uid);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) byUid.delete(uid);
  }

  // Returns how many tabs got the signal; 0 (no tab open) is normal.
  function send(uid, signal) {
    const set = byUid.get(uid);
    if (!set) return 0;
    const text = frame(signal);
    let written = 0;
    for (const res of set) {
      // A tab can close just as a signal arrives: skip it, its 'close' handler removes it.
      if (res.writableEnded) continue;
      res.write(text);
      written += 1;
    }
    return written;
  }

  // Shutdown: end every open stream, so browsers reconnect and refetch.
  function closeAll() {
    for (const set of byUid.values()) {
      for (const res of set) {
        if (!res.writableEnded) res.end();
      }
    }
    byUid.clear();
  }

  function stats() {
    let connections = 0;
    for (const set of byUid.values()) connections += set.size;
    return { users: byUid.size, connections };
  }

  return { add, remove, send, closeAll, stats };
}

module.exports = { createHub, frame };
