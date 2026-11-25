'use strict';

// Consumes E1, E2, E3, E9 and E10 and updates the expiry jobs (contract 9 and 14).

const { startSubscriber } = require('../messaging/subscriber');
const { queues } = require('../messaging/topology');
const handlers = require('./handlers');
const { saveJobChange } = require('./store');

function startConsumer({ pool, url, connect, log }) {
  const save = (event) => saveJobChange(pool, event.eventId, handlers[event.type](event));

  return startSubscriber({
    queue: queues.cleanup,
    url,
    connect,
    log,
    handlers: {
      RequestCreated: save,
      RequestUpdated: save,
      RequestAssigned: save,
      RequestCancelled: save,
      RequestExpired: save,
    },
  });
}

module.exports = { startConsumer };