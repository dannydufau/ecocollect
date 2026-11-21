'use strict';

// Consumes E5 and E6 and saves the points (contract 9 and 15).

const { startSubscriber } = require('../messaging/subscriber');
const { queues } = require('../messaging/topology');
const handlers = require('./handlers');
const { saveResult } = require('./store');

function startConsumer({ pool, url, connect, log }) {
  const save = (event) => saveResult(pool, event.eventId, handlers[event.type](event));

  return startSubscriber({
    queue: queues.reward,
    url,
    connect,
    log,
    handlers: {
      RequestAssignmentDelivered: save,
      RequestAssignmentCancelledResident: save,
    },
  });
}

module.exports = { startConsumer };