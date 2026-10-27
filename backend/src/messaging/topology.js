// Messaging topology: the one place where RabbitMQ names live.
// Keep this file in step with contracts/asyncapi.yaml.

// One topic exchange carries every EcoCollect event.
const exchange = {
  name: 'ecocollect.events',
  type: 'topic',
  durable: true,
};

// Event name -> how it travels.
//   routingKey  the key the event is published with
//   version     envelope version; bump it for breaking payload changes
const events = {
  RequestCreated: {
    routingKey: 'request.created',
    version: 1,
  },
};

module.exports = { exchange, events };