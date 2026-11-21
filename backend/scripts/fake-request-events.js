'use strict';

// Sends one fake Request Service event (E5 or E6) to RabbitMQ, so the Reward Service can be tried
// before the Request Service exists. Then prints the PointsAwarded event that comes back, if any.
//
//   node --env-file=../.env scripts/fake-request-events.js delivered
//   node --env-file=../.env scripts/fake-request-events.js late-cancel
//   node --env-file=../.env scripts/fake-request-events.js early-cancel

const amqp = require('amqplib');
const { randomUUID } = require('node:crypto');

const EXCHANGE = 'ecocollect.events';

const KINDS = {
  delivered: { type: 'RequestAssignmentDelivered', routingKey: 'request.assignment.delivered' },
  'late-cancel': { type: 'RequestAssignmentCancelledResident', routingKey: 'request.assignment.cancelled.resident', late: true },
  'early-cancel': { type: 'RequestAssignmentCancelledResident', routingKey: 'request.assignment.cancelled.resident', late: false },
};

async function main() {
  const kind = KINDS[process.argv[2]];
  if (!kind) {
    console.log(`Usage: node scripts/fake-request-events.js ${Object.keys(KINDS).join(' | ')}`);
    process.exit(1);
  }

  // Shaped like the E5 and E6 examples in contracts/asyncapi.yaml, with only the fields the Reward Service uses.
  const event = {
    eventId: randomUUID(),
    type: kind.type,
    version: 1,
    occurredAt: new Date().toISOString(),
    producer: 'request-service',
    traceId: null,
    data: {
      request: { requestId: randomUUID(), residentUid: 'demo_resident', categoryName: 'Computers/Laptops', quantity: 2, estimatedWeightKg: 5.0 },
      assignment: { assignmentId: randomUUID(), volunteerUid: 'demo_volunteer' },
    },
  };
  if (kind.late !== undefined) event.data.outsideCancellationWindow = kind.late;

  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  const channel = await connection.createConfirmChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

  async function finish(text) {
    clearTimeout(timer);
    console.log(text);
    await connection.close();
  }
  // No reply means no points were given (expected for early-cancel), or the Reward Service isn't running.
  const timer = setTimeout(() => finish('No points event came back within 5 seconds.'), 5000);

  // A temporary queue that catches what the Reward Service sends back for this assignment.
  const { queue } = await channel.assertQueue('', { exclusive: true });
  await channel.bindQueue(queue, EXCHANGE, 'reward.#');
  await channel.consume(queue, (msg) => {
    const reply = JSON.parse(msg.content.toString());
    if (reply.data.assignmentId === event.data.assignment.assignmentId) {
      finish(`Received ${reply.type}:\n${JSON.stringify(reply.data.awards, null, 2)}`);
    }
  }, { noAck: true });

  channel.publish(EXCHANGE, kind.routingKey, Buffer.from(JSON.stringify(event)), {
    persistent: true, contentType: 'application/json', messageId: event.eventId, type: event.type,
  });
  await channel.waitForConfirms();
  console.log(`Sent ${event.type} for assignment ${event.data.assignment.assignmentId}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});