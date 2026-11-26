'use strict';

// Scheduled work (contract 14.3 to 14.5): due jobs every 30 seconds, the daily run check every minute.
// A failed run is logged and does not stop the schedule.

const { fireDueJobs, requestDailyCleanup } = require('./store');

const POLL_MS = 30 * 1000;
const DAILY_CHECK_MS = 60 * 1000;
const WARN_AT_FIRES = 12;

async function pollJobs(pool, log) {
  const fired = await fireDueJobs(pool);
  for (const job of fired) {
    if (job.fire_count === WARN_AT_FIRES) {
      log.warn(`[cleanup] job still pending after ${WARN_AT_FIRES} fires, the ending event may be lost: requestId=${job.request_id} requestSeq=${job.request_seq}`);
    }
  }
  if (fired.length > 0) log.info(`[cleanup] ${fired.length} CleanupRequest written`);
}

async function checkDaily(pool, log) {
  if (await requestDailyCleanup(pool)) log.info('[cleanup] NotificationCleanupRequested written');
}

// Returns stop(), which waits for a run in progress to finish.
function startTimers(pool, { pollMs = POLL_MS, dailyMs = DAILY_CHECK_MS, log = console } = {}) {
  let stopped = false;

  function every(ms, task) {
    const loop = {};
    async function run() {
      loop.running = task().catch((err) => log.error(`[cleanup] ${err.message}`));
      await loop.running;
      if (!stopped) loop.timer = setTimeout(run, ms);
    }
    run();
    return loop;
  }

  const loops = [every(pollMs, () => pollJobs(pool, log)), every(dailyMs, () => checkDaily(pool, log))];

  return async function stop() {
    stopped = true;
    for (const loop of loops) clearTimeout(loop.timer);
    await Promise.all(loops.map((loop) => loop.running));
  };
}

module.exports = { startTimers };