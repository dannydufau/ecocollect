'use strict';

/*
 * Connection hub: uid -> Set of open SSE responses (one per tab). In memory only.
 * A response is anything with write() and writableEnded, so tests can use fakes.
 */

/*
 * One SSE message: optional id line, event name, the data as one line of JSON, blank line.
 * JSON.stringify never outputs a raw newline; an id with one could fake a second message.
 */
function frame(event, data, id) {
  if (id !== undefined && /[\r\n]/.test(id)) throw new Error('SSE id must be one line');
  const idLine = id === undefined ? '' : `id: ${id}\n`;
  return `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// A factory, so each test gets a fresh hub.
function createHub() {
  const byUid = new Map();

  function add(uid, res) {
    let set = byUid.get(uid);
    if (!set) {
      set = new Set();
      byUid.set(uid, set);
    }
    set.add(res);
  }

  // Drops the user once their last tab is gone, so the map doesn't grow.
  function remove(uid, res) {
    const set = byUid.get(uid);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) byUid.delete(uid);
  }

  // Returns how many tabs got the frame; 0 (no tab open) is normal.
  function send(uid, event, data, id) {
    const set = byUid.get(uid);
    if (!set) return 0;
    const text = frame(event, data, id);
    let written = 0;
    for (const res of set) {
      // A tab closing right now: skip it; its 'close' handler removes it.
      if (res.writableEnded) continue;
      res.write(text);
      written += 1;
    }
    return written;
  }

  // Shutdown: end every stream so browsers reconnect and refetch.
  function closeAll() {
    for (const set of byUid.values()) {
      for (const res of set) {
        if (!res.writableEnded) res.end();
      }
    }
    byUid.clear();
  }

  // Counts, for logs and tests.
  function stats() {
    let connections = 0;
    for (const set of byUid.values()) connections += set.size;
    return { users: byUid.size, connections };
  }

  return { add, remove, send, closeAll, stats };
}

module.exports = { createHub, frame };

