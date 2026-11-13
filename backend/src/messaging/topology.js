// Messaging topology: the one place where RabbitMQ names live.
// Keep this file in step with contracts/asyncapi.yaml.

// One topic exchange carries every EcoCollect event.
const exchange = {
  name: 'ecocollect.events',
  type: 'topic',
  durable: true,
};

// RabbitMQ republishes here after 5 or more failures
const deadLetterExchange = {
  name: 'ecocollect.dlx',
  type: 'direct',
  durable: true
};

// Event name -> how it travels.
//   routingKey  the key the event is published with
//   version     envelope version; bump it for breaking payload changes
const events = {
  RequestCreated: {
    routingKey: 'request.created', 
    version: 2
  },
  RequestUpdated: {
    routingKey: 'request.updated',
    version: 1
  },
  RequestAssigned: {
    routingKey: 'request.assigned',
    version: 1
  },
  RequestAssignmentCollected: {
    routingKey: 'request.assignment.collected',
    version: 1
  },
  RequestAssignmentDelivered: {
    routingKey: 'request.assignment.delivered', 
    version: 1 
  },
  RequestAssignmentCancelledResident: {
    routingKey: 'request.assignment.cancelled.resident', 
    version: 1
  },
  RequestAssignmentCancelledVolunteer: {
    routingKey: 'request.assignment.cancelled.volunteer',
    version: 1
  },
  RequestAssignmentMissed: {
    routingKey: 'request.assignment.missed',
    version: 1
  },
  RequestCancelled: {
    routingKey: 'request.cancelled',
    version: 1
  },
  RequestExpired: {
    routingKey: 'request.expired', version: 1
  },
  PointsAwardedDelivery: {
    routingKey: 'reward.points.delivery',
    version: 1
  },
  PointsAwardedCancellation: {
    routingKey: 'reward.points.cancellation',
    version: 1
  },
  CleanupRequest: {
    routingKey: 'cleanup.request.due',
    version: 1
  },
  NotificationCleanupRequested: {
    routingKey: 'cleanup.notifications.due',
    version: 1
  },
  ProfileUpdated: {
    routingKey: 'user.profile.updated',
    version: 1
  },
  AccountDeactivated: {
    routingKey: 'user.account.deactivated',
    version: 1
  },
};

// RabbitMQ dead-letters a message on its 5th failed delivery.
const DELIVERY_LIMIT = 4;

// One durable quorum queue per consuming service.
const queues = {
  notification: {
    name: 'notification.events',
    bindings: ['request.#', 'reward.#', 'user.#', 'cleanup.notifications.due']
  },
  cleanup: {
    name: 'cleanup.request-events',
    bindings: ['request.created', 'request.updated', 'request.assigned', 'request.cancelled', 'request.expired'] 
  },
  reward: {
    name: 'reward.request-events',
    bindings: ['request.assignment.delivered', 'request.assignment.cancelled.resident']
  },
  request: {
    name: 'request.cleanup-events',
    bindings: ['cleanup.request.due']
  },
};

// What a consumer queue is declared with.
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
  deadLetterQueueName
};
