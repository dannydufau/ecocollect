/*
 * Messaging topology: the one place where RabbitMQ names live.
 * Keep it in step with contracts/asyncapi.yaml (test/topology.test.js checks the queues).
 */

// One topic exchange carries every event.
const exchange = {
  name: 'ecocollect.events',
  type: 'topic',
  durable: true,
};

// RabbitMQ republishes failed messages here; no service publishes to it.
const deadLetterExchange = {
  name: 'ecocollect.dlx',
  type: 'direct',
  durable: true,
};

/*
 * Event name -> how it travels.
 *   routingKey  the key the event is published with
 *   version     envelope version; bump it for breaking payload changes
 */
const events = {
  RequestCreated: {
    routingKey: 'request.created',
    version: 2,
  },
  RequestUpdated: {
    routingKey: 'request.updated',
    version: 1,
  },
  RequestAssigned: {
    routingKey: 'request.assigned',
    version: 1,
  },
  RequestAssignmentCollected: {
    routingKey: 'request.assignment.collected',
    version: 1,
  },
  RequestAssignmentDelivered: {
    routingKey: 'request.assignment.delivered',
    version: 1,
  },
  RequestAssignmentCancelledResident: {
    routingKey: 'request.assignment.cancelled.resident',
    version: 1,
  },
  RequestAssignmentCancelledVolunteer: {
    routingKey: 'request.assignment.cancelled.volunteer',
    version: 1,
  },
  RequestAssignmentMissed: {
    routingKey: 'request.assignment.missed',
    version: 1,
  },
  RequestCancelled: {
    routingKey: 'request.cancelled',
    version: 1,
  },
  RequestExpired: {
    routingKey: 'request.expired',
    version: 1,
  },
  PointsAwardedDelivery: {
    routingKey: 'reward.points.delivery',
    version: 1,
  },
  PointsAwardedCancellation: {
    routingKey: 'reward.points.cancellation',
    version: 1,
  },
  CleanupRequest: {
    routingKey: 'cleanup.request.due',
    version: 1,
  },
  NotificationCleanupRequested: {
    routingKey: 'cleanup.notifications.due',
    version: 1,
  },
  ProfileUpdated: {
    routingKey: 'user.profile.updated',
    version: 1,
  },
  AccountDeactivated: {
    routingKey: 'user.account.deactivated',
    version: 1,
  },
};

// RabbitMQ dead-letters a message on its 5th failed delivery.
const DELIVERY_LIMIT = 4;

// One durable quorum queue per consuming service.
const queues = {
  notification: {
    name: 'notification.events',
    bindings: ['request.#', 'reward.#', 'user.#', 'cleanup.notifications.due'],
  },
  cleanup: {
    name: 'cleanup.request-events',
    bindings: ['request.created', 'request.updated', 'request.assigned', 'request.cancelled', 'request.expired'],
  },
  reward: {
    name: 'reward.request-events',
    bindings: ['request.assignment.delivered', 'request.assignment.cancelled.resident'],
  },
  request: {
    name: 'request.cleanup-events',
    bindings: ['cleanup.request.due'],
  },
};

// RabbitMQ refuses a redeclare with different arguments (PRECONDITION_FAILED).
function queueArguments(queueName) {
  return {
    'x-queue-type': 'quorum',
    'x-delivery-limit': DELIVERY_LIMIT,
    'x-dead-letter-exchange': deadLetterExchange.name,
    'x-dead-letter-routing-key': queueName,
  };
}

function deadLetterQueueName(queueName) {
  return `${queueName}.dlq`;
}

module.exports = {
  exchange,
  deadLetterExchange,
  events,
  queues,
  DELIVERY_LIMIT,
  queueArguments,
  deadLetterQueueName,
};
