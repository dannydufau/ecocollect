'use strict';

// Connection hub: which users have an SSE stream open on THIS instance.
//
//   uid -> Set of open responses (one per browser tab)
//
// In memory only. Each instance knows just its own connections, which is why
// every instance consumes every event (see messaging/subscriber.js).
//
// The hub knows nothing about Express or HTTP routing. A "response" is any
// object with write() and a writableEnded flag, so tests can use small fakes.

// One SSE message: event name, the payload as one line of JSON, blank line.
function frame(signal) {
  return `event: signal\ndata: ${JSON.stringify(signal)}\n\n`;
}

// A factory rather than one module-level hub: index.js makes the real one,
// and each test gets a fresh, empty hub.
function createHub() {
  const byUid = new Map();

  // Register one open stream for a user. A user can have several tabs.
  function add(uid, res) {
    let set = byUid.get(uid);
    if (!set) {
      set = new Set();
      byUid.set(uid, set);
    }
    set.add(res);
  }

  // Forget one stream. Drop the user entirely once their last tab is gone,
  // so the map doesn't keep growing with users who left.
  function remove(uid, res) {
    const set = byUid.get(uid);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) byUid.delete(uid);
  }

  // Write a signal to every open stream of one user. Returns how many
  // streams it was written to: 0 means the user is offline on this instance,
  // which is normal (they catch up over REST on their next load).
  function send(uid, signal) {
    const set = byUid.get(uid);
    if (!set) return 0;
    const text = frame(signal);
    let written = 0;
    for (const res of set) {
      // A tab can close just as a signal arrives; skip it rather than throw.
      // Its 'close' handler will remove it from the hub.
      if (res.writableEnded) continue;
      res.write(text);
      written += 1;
    }
    return written;
  }

  // Shutdown: end every open stream so browsers reconnect (to another
  // instance, if one is running) and refetch.
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
